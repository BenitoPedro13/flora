import { Inject, Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import type { Database, Tx } from '@flora/db';
import {
  bufferedFieldInterior,
  getFarm,
  getFieldBoundaryForRefresh,
  getFieldFarmId,
  observationExists,
  recordRefreshResult,
  upsertObservationAndZones,
  withOrganization,
} from '@flora/db';
import {
  computeStats,
  decodeGeoTiff,
  detectStressZones,
  rasterObjectKey,
  renderRasterPng,
  sceneIsValid,
  type RasterStore,
} from '@flora/raster';
import { NoSceneError, type SatelliteProvider } from '@flora/satellite';
import type { ObservationIndex } from '@flora/contracts';
import {
  ROLLUP_QUEUE_NAME,
  SATELLITE_QUEUE_NAME,
  type RollupJobData,
  type SatelliteRefreshJobData,
} from '../queue/queues.js';
import { farmLocalDate } from '../rollups/rollup.processor.js';
import { DATABASE, RASTER_STORE, SATELLITE_PROVIDER } from '../tokens.js';

/** Sized against Sentinel Hub's own PU baseline (512x512px, 3 bands, <=16-bit = 1 PU) — a starting point, not a measured optimum (architecture §11.1's PU `[VERIFY]`, unresolved without a live account — §10). */
const RASTER_WIDTH_PX = 512;
const RASTER_HEIGHT_PX = 512;
/** CDSE's free-tier concurrent-request limit (architecture §11.1) — not a tuning knob. */
const WORKER_CONCURRENCY = 2;
/** Sentinel-2's ~5-day revisit means a 30-day lookback reliably finds at least one candidate scene even through a cloudy stretch. */
const SCENE_SEARCH_WINDOW_DAYS = 30;
const MAX_CLOUD_COVER_PCT = 20;
/** The §7.5 edge-buffer rule: one Sentinel-2 pixel of roadside contaminates the edge. */
const EDGE_BUFFER_METRES = 10;
const REFRESH_INDEX: ObservationIndex = 'ndvi'; // architecture §5.5: the only index on the daily schedule

function daysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The four steps of architecture §7.2, and nothing else
 * (TASK-satellite-pipeline §2.4). `NoSceneError` — thrown for "no cloud-free
 * scene" and "scene too cloudy per SCL" alike — is caught here and never
 * rethrown, so BullMQ sees a normal completion and never retries it; every
 * other error is recorded and rethrown so BullMQ's `attempts`/`backoff`
 * (queue/satellite.queue.ts) actually run.
 */
@Processor(SATELLITE_QUEUE_NAME, { concurrency: WORKER_CONCURRENCY })
export class RefreshProcessor extends WorkerHost {
  private readonly logger = new Logger(RefreshProcessor.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(SATELLITE_PROVIDER) private readonly provider: SatelliteProvider,
    @Inject(RASTER_STORE) private readonly rasterStore: RasterStore,
    @InjectQueue(ROLLUP_QUEUE_NAME) private readonly rollupQueue: Queue<RollupJobData>,
  ) {
    super();
  }

  async process(job: Job<SatelliteRefreshJobData>): Promise<void> {
    const { organizationId, fieldId } = job.data;
    await withOrganization(this.db, organizationId, async (tx) => {
      try {
        await this.runRefresh(tx, organizationId, fieldId);
      } catch (err) {
        if (err instanceof NoSceneError) {
          // A skipped date is not a failure (§6 item 5): last_refresh_at
          // moves, last_refresh_succeeded_at does not, error stays NULL.
          await recordRefreshResult(tx, organizationId, fieldId, {
            succeeded: false,
            error: null,
          });
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`refresh failed for field ${fieldId}: ${message}`);
        await recordRefreshResult(tx, organizationId, fieldId, {
          succeeded: false,
          error: message,
        });
        throw err;
      }
    });

    // Reaching here means runRefresh completed without a real error — a
    // NoSceneError skip still enqueues, since other data (crop cycles,
    // tasks) may have changed even without a new satellite scene. Never
    // reached on a real failure, which rethrows above and lets BullMQ retry
    // the satellite job without an unrelated rollup enqueue (architecture
    // §7.6, TASK-home-dashboard §2.9).
    await this.enqueueRollup(organizationId, fieldId);
  }

  /** `jobId: rollup:${farmId}:${day}` dedupes a 200-field farm's satellite wave into one rollup, not 200. */
  private async enqueueRollup(organizationId: string, fieldId: string): Promise<void> {
    await withOrganization(this.db, organizationId, async (tx) => {
      const farmId = await getFieldFarmId(tx, organizationId, fieldId);
      if (!farmId) {
        return;
      }
      const farm = await getFarm(tx, organizationId, farmId);
      if (!farm) {
        return;
      }
      const day = farmLocalDate(farm.timezone);
      await this.rollupQueue.add(
        'rollup',
        { organizationId, farmId },
        { jobId: `rollup:${farmId}:${day}` },
      );
    });
  }

  private async runRefresh(
    tx: Tx,
    organizationId: string,
    fieldId: string,
  ): Promise<void> {
    const boundary = await getFieldBoundaryForRefresh(
      tx,
      organizationId,
      fieldId,
    );
    if (!boundary) {
      // The field was deleted between enqueue and processing — nothing to
      // refresh, not a failure.
      return;
    }

    const scene = await this.provider.findLatestScene({
      bbox: boundary.bbox,
      from: daysAgo(SCENE_SEARCH_WINDOW_DAYS),
      to: today(),
      maxCloudCoverPct: MAX_CLOUD_COVER_PCT,
    });
    if (!scene) {
      throw new NoSceneError();
    }

    // The cheapest possible quota saving (§2.4 step 1): skip the Process API
    // call entirely if this exact scene date is already stored.
    if (
      await observationExists(
        tx,
        organizationId,
        fieldId,
        scene.date,
        REFRESH_INDEX,
      )
    ) {
      await recordRefreshResult(tx, organizationId, fieldId, {
        succeeded: true,
        error: null,
      });
      return;
    }

    const { indexGeotiff, sclGeotiff, bbox } =
      await this.provider.fetchIndexRaster({
        boundary: boundary.boundary,
        sceneId: scene.id,
        sceneDate: scene.date,
        index: REFRESH_INDEX,
        widthPx: RASTER_WIDTH_PX,
        heightPx: RASTER_HEIGHT_PX,
      });

    const raster = await decodeGeoTiff(indexGeotiff, sclGeotiff);
    if (!sceneIsValid(raster)) {
      throw new NoSceneError();
    }

    const stats = computeStats(raster);
    const png = await renderRasterPng(raster, stats);
    const rasterKey = rasterObjectKey(
      organizationId,
      fieldId,
      REFRESH_INDEX,
      scene.date,
    );
    await this.rasterStore.putRaster(rasterKey, png);

    const bufferedInterior = await bufferedFieldInterior(
      tx,
      organizationId,
      fieldId,
      EDGE_BUFFER_METRES,
    );
    const zones = bufferedInterior
      ? detectStressZones({ raster, bbox, bufferedInterior })
      : [];

    await upsertObservationAndZones(tx, {
      organizationId,
      fieldId,
      capturedOn: scene.date,
      index: REFRESH_INDEX,
      stats,
      rasterKey,
      bbox,
      sceneId: scene.id,
      zones,
      windowStart: daysAgo(SCENE_SEARCH_WINDOW_DAYS),
      windowEnd: scene.date,
    });
    await recordRefreshResult(tx, organizationId, fieldId, {
      succeeded: true,
      error: null,
    });
  }
}
