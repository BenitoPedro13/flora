import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ListObservationDatesQuery,
  ListObservationsQuery,
  Observation,
  ObservationDates,
  RefreshAccepted,
  RefreshJobState,
  RefreshJobStatus,
} from '@flora/contracts';
import type { Tx } from '@flora/db';
import { fieldExists, listObservationDates, listObservations } from '@flora/db';
import type { JobState, Queue } from 'bullmq';
import { rasterUrl } from './raster-url.js';
import {
  REFRESH_QUEUE,
  type SatelliteRefreshJobData,
} from './refresh-queue.provider.js';

/**
 * BullMQ's `JobState` has more granularity (`delayed`, `prioritized`,
 * `waiting-children`) than the screen needs to distinguish — all three still
 * mean "not started yet", so they collapse to `waiting`.
 */
function toRefreshJobState(state: JobState | 'unknown'): RefreshJobState {
  switch (state) {
    case 'completed':
    case 'failed':
    case 'active':
    case 'waiting':
      return state;
    case 'delayed':
    case 'prioritized':
    case 'waiting-children':
      return 'waiting';
    default:
      return 'unknown';
  }
}

/**
 * No SQL here (invariant 5) — every call takes the `Tx` `TenantTx()` handed
 * the controller, 404s come from `fieldExists` returning false, never a
 * caught RLS error (NFR-7).
 */
@Injectable()
export class ObservationsService {
  constructor(
    @Inject(REFRESH_QUEUE)
    private readonly queue: Queue<SatelliteRefreshJobData>,
  ) {}

  async list(
    tx: Tx,
    organizationId: string,
    fieldId: string,
    query: ListObservationsQuery,
  ): Promise<Observation[]> {
    if (!(await fieldExists(tx, organizationId, fieldId))) {
      throw new NotFoundException();
    }
    const rows = await listObservations(tx, organizationId, fieldId, {
      index: query.index,
      from: query.from,
      to: query.to,
    });
    return rows.map((row) => ({
      fieldId: row.fieldId,
      capturedOn: row.capturedOn,
      index: row.index,
      stats: row.stats,
      bbox: row.bbox,
      rasterUrl: rasterUrl(row.rasterKey),
      sceneId: row.sceneId,
    }));
  }

  async listDates(
    tx: Tx,
    organizationId: string,
    fieldId: string,
    query: ListObservationDatesQuery,
  ): Promise<ObservationDates> {
    if (!(await fieldExists(tx, organizationId, fieldId))) {
      throw new NotFoundException();
    }
    return listObservationDates(tx, organizationId, fieldId, query.index);
  }

  /**
   * A BullMQ **producer** — a Redis `LPUSH`, sub-millisecond, no HTTP to
   * CDSE (invariant 1). The job runs in the worker; enqueueing is not
   * calling.
   */
  async refresh(
    tx: Tx,
    organizationId: string,
    fieldId: string,
  ): Promise<RefreshAccepted> {
    if (!(await fieldExists(tx, organizationId, fieldId))) {
      throw new NotFoundException();
    }
    const job = await this.queue.add('refresh', { organizationId, fieldId });
    return { jobId: job.id! };
  }

  /**
   * `fieldExists` first (404 for a foreign field, NFR-7), **then**
   * `queue.getJob`, **then** an assertion that the job belongs to this org —
   * a raw job id is guessable in a way a field id inside an RLS-scoped query
   * is not, so it gets its own check and also returns 404, never 403
   * (TASK-crop-stress §2.4). A missing job is `state: "unknown"`, not 404:
   * the id was valid, the record simply aged out of BullMQ's retention caps.
   */
  async jobStatus(
    tx: Tx,
    organizationId: string,
    fieldId: string,
    jobId: string,
  ): Promise<RefreshJobStatus> {
    if (!(await fieldExists(tx, organizationId, fieldId))) {
      throw new NotFoundException();
    }
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return { jobId, state: 'unknown', failedReason: null };
    }
    if (job.data.organizationId !== organizationId) {
      throw new NotFoundException();
    }
    const state = await job.getState();
    return {
      jobId,
      state: toRefreshJobState(state),
      failedReason: job.failedReason ?? null,
    };
  }
}
