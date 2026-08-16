export const PG_POOL = Symbol('PG_POOL');
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
/** The drizzle instance over the same pool as PG_POOL — `withOrganization()` needs this, the scheduler's one unscoped query (TASK-satellite-pipeline §2.4) needs the raw pool. */
export const DATABASE = Symbol('DATABASE');
export const SATELLITE_PROVIDER = Symbol('SATELLITE_PROVIDER');
export const RASTER_STORE = Symbol('RASTER_STORE');
