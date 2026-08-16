export const SATELLITE_QUEUE_NAME = 'satellite';

/** One job per (org, field) refresh — always NDVI (architecture §5.5: only NDVI is on the daily schedule; other indices are implemented in `evalscript.ts` but not wired to a request path yet). */
export interface SatelliteRefreshJobData {
  organizationId: string;
  fieldId: string;
}
