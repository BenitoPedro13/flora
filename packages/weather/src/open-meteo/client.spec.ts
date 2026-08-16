import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { WeatherRateLimitedError } from "../errors.js";
import { fetchOpenMeteoDaily, FORECAST_DAYS, OPEN_METEO_DEFAULT_BASE_URL, parseDailyResponse } from "./client.js";

/**
 * A real response captured live against the free, keyless Open-Meteo API,
 * 2026-08-16, for the demo farm's Manaus coordinates — architecture §13:
 * replay real bytes, not a hand-built mock, same pattern as `packages/satellite`.
 */
const REAL_FORECAST_RESPONSE = readFileSync(
  fileURLToPath(new URL("../../test/fixtures/open-meteo-daily-forecast-2026-08-16.json", import.meta.url)),
  "utf8",
);

describe("fetchOpenMeteoDaily", () => {
  it("requests the verified daily parameter names against the default base URL", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(REAL_FORECAST_RESPONSE, { status: 200 }));

    await fetchOpenMeteoDaily(
      { latitude: -4.58, longitude: -59.13, timezone: "America/Manaus" },
      fetchImpl,
    );

    const [urlArg] = fetchImpl.mock.calls[0]!;
    const url = new URL(urlArg as string);
    expect(url.origin + url.pathname).toBe(OPEN_METEO_DEFAULT_BASE_URL);
    expect(url.searchParams.get("daily")).toBe(
      "temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,wind_speed_10m_max,uv_index_max,sunrise,sunset",
    );
    expect(url.searchParams.get("timezone")).toBe("America/Manaus");
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
  it("splits the real captured response's parallel arrays into 8 ordered days, today first", () => {
    const response = JSON.parse(REAL_FORECAST_RESPONSE) as Parameters<typeof parseDailyResponse>[0];
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
    });
    expect(days[7]!.date).toBe("2026-08-23");
  });
});
