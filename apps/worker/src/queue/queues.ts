export const SATELLITE_QUEUE_NAME = 'satellite';

/** One job per (org, field) refresh — always NDVI (architecture §5.5: only NDVI is on the daily schedule; other indices are implemented in `evalscript.ts` but not wired to a request path yet). */
export interface SatelliteRefreshJobData {
  organizationId: string;
  fieldId: string;
}

export const ROLLUP_QUEUE_NAME = 'rollups';

/**
 * One job per (org, farm) — TASK-home-dashboard §2.9. No `day` in the job
 * data: the processor derives "today" itself, farm-locally, at process
 * time (`farmLocalDate`) — a fixed `day` baked into a repeatable Job
 * Scheduler's template would go stale after its first fire. Deduplicated
 * on demand by `jobId: rollup:${farmId}:${day}` (the caller's own farm-local
 * day) so a 200-field farm's satellite wave produces one rollup, not 200.
 */
export interface RollupJobData {
  organizationId: string;
  farmId: string;
}

export const WEATHER_QUEUE_NAME = 'weather';

/** One hourly job per farm — TASK-home-dashboard §2.6. */
export interface WeatherIngestJobData {
  organizationId: string;
  farmId: string;
}
