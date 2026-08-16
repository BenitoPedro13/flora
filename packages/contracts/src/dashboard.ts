import { z } from "zod";
import { taskSchema } from "./task.js";

/**
 * `GET /farms/:id/dashboard` (TASK-home-dashboard §2.8, architecture §8.3).
 * Six of seven widgets come from `farm_daily_rollups`/`farm_scores`
 * (`packages/db/src/queries/rollups.ts`); Pending Tasks is a live read
 * (§2.8/§3) so a task finished a minute ago never shows as pending until
 * tomorrow's rollup.
 */

// ---------------------------------------------------------------------------
// KPI row (§7 decision 1)
// ---------------------------------------------------------------------------

/**
 * `deltaPct` is `null`, never `0`, when there is no 7-day-old rollup to
 * compare against — the badge does not render on a fabricated number (§2.3).
 */
export const kpiMetricSchema = z.object({
  value: z.number(),
  deltaPct: z.number().nullable(),
});
export type KpiMetric = z.infer<typeof kpiMetricSchema>;

export const dashboardKpisSchema = z.object({
  cropsStockedKg: kpiMetricSchema,
  fieldsAtRisk: kpiMetricSchema,
  waterUsedM3: kpiMetricSchema,
});
export type DashboardKpis = z.infer<typeof dashboardKpisSchema>;

// ---------------------------------------------------------------------------
// Crops Stocked donut (§7 decision 4 — harvested, trailing 12 months)
// ---------------------------------------------------------------------------

export const cropShareSchema = z.object({
  crop: z.string(),
  kg: z.number().nonnegative(),
  sharePct: z.number().min(0).max(100),
});
export type CropShare = z.infer<typeof cropShareSchema>;

export const dashboardCropsStockedSchema = z.object({
  totalKg: z.number().nonnegative(),
  byCrop: z.array(cropShareSchema),
});
export type DashboardCropsStocked = z.infer<typeof dashboardCropsStockedSchema>;

// ---------------------------------------------------------------------------
// Regeneration Score (§2.4 — published agri-environmental indicators, not an
// invented composite; architecture §17 Q2)
// ---------------------------------------------------------------------------

/** AAFC's own five-class performance-index rating, 0–100 in 20-point bands. */
export const regenerationClassValues = ["at_risk", "poor", "moderate", "good", "desired"] as const;
export const regenerationClassSchema = z.enum(regenerationClassValues);
export type RegenerationClass = z.infer<typeof regenerationClassSchema>;

export const regenerationComponentKeyValues = ["soilCover", "cropDiversity", "vegetationHealth"] as const;
export const regenerationComponentKeySchema = z.enum(regenerationComponentKeyValues);
export type RegenerationComponentKey = z.infer<typeof regenerationComponentKeySchema>;

/**
 * One component's input to `computeRegenerationScore` — `value: null` means
 * "not enough data", not "score zero"; the remaining weights renormalise
 * (§2.4's honesty rule).
 */
export const regenerationComponentInputSchema = z.object({
  key: regenerationComponentKeySchema,
  value: z.number().min(0).max(100).nullable(),
});
export type RegenerationComponentInput = z.infer<typeof regenerationComponentInputSchema>;

export const regenerationComponentResultSchema = z.object({
  key: regenerationComponentKeySchema,
  weight: z.number().min(0).max(1),
  value: z.number().min(0).max(100).nullable(),
  present: z.boolean(),
});
export type RegenerationComponentResult = z.infer<typeof regenerationComponentResultSchema>;

export const regenerationScoreSchema = z.object({
  score: z.number().min(0).max(100),
  class: regenerationClassSchema,
  components: z.array(regenerationComponentResultSchema),
  formulaVersion: z.string(),
});
export type RegenerationScore = z.infer<typeof regenerationScoreSchema>;

export const dashboardRegenerationSchema = z.object({
  current: regenerationScoreSchema,
  /** Yesterday's stored `farm_scores` row, or `null` on a farm's first-ever score. */
  previous: z.object({ score: z.number(), class: regenerationClassSchema, computedOn: z.iso.date() }).nullable(),
});
export type DashboardRegeneration = z.infer<typeof dashboardRegenerationSchema>;

// ---------------------------------------------------------------------------
// Planting Productivity (§7 decision 5)
// ---------------------------------------------------------------------------

export const plantingProductivityMonthSchema = z.object({
  /** First-of-month, e.g. `"2026-03-01"`. */
  month: z.iso.date(),
  byCrop: z.array(cropShareSchema.omit({ kg: true })),
});
export type PlantingProductivityMonth = z.infer<typeof plantingProductivityMonthSchema>;

export const dashboardPlantingProductivitySchema = z.array(plantingProductivityMonthSchema);
export type DashboardPlantingProductivity = z.infer<typeof dashboardPlantingProductivitySchema>;

// ---------------------------------------------------------------------------
// Gathering Rate (§7 decision 6 — top crops replace the invented e-commerce rows)
// ---------------------------------------------------------------------------

export const gatheringRatePointSchema = z.object({
  weekStart: z.iso.date(),
  currentKg: z.number().nonnegative(),
  previousKg: z.number().nonnegative(),
});
export type GatheringRatePoint = z.infer<typeof gatheringRatePointSchema>;

export const gatheringRateCropSchema = z.object({
  crop: z.string(),
  kg: z.number().nonnegative(),
  deltaPct: z.number().nullable(),
});
export type GatheringRateCrop = z.infer<typeof gatheringRateCropSchema>;

export const dashboardGatheringRateSchema = z.object({
  ratePerDayKg: z.number().nonnegative(),
  deltaPct: z.number().nullable(),
  series: z.array(gatheringRatePointSchema),
  topCrops: z.array(gatheringRateCropSchema).max(2),
});
export type DashboardGatheringRate = z.infer<typeof dashboardGatheringRateSchema>;

// ---------------------------------------------------------------------------
// Weather (§2.6 — write path pulled forward from Phase 5; Home reads only
// today/tomorrow of a much larger stored snapshot)
// ---------------------------------------------------------------------------

export const weatherDaySchema = z.object({
  date: z.iso.date(),
  tempC: z.number(),
  /** Open-Meteo WMO weather code — `packages/weather` maps it to a Remix icon. */
  weatherCode: z.number().int(),
});
export type WeatherDay = z.infer<typeof weatherDaySchema>;

export const dashboardWeatherSchema = z.object({
  today: weatherDaySchema.nullable(),
  tomorrow: weatherDaySchema.nullable(),
});
export type DashboardWeather = z.infer<typeof dashboardWeatherSchema>;

/**
 * `weather_snapshots.horizon` — forecast lead in days from the ingestion
 * run named by `observed_at` (§2.6). `"0"` is today, `"1"` is tomorrow —
 * the only two Home reads; `"2"`–`"7"` are fetched and stored in the same
 * Open-Meteo call for Phase 5's 7-day screen, unread until then.
 */
export const weatherHorizonValues = ["0", "1", "2", "3", "4", "5", "6", "7"] as const;
export const weatherHorizonSchema = z.enum(weatherHorizonValues);
export type WeatherHorizon = z.infer<typeof weatherHorizonSchema>;

/**
 * `weather_snapshots.payload` — one calendar day of Open-Meteo daily-block
 * output. `[VERIFY: parameter names against Open-Meteo's current docs
 * before shipping — architecture §11.3]`.
 */
export const weatherSnapshotPayloadSchema = z.object({
  date: z.iso.date(),
  tempMaxC: z.number(),
  tempMinC: z.number(),
  weatherCode: z.number().int(),
  precipitationMm: z.number().nonnegative(),
  windSpeedMaxKmh: z.number().nonnegative(),
  uvIndexMax: z.number().nonnegative().optional(),
  // Open-Meteo's local-time ISO strings (e.g. "2026-08-16T06:12") aren't
  // full RFC3339 — no offset, no seconds — so these stay plain strings
  // rather than z.iso.datetime(), which would reject them.
  sunrise: z.string().optional(),
  sunset: z.string().optional(),
});
export type WeatherSnapshotPayload = z.infer<typeof weatherSnapshotPayloadSchema>;

// ---------------------------------------------------------------------------
// `farm_daily_rollups.payload` — everything `buildFarmRollup` computes once a
// day. Regeneration lives in `farm_scores` instead (its own row, its own
// `formula_version`, §2.4); Pending Tasks is never rolled up (§3); Weather is
// `weather_snapshots`, not the rollup, because it refreshes hourly not daily.
// ---------------------------------------------------------------------------

export const farmRollupPayloadSchema = z.object({
  cropsStocked: dashboardCropsStockedSchema,
  fieldsAtRiskCount: z.number().int().nonnegative(),
  waterUsedM3: z.number().nonnegative(),
  plantingProductivity: dashboardPlantingProductivitySchema,
  gatheringRate: dashboardGatheringRateSchema,
});
export type FarmRollupPayload = z.infer<typeof farmRollupPayloadSchema>;

// ---------------------------------------------------------------------------
// The whole payload
// ---------------------------------------------------------------------------

export const dashboardSchema = z.object({
  kpis: dashboardKpisSchema,
  cropsStocked: dashboardCropsStockedSchema,
  regeneration: dashboardRegenerationSchema,
  plantingProductivity: dashboardPlantingProductivitySchema,
  gatheringRate: dashboardGatheringRateSchema,
  /** Head of the task queue, live-read — never from the rollup (§3). */
  pendingTasks: z.array(taskSchema).max(2),
  weather: dashboardWeatherSchema,
  /** `day` is the rollup's own date — the KPI info tooltips' "as of" (§2.3, NFR-8's stale-badge precedent). */
  meta: z.object({ day: z.iso.date(), computedAt: z.iso.datetime() }),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
