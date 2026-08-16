import type { WeatherSnapshotPayload } from "@flora/contracts";
import { WeatherError, WeatherRateLimitedError } from "../errors.js";

/**
 * Parameter names verified against Open-Meteo's current docs, 2026-08-16
 * (architecture §11.3's `[VERIFY]`, resolved): `weather_code` (not the older
 * `weathercode`), `wind_speed_10m_max` (not `windspeed_10m_max`). Base URL,
 * no API key for non-commercial use, `timezone=auto` accepts an IANA name
 * directly.
 */
export const OPEN_METEO_DEFAULT_BASE_URL = "https://api.open-meteo.com/v1/forecast";

const DAILY_PARAMS = [
  "temperature_2m_max",
  "temperature_2m_min",
  "weather_code",
  "precipitation_sum",
  "wind_speed_10m_max",
  "uv_index_max",
  "sunrise",
  "sunset",
].join(",");

/** Today + 7 days ahead — matches `weather_horizon`'s `"0"`..`"7"` (schema/rollup.ts). */
export const FORECAST_DAYS = 8;

interface OpenMeteoDailyResponse {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
    precipitation_sum: number[];
    wind_speed_10m_max: number[];
    uv_index_max?: number[];
    sunrise?: string[];
    sunset?: string[];
  };
}

export interface FetchOpenMeteoDailyInput {
  latitude: number;
  longitude: number;
  timezone: string;
  baseUrl?: string;
}

/** The HTTP conversation with Open-Meteo, nothing else — parsing lives in `parseDailyResponse`. */
export async function fetchOpenMeteoDaily(
  input: FetchOpenMeteoDailyInput,
  fetchImpl: typeof fetch = fetch,
): Promise<OpenMeteoDailyResponse> {
  const url = new URL(input.baseUrl ?? OPEN_METEO_DEFAULT_BASE_URL);
  url.searchParams.set("latitude", String(input.latitude));
  url.searchParams.set("longitude", String(input.longitude));
  url.searchParams.set("daily", DAILY_PARAMS);
  url.searchParams.set("timezone", input.timezone);
  url.searchParams.set("forecast_days", String(FORECAST_DAYS));

  const res = await fetchImpl(url.toString());
  if (res.status === 429) {
    throw new WeatherRateLimitedError();
  }
  if (!res.ok) {
    throw new WeatherError(`Open-Meteo returned ${res.status}`);
  }
  return (await res.json()) as OpenMeteoDailyResponse;
}

/** Splits the `daily` block's parallel arrays into one payload per day, in order (today first). */
export function parseDailyResponse(response: OpenMeteoDailyResponse): WeatherSnapshotPayload[] {
  const { daily } = response;
  return daily.time.map((date, i) => ({
    date,
    tempMaxC: daily.temperature_2m_max[i]!,
    tempMinC: daily.temperature_2m_min[i]!,
    weatherCode: daily.weather_code[i]!,
    precipitationMm: daily.precipitation_sum[i]!,
    windSpeedMaxKmh: daily.wind_speed_10m_max[i]!,
    uvIndexMax: daily.uv_index_max?.[i],
    sunrise: daily.sunrise?.[i],
    sunset: daily.sunset?.[i],
  }));
}
