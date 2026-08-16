import { fetchOpenMeteoDaily, parseDailyResponse } from "./open-meteo/client.js";
import type { FetchDailyForecastInput, FetchDailyForecastResult, WeatherProvider } from "./provider.js";

/** The real `WeatherProvider` (§2.6) — HTTP conversation with Open-Meteo, nothing else. */
export class OpenMeteoProvider implements WeatherProvider {
  constructor(private readonly baseUrl?: string) {}

  async fetchDailyForecast(input: FetchDailyForecastInput): Promise<FetchDailyForecastResult> {
    const response = await fetchOpenMeteoDaily({
      latitude: input.latitude,
      longitude: input.longitude,
      timezone: input.timezone,
      baseUrl: this.baseUrl,
    });
    return parseDailyResponse(response);
  }
}
