import { Queue } from 'bullmq';

/**
 * The **only** satellite-queue touchpoint in `apps/api` (invariant 1,
 * TASK-satellite-pipeline §2.7): a raw BullMQ `Queue` producer, not
 * `@nestjs/bullmq`'s full module (that would pull in worker machinery this
 * app never runs). This module never imports the CDSE HTTP client package —
 * `POST /fields/:id/observations/refresh` is a Redis `LPUSH`,
 * sub-millisecond, no HTTP to a satellite provider.
 * `apps/worker/src/queue/queues.ts` owns the same queue name and job-data
 * shape; this file has no import relationship to that one, so the name and
 * shape are duplicated here on purpose rather than pulled from `apps/worker`
 * — apps don't import each other (§4's tree).
 */
export const SATELLITE_QUEUE_NAME = 'satellite';
export const REFRESH_QUEUE = Symbol('REFRESH_QUEUE');

export interface SatelliteRefreshJobData {
  organizationId: string;
  fieldId: string;
}

export function createRefreshQueue(): Queue<SatelliteRefreshJobData> {
  const url = new URL(process.env.REDIS_URL!);
  return new Queue<SatelliteRefreshJobData>(SATELLITE_QUEUE_NAME, {
    connection: { host: url.hostname, port: Number(url.port || 6379) },
  });
}
