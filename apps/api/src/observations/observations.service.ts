import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ListObservationDatesQuery,
  ListObservationsQuery,
  Observation,
  ObservationDates,
  RefreshAccepted,
} from '@flora/contracts';
import type { Tx } from '@flora/db';
import { fieldExists, listObservationDates, listObservations } from '@flora/db';
import type { Queue } from 'bullmq';
import { rasterUrl } from './raster-url.js';
import {
  REFRESH_QUEUE,
  type SatelliteRefreshJobData,
} from './refresh-queue.provider.js';

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
}
