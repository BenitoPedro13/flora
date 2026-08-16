import { z } from "zod";

/**
 * TASK-weather §2.2 — moved out of `dashboard.ts` now that a weather domain
 * exists beyond Home's two-day read. Re-exported from `dashboard.ts` so no
 * existing import breaks.
 */

// ---------------------------------------------------------------------------
// `weather_snapshots.horizon` — forecast lead in days from the ingestion run
// named by `observed_at`. `"0"` is today, `"1"` is tomorrow (Home's two
// reads); `"2"`-`"7"` are fetched and stored in the same Open-Meteo call and
// read by the Weather screen (`GET /farms/:id/weather`).
// ---------------------------------------------------------------------------

export const weatherHorizonValues = ["0", "1", "2", "3", "4", "5", "6", "7"] as const;
export const weatherHorizonSchema = z.enum(weatherHorizonValues);
export type WeatherHorizon = z.infer<typeof weatherHorizonSchema>;

// ---------------------------------------------------------------------------
// One hour of Open-Meteo's `hourly` block (TASK-weather §2.1/§2.2). All
// parameter names and units verified 2026-08-16 against a live response at
// this project's own farm coordinates — no `[VERIFY]` remains. `pressureMslHpa`
// names the field after the parameter actually requested — `pressure_msl`,
// not `surface_pressure` (§7 decision 5): the farm sits at 1,132m, where
// `surface_pressure` reads 889-898 hPa against `pressure_msl`'s 1016-1018,
// so only mean-sea-level pressure supports one fixed dial band everywhere.
// ---------------------------------------------------------------------------

export const weatherHourSchema = z.object({
  // Open-Meteo's local-time ISO strings ("2026-08-16T06:00") aren't full
  // RFC3339 — no offset, no seconds — so this stays a plain string rather
  // than z.iso.datetime(), which would reject them.
  time: z.string(),
  temperatureC: z.number().optional(),
  windSpeedKmh: z.number().nonnegative().optional(),
  windDirectionDeg: z.number().min(0).max(360).optional(),
  pressureMslHpa: z.number().optional(),
  uvIndex: z.number().nonnegative().optional(),
  precipProbabilityPct: z.number().min(0).max(100).optional(),
});
export type WeatherHour = z.infer<typeof weatherHourSchema>;

// ---------------------------------------------------------------------------
// `weather_snapshots.payload` — one calendar day of Open-Meteo output.
// **Every field added by TASK-weather is `.optional()`** — `upsertWeatherSnapshots`
// validates on write, and every row in the table before this task was written
// without them. A required field would turn every pre-extension row into a
// read-time parse error until the next hourly run replaces it (§2.2's "why").
// ---------------------------------------------------------------------------

export const weatherSnapshotPayloadSchema = z.object({
  date: z.iso.date(),
  tempMaxC: z.number(),
  tempMinC: z.number(),
  weatherCode: z.number().int(),
  precipitationMm: z.number().nonnegative(),
  windSpeedMaxKmh: z.number().nonnegative(),
  uvIndexMax: z.number().nonnegative().optional(),
  sunrise: z.string().optional(),
  sunset: z.string().optional(),
  precipProbabilityMaxPct: z.number().min(0).max(100).optional(),
  windDirectionDominantDeg: z.number().min(0).max(360).optional(),
  hours: z.array(weatherHourSchema).optional(),
});
export type WeatherSnapshotPayload = z.infer<typeof weatherSnapshotPayloadSchema>;

// ---------------------------------------------------------------------------
// `GET /api/v1/farms/:id/weather` — the API's own shape (TASK-weather §2.4).
// `isStale` is computed server-side from `observedAt` vs. now, the same
// reason NFR-8's Crop Stress stale badge is a server fact, not a client one.
// ---------------------------------------------------------------------------

export const farmWeatherDaySchema = z.object({
  date: z.iso.date(),
  horizon: weatherHorizonSchema,
  tempMaxC: z.number(),
  tempMinC: z.number(),
  weatherCode: z.number().int(),
  precipitationMm: z.number().nonnegative(),
  precipProbabilityPct: z.number().min(0).max(100).optional(),
  windSpeedMaxKmh: z.number().nonnegative(),
  windDirectionDeg: z.number().min(0).max(360).optional(),
  uvIndexMax: z.number().nonnegative().optional(),
  sunrise: z.string().optional(),
  sunset: z.string().optional(),
  hours: z.array(weatherHourSchema),
});
export type FarmWeatherDay = z.infer<typeof farmWeatherDaySchema>;

export const farmWeatherSchema = z.object({
  farmId: z.uuid(),
  timezone: z.string(),
  observedAt: z.iso.datetime(),
  isStale: z.boolean(),
  days: z.array(farmWeatherDaySchema),
});
export type FarmWeather = z.infer<typeof farmWeatherSchema>;

/** `?days=` — 1-8 (the store holds 8 horizons; the screen shows 7), default 7. */
export const farmWeatherQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(8).default(7),
});
export type FarmWeatherQuery = z.infer<typeof farmWeatherQuerySchema>;
