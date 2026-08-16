import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { WeatherRateLimitedError } from "../errors.js";
import {
  fetchOpenMeteoDaily,
  FORECAST_DAYS,
  groupHourlyByDate,
  OPEN_METEO_DEFAULT_BASE_URL,
  parseDailyResponse,
} from "./client.js";

/**
 * A real response captured live against the free, keyless Open-Meteo API,
 * 2026-08-16, for the demo farm's old Manaus coordinates — architecture §13:
 * replay real bytes, not a hand-built mock, same pattern as `packages/satellite`.
 * Kept exactly as originally captured (no `hourly` block) — its whole job now
 * is proving `parseDailyResponse` still handles a response shaped like every
 * row already in `weather_snapshots` before TASK-weather (§2.1).
 */
const DAILY_ONLY_RESPONSE = readFileSync(
  fileURLToPath(new URL("../../test/fixtures/open-meteo-daily-forecast-2026-08-16.json", import.meta.url)),
  "utf8",
);

/**
 * A real response captured live 2026-08-16 at this project's own farm
 * coordinates (Alexânia, Goiás, -15.94/-48.59, America/Sao_Paulo — the
 * farm's corrected location, task doc §10), with the full TASK-weather §2.1
 * parameter set: two more daily params, plus the `hourly` block.
 */
const HOURLY_RESPONSE = readFileSync(
  fileURLToPath(new URL("../../test/fixtures/open-meteo-hourly-forecast-2026-08-16.json", import.meta.url)),
  "utf8",
);

describe("fetchOpenMeteoDaily", () => {
  it("requests the verified daily and hourly parameter names against the default base URL", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(HOURLY_RESPONSE, { status: 200 }));

    await fetchOpenMeteoDaily(
      { latitude: -15.94, longitude: -48.59, timezone: "America/Sao_Paulo" },
      fetchImpl,
    );

    const [urlArg] = fetchImpl.mock.calls[0]!;
    const url = new URL(urlArg as string);
    expect(url.origin + url.pathname).toBe(OPEN_METEO_DEFAULT_BASE_URL);
    expect(url.searchParams.get("daily")).toBe(
      "temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,wind_speed_10m_max,uv_index_max,sunrise,sunset,precipitation_probability_max,wind_direction_10m_dominant",
    );
    expect(url.searchParams.get("hourly")).toBe(
      "temperature_2m,wind_speed_10m,wind_direction_10m,pressure_msl,uv_index,precipitation_probability",
    );
    expect(url.searchParams.get("timezone")).toBe("America/Sao_Paulo");
    expect(url.searchParams.get("forecast_days")).toBe(String(FORECAST_DAYS));
  });

  it("throws WeatherRateLimitedError on 429", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("", { status: 429 }));
    await expect(
      fetchOpenMeteoDaily({ latitude: 0, longitude: 0, timezone: "UTC" }, fetchImpl),
    ).rejects.toBeInstanceOf(WeatherRateLimitedError);
  });
});

describe("parseDailyResponse", () => {
  it("splits the daily-only fixture (no hourly block) into 8 ordered days with no `hours`", () => {
    const response = JSON.parse(DAILY_ONLY_RESPONSE) as Parameters<typeof parseDailyResponse>[0];
    const days = parseDailyResponse(response);

    expect(days).toHaveLength(FORECAST_DAYS);
    expect(days[0]).toEqual({
      date: "2026-08-16",
      tempMaxC: 34.5,
      tempMinC: 24.2,
      weatherCode: 51,
      precipitationMm: 0.2,
      windSpeedMaxKmh: 12.1,
      uvIndexMax: 8.25,
      sunrise: "2026-08-16T06:01",
      sunset: "2026-08-16T17:59",
      precipProbabilityMaxPct: undefined,
      windDirectionDominantDeg: undefined,
      hours: undefined,
    });
    expect(days[7]!.date).toBe("2026-08-23");
  });

  it("splits the real hourly capture into 8 days, each carrying its own 24-hour `hours` series", () => {
    const response = JSON.parse(HOURLY_RESPONSE) as Parameters<typeof parseDailyResponse>[0];
    const days = parseDailyResponse(response);

    expect(days).toHaveLength(FORECAST_DAYS);
    const today = days[0]!;
    expect(today.date).toBe("2026-08-16");
    expect(today.tempMaxC).toBe(30.9);
    expect(today.precipProbabilityMaxPct).toBe(0);
    expect(today.windDirectionDominantDeg).toBe(75);
    expect(today.hours).toHaveLength(24);
    expect(today.hours![0]).toEqual({
      time: "2026-08-16T00:00",
      temperatureC: 22.0,
      windSpeedKmh: 12.1,
      windDirectionDeg: 85,
      pressureMslHpa: 1017.6,
      uvIndex: 0,
      precipProbabilityPct: 0,
    });

    // Every hour across all 8 days is accounted for — 192 entries, none lost
    // and none duplicated across the day boundaries.
    const totalHours = days.reduce((sum, d) => sum + (d.hours?.length ?? 0), 0);
    expect(totalHours).toBe(192);
  });
});

describe("groupHourlyByDate", () => {
  it("derives day boundaries from the timestamps, not from a fixed 24-per-day index — a DST spring-forward day has 23", () => {
    // 2026-03-08 America/Chicago spring-forward: 02:00 is skipped, so the
    // local calendar day has 23 hours. A farm timezone with real DST (unlike
    // this project's own America/Sao_Paulo, §8 risk 3) looks like this.
    const time = [
      "2026-03-07T23:00",
      "2026-03-08T00:00",
      "2026-03-08T01:00",
      "2026-03-08T03:00", // 02:00 does not exist this day
      "2026-03-08T04:00",
      "2026-03-09T00:00",
    ];
    const byDate = groupHourlyByDate({ time });

    expect(byDate.get("2026-03-07")).toHaveLength(1);
    expect(byDate.get("2026-03-08")).toHaveLength(4);
    expect(byDate.get("2026-03-09")).toHaveLength(1);
  });
});
