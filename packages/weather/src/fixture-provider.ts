import type { WeatherSnapshotPayload } from "@flora/contracts";
import type { FetchDailyForecastInput, FetchDailyForecastResult, WeatherProvider } from "./provider.js";

/** Replays a supplied fixture instead of calling Open-Meteo — what makes the worker's ingest job testable offline (§2.6, same pattern as `packages/satellite`'s `FixtureSatelliteProvider`). */
export class FixtureWeatherProvider implements WeatherProvider {
  constructor(private readonly days: WeatherSnapshotPayload[]) {}

  async fetchDailyForecast(_input: FetchDailyForecastInput): Promise<FetchDailyForecastResult> {
    return this.days;
  }
}
