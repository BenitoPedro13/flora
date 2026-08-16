import { Inject, Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import type { Database, Tx } from '@flora/db';
import {
  allObservationsExist,
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
  decodeTrueColorGeoTiff,
  detectStressZones,
  rasterObjectKey,
  renderRasterPng,
  renderTrueColorPng,
  sceneIsValid,
  type RasterStore,
} from '@flora/raster';
import { NoSceneError, type SatelliteProvider } from '@flora/satellite';
import { scalarIndexValues, type ObservationIndex, type ObservationStats, type ScalarIndex } from '@flora/contracts';
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
/**
 * All ten scalar indices, one Process call (`TASK-spectral-indices` §2.1,
 * §7 decision 6 — the product owner's call: all of them, daily, at +17% PU
 * with no change in request count, measured against the live account §1.3).
 * `NDVI_INDEX` must be a member of this list — it's the one scene validity
 * and stress detection key off (§2.4: detection stays NDVI-only). The skip
 * check itself covers every member of this list, not just NDVI (found
 * live, a same-day follow-on: a field with only an NDVI row from before
 * this task's ten-index bulk call must not silently block the other nine
 * from ever backfilling for that scene date).
 */
const REFRESH_INDICES: readonly ScalarIndex[] = scalarIndexValues;
const NDVI_INDEX: ScalarIndex = 'ndvi';
const TRUE_COLOR_INDEX: ObservationIndex = 'true_color';
/**
 * `observations.stats` is `NOT NULL` and every scalar index has a real one —
 * true-colour has none (§2.2: it's a renderable layer, not a scalar index),
 * so this degenerate, all-zero placeholder ships instead of a schema
 * change. Nothing reads it: `ColorRampLegend` is never rendered for
 * `true_color` (`apps/web/app/(app)/fields/[fieldId]/stress/stress-panel.tsx`).
 */
const TRUE_COLOR_PLACEHOLDER_STATS: ObservationStats = { min: 0, max: 0, mean: 0, stddev: 0, p10: 0, p90: 0 };

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
    const { organizationId, fieldId, mode } = job.data;
    const isTrueColor = mode === 'true_color';

    await withOrganization(this.db, organizationId, async (tx) => {
      try {
        if (isTrueColor) {
          await this.runTrueColorRefresh(tx, organizationId, fieldId);
        } else {
          await this.runRefresh(tx, organizationId, fieldId);
        }
      } catch (err) {
        if (err instanceof NoSceneError) {
          // A skipped date is not a failure (§6 item 5): last_refresh_at
          // moves, last_refresh_succeeded_at does not, error stays NULL.
          // True-colour never touches these fields at all (below) — a photo
          // isn't the crop-health signal NFR-8's stale badge tracks.
          if (!isTrueColor) {
            await recordRefreshResult(tx, organizationId, fieldId, {
              succeeded: false,
              error: null,
            });
          }
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`refresh failed for field ${fieldId}: ${message}`);
        if (!isTrueColor) {
          await recordRefreshResult(tx, organizationId, fieldId, {
            succeeded: false,
            error: message,
          });
        }
        throw err;
      }
    });

    if (isTrueColor) {
      // A photo has no bearing on Home's rollups (Regeneration Score, crop
      // health) — nothing there changed, so nothing to recompute.
      return;
    }

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
    // call entirely if this exact scene date is already stored — but only
    // once *every* scalar index has a row for it. A field with an NDVI row
    // from before this task's ten-index bulk call (or an interrupted
    // partial refresh) must not silently block the other nine from ever
    // backfilling for that scene date — found live, a same-day follow-on.
    if (
      await allObservationsExist(
        tx,
        organizationId,
        fieldId,
        scene.date,
        REFRESH_INDICES,
      )
    ) {
      await recordRefreshResult(tx, organizationId, fieldId, {
        succeeded: true,
        error: null,
      });
      return;
    }

    const { indexGeotiffs, sclGeotiff, bbox } =
      await this.provider.fetchAllIndexRasters({
        boundary: boundary.boundary,
        sceneId: scene.id,
        sceneDate: scene.date,
        indices: REFRESH_INDICES,
        widthPx: RASTER_WIDTH_PX,
        heightPx: RASTER_HEIGHT_PX,
      });

    // NDVI decides scene validity for the whole refresh — SCL (and the
    // boundary-clip nodata footprint it shares with every other index, all
    // requested against the same geometry in the same call) doesn't vary by
    // index, so checking it once here is equivalent to checking it per index
    // and ten times cheaper.
    const ndviGeotiff = indexGeotiffs.get(NDVI_INDEX);
    if (!ndviGeotiff) {
      // The provider throws before returning if any requested member is
      // missing from the TAR — this is unreachable in practice, only here so
      // the type checker doesn't need a non-null assertion.
      throw new NoSceneError();
    }
    const ndviRaster = await decodeGeoTiff(ndviGeotiff, sclGeotiff);
    if (!sceneIsValid(ndviRaster)) {
      throw new NoSceneError();
    }

    const bufferedInterior = await bufferedFieldInterior(
      tx,
      organizationId,
      fieldId,
      EDGE_BUFFER_METRES,
    );

    for (const index of REFRESH_INDICES) {
      const raster =
        index === NDVI_INDEX
          ? ndviRaster
          : await decodeGeoTiff(indexGeotiffs.get(index)!, sclGeotiff);

      const stats = computeStats(raster, index);
      const png = await renderRasterPng(raster, stats, index);
      const rasterKey = rasterObjectKey(organizationId, fieldId, index, scene.date);
      await this.rasterStore.putRaster(rasterKey, png);

      // Stress detection stays NDVI-only (§2.4) — running the polygon
      // detector over, say, NDWI would produce "stress zones" wherever
      // there is water.
      const zones =
        index === NDVI_INDEX && bufferedInterior
          ? detectStressZones({ raster, bbox, bufferedInterior })
          : [];

      await upsertObservationAndZones(tx, {
        organizationId,
        fieldId,
        capturedOn: scene.date,
        index,
        stats,
        rasterKey,
        bbox,
        sceneId: scene.id,
        zones,
        windowStart: daysAgo(SCENE_SEARCH_WINDOW_DAYS),
        windowEnd: scene.date,
      });
    }

    await recordRefreshResult(tx, organizationId, fieldId, {
      succeeded: true,
      error: null,
    });
  }

  /**
   * The on-demand-only true-colour path (§2.5, built as a same-day
   * follow-on to `TASK-spectral-indices`) — one 3-band RGB fetch, no
   * stats, no detection, no `recordRefreshResult` (a photo isn't NFR-8's
   * crop-health signal). Reuses `upsertObservationAndZones` with an empty
   * zone list purely to reuse the one write path already trusted with the
   * `(field, date, index)` upsert, not because true-colour has zones.
   */
  private async runTrueColorRefresh(
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

    if (
      await observationExists(
        tx,
        organizationId,
        fieldId,
        scene.date,
        TRUE_COLOR_INDEX,
      )
    ) {
      return;
    }

    const { rgbGeotiff, sclGeotiff, bbox } = await this.provider.fetchTrueColorRaster({
      boundary: boundary.boundary,
      sceneId: scene.id,
      sceneDate: scene.date,
      widthPx: RASTER_WIDTH_PX,
      heightPx: RASTER_HEIGHT_PX,
    });

    const raster = await decodeTrueColorGeoTiff(rgbGeotiff, sclGeotiff);
    const png = await renderTrueColorPng(raster);
    const rasterKey = rasterObjectKey(organizationId, fieldId, TRUE_COLOR_INDEX, scene.date);
    await this.rasterStore.putRaster(rasterKey, png);

    await upsertObservationAndZones(tx, {
      organizationId,
      fieldId,
      capturedOn: scene.date,
      index: TRUE_COLOR_INDEX,
      stats: TRUE_COLOR_PLACEHOLDER_STATS,
      rasterKey,
      bbox,
      sceneId: scene.id,
      zones: [],
      windowStart: daysAgo(SCENE_SEARCH_WINDOW_DAYS),
      windowEnd: scene.date,
    });
  }
}
