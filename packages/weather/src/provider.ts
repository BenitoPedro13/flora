import type { WeatherSnapshotPayload } from "@flora/contracts";

/**
 * Mirrors `packages/satellite`'s shape (TASK-home-dashboard §2.6): one
 * interface, two implementations — `OpenMeteoProvider` (real) and
 * `FixtureWeatherProvider` (replays a recorded response, what makes the
 * worker's ingest job testable offline).
 */

export interface FetchDailyForecastInput {
  latitude: number;
  longitude: number;
  /** IANA timezone — the farm's own (`farms.timezone`), never the server's. */
  timezone: string;
}

/**
 * Today first, index `i` is `i` days ahead — the worker job assigns
 * `horizon = String(i)` when it writes one row per element (§2.6, schema/rollup.ts).
 */
export type FetchDailyForecastResult = WeatherSnapshotPayload[];

export interface WeatherProvider {
  fetchDailyForecast(input: FetchDailyForecastInput): Promise<FetchDailyForecastResult>;
}
