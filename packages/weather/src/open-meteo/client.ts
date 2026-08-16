import type { WeatherHour, WeatherSnapshotPayload } from "@flora/contracts";
import { WeatherError, WeatherRateLimitedError } from "../errors.js";

/**
 * Parameter names verified against Open-Meteo's current docs, 2026-08-16
 * (architecture §11.3's `[VERIFY]`, resolved): `weather_code` (not the older
 * `weathercode`), `wind_speed_10m_max` (not `windspeed_10m_max`). Base URL,
 * no API key for non-commercial use, `timezone=auto` accepts an IANA name
 * directly.
 *
 * **TASK-weather §2.1**: two more daily parameters and a full `hourly=`
 * block, all verified against a *live* response at this project's own farm
 * coordinates (Alexânia, Goiás — see `test/fixtures/open-meteo-hourly-forecast-*.json`),
 * not against docs alone. `pressure_msl`, not `surface_pressure` — §7
 * decision 5: at this farm's 1,132m elevation, `surface_pressure` reads
 * 889-898 hPa against `pressure_msl`'s 1016-1018, so only mean-sea-level
 * pressure supports one fixed dial band regardless of a farm's altitude.
 * Wind is `km/h` by default, unprompted (`hourly_units.wind_speed_10m`).
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
  "precipitation_probability_max",
  "wind_direction_10m_dominant",
].join(",");

const HOURLY_PARAMS = [
  "temperature_2m",
  "wind_speed_10m",
  "wind_direction_10m",
  "pressure_msl",
  "uv_index",
  "precipitation_probability",
].join(",");

/** Today + 7 days ahead — matches `weather_horizon`'s `"0"`..`"7"` (schema/rollup.ts). */
export const FORECAST_DAYS = 8;

interface OpenMeteoDailyBlock {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  weather_code: number[];
  precipitation_sum: number[];
  wind_speed_10m_max: number[];
  uv_index_max?: number[];
  sunrise?: string[];
  sunset?: string[];
  precipitation_probability_max?: number[];
  wind_direction_10m_dominant?: number[];
}

/**
 * `forecast_days * 24` flat entries (192 for `forecast_days=8`), confirmed
 * against a live response — local ISO strings with no zone suffix
 * ("2026-08-16T00:00"). Do not assume 24 entries per calendar day: a DST
 * transition produces 23 or 25 (§8 risk 3) — `groupHourlyByDate` derives
 * grouping from the timestamps themselves, never an index calculation.
 */
interface OpenMeteoHourlyBlock {
  time: string[];
  temperature_2m?: number[];
  wind_speed_10m?: number[];
  wind_direction_10m?: number[];
  pressure_msl?: number[];
  uv_index?: number[];
  precipitation_probability?: number[];
}

interface OpenMeteoDailyResponse {
  daily: OpenMeteoDailyBlock;
  hourly?: OpenMeteoHourlyBlock;
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
  url.searchParams.set("hourly", HOURLY_PARAMS);
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

/**
 * Splits the `hourly` block's flat, parallel arrays into one array per
 * calendar day, keyed by the `YYYY-MM-DD` prefix of each ISO timestamp — not
 * by dividing the index by 24, which breaks on a DST farm (§8 risk 3).
 */
export function groupHourlyByDate(hourly: OpenMeteoHourlyBlock): Map<string, WeatherHour[]> {
  const byDate = new Map<string, WeatherHour[]>();
  hourly.time.forEach((time, i) => {
    const date = time.slice(0, 10);
    const hour: WeatherHour = {
      time,
      temperatureC: hourly.temperature_2m?.[i],
      windSpeedKmh: hourly.wind_speed_10m?.[i],
      windDirectionDeg: hourly.wind_direction_10m?.[i],
      pressureMslHpa: hourly.pressure_msl?.[i],
      uvIndex: hourly.uv_index?.[i],
      precipProbabilityPct: hourly.precipitation_probability?.[i],
    };
    const bucket = byDate.get(date);
    if (bucket) {
      bucket.push(hour);
    } else {
      byDate.set(date, [hour]);
    }
  });
  return byDate;
}

/**
 * Splits the `daily` block's parallel arrays into one payload per day, in
 * order (today first), attaching each day's slice of the `hourly` block when
 * present. A response with no `hourly` block (every row written before
 * TASK-weather) parses exactly as it did before — `hours` is simply absent.
 */
export function parseDailyResponse(response: OpenMeteoDailyResponse): WeatherSnapshotPayload[] {
  const { daily, hourly } = response;
  const hoursByDate = hourly ? groupHourlyByDate(hourly) : undefined;
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
    precipProbabilityMaxPct: daily.precipitation_probability_max?.[i],
    windDirectionDominantDeg: daily.wind_direction_10m_dominant?.[i],
    hours: hoursByDate?.get(date),
  }));
}
