import {
  farmRollupPayloadSchema,
  regenerationComponentResultSchema,
  type CropShare,
  type DashboardCropsStocked,
  type DashboardGatheringRate,
  type DashboardPlantingProductivity,
  type DashboardWeather,
  type FarmRollupPayload,
  type GatheringRateCrop,
  type GatheringRatePoint,
  type PlantingProductivityMonth,
  type RegenerationClass,
  type RegenerationComponentInput,
  type RegenerationComponentResult,
  type RegenerationScore,
  type WeatherDay,
  type WeatherHorizon,
  type WeatherSnapshotPayload,
} from "@flora/contracts";
import { sql } from "drizzle-orm";
import { computeRegenerationScore, computeSoilCoverDays, shannonEvennessScore } from "../scoring/regeneration.js";
import type { Tx } from "../tenancy.js";
import { TASK_PROJECTION_SQL, toTaskRecord, type TaskRecord, type TaskRow } from "./tasks.js";

/**
 * TASK-home-dashboard §2.2. Each aggregate is its own exported function so
 * each is its own test (`rollups.spec.ts`). `buildFarmRollup` is the one
 * write path — called by the worker's daily job (§2.9) and by the API's
 * miss path (§2.8), never duplicated (§3, same precedent as
 * `packages/raster/src/detect.ts`). Every function filters explicitly on
 * `organizationId` — invariant 6's repository half, RLS the backstop.
 */

// ---------------------------------------------------------------------------
// Crops Stocked (§7 decision 4 — harvested, trailing 12 months)
// ---------------------------------------------------------------------------

export async function cropsStockedByCrop(
  tx: Tx,
  organizationId: string,
  farmId: string,
  asOf: string,
): Promise<DashboardCropsStocked> {
  const rows = await tx.execute<{ crop_name: string; kg: string }>(sql`
    SELECT c.name AS crop_name, SUM(cc.quantity_kg) AS kg
    FROM crop_cycles cc
    JOIN crops c ON c.organization_id = cc.organization_id AND c.id = cc.crop_id
    JOIN fields f ON f.organization_id = cc.organization_id AND f.id = cc.field_id
    WHERE cc.organization_id = ${organizationId} AND f.farm_id = ${farmId}
      AND cc.status = 'harvested'
      AND cc.quantity_kg IS NOT NULL
      -- expected_harvest_on stands in for an actual harvest date: crop_cycles
      -- carries no separate "harvested_on" column (schema/field.ts).
      AND cc.expected_harvest_on > ${asOf}::date - interval '12 months'
      AND cc.expected_harvest_on <= ${asOf}::date
    GROUP BY c.name
    ORDER BY kg DESC
  `);
  const totalKg = rows.rows.reduce((sum, r) => sum + Number(r.kg), 0);
  const byCrop: CropShare[] = rows.rows.map((r) => ({
    crop: r.crop_name,
    kg: Number(r.kg),
    sharePct: totalKg > 0 ? (Number(r.kg) / totalKg) * 100 : 0,
  }));
  return { totalKg, byCrop };
}

// ---------------------------------------------------------------------------
// Fields at Risk (§7 decision 1)
// ---------------------------------------------------------------------------

export async function fieldsAtRiskCount(tx: Tx, organizationId: string, farmId: string): Promise<number> {
  const rows = await tx.execute<{ count: string }>(sql`
    SELECT COUNT(DISTINCT sz.field_id) AS count
    FROM stress_zones sz
    JOIN fields f ON f.organization_id = sz.organization_id AND f.id = sz.field_id
    WHERE sz.organization_id = ${organizationId} AND f.farm_id = ${farmId}
      AND sz.muted_at IS NULL AND sz.deleted_at IS NULL
  `);
  return Number(rows.rows[0]?.count ?? 0);
}

// ---------------------------------------------------------------------------
// Water Used (§7 decision 1 — trailing 30 days)
// ---------------------------------------------------------------------------

export async function waterUsedM3(tx: Tx, organizationId: string, farmId: string, asOf: string): Promise<number> {
  const rows = await tx.execute<{ total: string | null }>(sql`
    SELECT SUM(t.water_volume_m3) AS total
    FROM tasks t
    JOIN fields f ON f.organization_id = t.organization_id AND f.id = t.field_id
    WHERE t.organization_id = ${organizationId} AND f.farm_id = ${farmId}
      AND t.activity = 'watering' AND t.status = 'done'
      -- tasks carries no separate "completed_at" — updated_at is the last
      -- write, which for a task moved to done is the completion.
      AND t.updated_at > (${asOf}::date - interval '30 days')
      AND t.updated_at <= (${asOf}::date + interval '1 day')
  `);
  return Number(rows.rows[0]?.total ?? 0);
}

// ---------------------------------------------------------------------------
// Planting Productivity (§7 decision 5)
// ---------------------------------------------------------------------------

export async function plantingProductivity(
  tx: Tx,
  organizationId: string,
  farmId: string,
  asOf: string,
): Promise<DashboardPlantingProductivity> {
  const rows = await tx.execute<{ month: string; crop_name: string; share_pct: string }>(sql`
    WITH months AS (
      SELECT generate_series(
        date_trunc('month', ${asOf}::date) - interval '11 months',
        date_trunc('month', ${asOf}::date),
        interval '1 month'
      )::date AS month_start
    ),
    farm_fields AS (
      SELECT id, ST_Area(boundary) AS area_m2
      FROM fields
      WHERE organization_id = ${organizationId} AND farm_id = ${farmId}
    ),
    farm_area AS (
      SELECT COALESCE(SUM(area_m2), 0) AS total_m2 FROM farm_fields
    )
    SELECT
      m.month_start::text AS month,
      c.name AS crop_name,
      SUM(ff.area_m2) / NULLIF((SELECT total_m2 FROM farm_area), 0) * 100 AS share_pct
    FROM months m
    JOIN crop_cycles cc ON cc.organization_id = ${organizationId}
      AND cc.planted_on <= (m.month_start + interval '1 month' - interval '1 day')::date
      AND cc.expected_harvest_on >= m.month_start
    JOIN farm_fields ff ON ff.id = cc.field_id
    JOIN crops c ON c.organization_id = cc.organization_id AND c.id = cc.crop_id
    GROUP BY m.month_start, c.name
    ORDER BY m.month_start, c.name
  `);

  const months = last12MonthKeys(asOf);
  const byMonth = new Map<string, PlantingProductivityMonth["byCrop"]>(months.map((m) => [m, []]));
  for (const row of rows.rows) {
    byMonth.get(row.month)?.push({ crop: row.crop_name, sharePct: Number(row.share_pct) });
  }
  return months.map((month) => ({ month, byCrop: byMonth.get(month)! }));
}

function last12MonthKeys(asOf: string): string[] {
  const asOfDate = new Date(`${asOf}T00:00:00Z`);
  const keys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth() - i, 1));
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Gathering Rate (§7 decision 6 — top crops replace the invented channel rows)
// ---------------------------------------------------------------------------

const GATHERING_RATE_WINDOW_DAYS = 30;
/** The series covers 26 weeks (`25 weeks` back to the current week, literal in the SQL below — interval literals aren't bind-parameterisable). */

export async function gatheringRate(
  tx: Tx,
  organizationId: string,
  farmId: string,
  asOf: string,
): Promise<DashboardGatheringRate> {
  const totals = await tx.execute<{ current_kg: string | null; previous_kg: string | null }>(sql`
    SELECT
      SUM(cc.quantity_kg) FILTER (
        WHERE cc.expected_harvest_on > ${asOf}::date - ${GATHERING_RATE_WINDOW_DAYS}::int
          AND cc.expected_harvest_on <= ${asOf}::date
      ) AS current_kg,
      SUM(cc.quantity_kg) FILTER (
        WHERE cc.expected_harvest_on > ${asOf}::date - ${2 * GATHERING_RATE_WINDOW_DAYS}::int
          AND cc.expected_harvest_on <= ${asOf}::date - ${GATHERING_RATE_WINDOW_DAYS}::int
      ) AS previous_kg
    FROM crop_cycles cc
    JOIN fields f ON f.organization_id = cc.organization_id AND f.id = cc.field_id
    WHERE cc.organization_id = ${organizationId} AND f.farm_id = ${farmId}
      AND cc.status = 'harvested' AND cc.quantity_kg IS NOT NULL
  `);
  const currentKg = Number(totals.rows[0]?.current_kg ?? 0);
  const previousKg = Number(totals.rows[0]?.previous_kg ?? 0);
  const ratePerDayKg = currentKg / GATHERING_RATE_WINDOW_DAYS;
  const deltaPct = previousKg > 0 ? ((currentKg - previousKg) / previousKg) * 100 : null;

  const topCropsRows = await tx.execute<{ crop_name: string; current_kg: string; previous_kg: string | null }>(sql`
    SELECT c.name AS crop_name,
      SUM(cc.quantity_kg) AS current_kg,
      (
        SELECT SUM(cc2.quantity_kg)
        FROM crop_cycles cc2
        JOIN fields f2 ON f2.organization_id = cc2.organization_id AND f2.id = cc2.field_id
        WHERE cc2.organization_id = ${organizationId} AND f2.farm_id = ${farmId}
          AND cc2.status = 'harvested' AND cc2.quantity_kg IS NOT NULL AND cc2.crop_id = cc.crop_id
          AND cc2.expected_harvest_on > ${asOf}::date - ${2 * GATHERING_RATE_WINDOW_DAYS}::int
          AND cc2.expected_harvest_on <= ${asOf}::date - ${GATHERING_RATE_WINDOW_DAYS}::int
      ) AS previous_kg
    FROM crop_cycles cc
    JOIN crops c ON c.organization_id = cc.organization_id AND c.id = cc.crop_id
    JOIN fields f ON f.organization_id = cc.organization_id AND f.id = cc.field_id
    WHERE cc.organization_id = ${organizationId} AND f.farm_id = ${farmId}
      AND cc.status = 'harvested' AND cc.quantity_kg IS NOT NULL
      AND cc.expected_harvest_on > ${asOf}::date - ${GATHERING_RATE_WINDOW_DAYS}::int
      AND cc.expected_harvest_on <= ${asOf}::date
    GROUP BY c.name, cc.crop_id
    ORDER BY current_kg DESC
    LIMIT 2
  `);
  const topCrops: GatheringRateCrop[] = topCropsRows.rows.map((r) => {
    const cur = Number(r.current_kg);
    const prev = r.previous_kg === null ? 0 : Number(r.previous_kg);
    return { crop: r.crop_name, kg: cur, deltaPct: prev > 0 ? ((cur - prev) / prev) * 100 : null };
  });

  const seriesRows = await tx.execute<{ week_start: string; current_kg: string | null; previous_kg: string | null }>(sql`
    WITH weeks AS (
      SELECT generate_series(
        date_trunc('week', ${asOf}::date) - interval '25 weeks',
        date_trunc('week', ${asOf}::date),
        interval '1 week'
      )::date AS week_start
    )
    SELECT
      w.week_start::text AS week_start,
      COALESCE((
        SELECT SUM(cc.quantity_kg) FROM crop_cycles cc
        JOIN fields f ON f.organization_id = cc.organization_id AND f.id = cc.field_id
        WHERE cc.organization_id = ${organizationId} AND f.farm_id = ${farmId}
          AND cc.status = 'harvested' AND cc.quantity_kg IS NOT NULL
          AND cc.expected_harvest_on >= w.week_start AND cc.expected_harvest_on < w.week_start + interval '1 week'
      ), 0) AS current_kg,
      COALESCE((
        SELECT SUM(cc.quantity_kg) FROM crop_cycles cc
        JOIN fields f ON f.organization_id = cc.organization_id AND f.id = cc.field_id
        WHERE cc.organization_id = ${organizationId} AND f.farm_id = ${farmId}
          AND cc.status = 'harvested' AND cc.quantity_kg IS NOT NULL
          AND cc.expected_harvest_on >= w.week_start - interval '26 weeks'
          AND cc.expected_harvest_on < w.week_start - interval '26 weeks' + interval '1 week'
      ), 0) AS previous_kg
    FROM weeks w
    ORDER BY w.week_start
  `);
  const series: GatheringRatePoint[] = seriesRows.rows.map((r) => ({
    weekStart: r.week_start,
    currentKg: Number(r.current_kg ?? 0),
    previousKg: Number(r.previous_kg ?? 0),
  }));

  return { ratePerDayKg, deltaPct, series, topCrops };
}

// ---------------------------------------------------------------------------
// Regeneration Score inputs (§2.4)
// ---------------------------------------------------------------------------

const SOIL_COVER_SERIES_DAYS = 370;

export async function regenerationComponents(
  tx: Tx,
  organizationId: string,
  farmId: string,
  asOf: string,
): Promise<RegenerationComponentInput[]> {
  const ndviRows = await tx.execute<{ date: string; ndvi: string }>(sql`
    SELECT o.captured_on::text AS date, AVG((o.stats->>'mean')::numeric) AS ndvi
    FROM observations o
    JOIN fields f ON f.organization_id = o.organization_id AND f.id = o.field_id
    WHERE o.organization_id = ${organizationId} AND f.farm_id = ${farmId} AND o.index = 'ndvi'
      AND o.captured_on > ${asOf}::date - ${SOIL_COVER_SERIES_DAYS}::int AND o.captured_on <= ${asOf}::date
    GROUP BY o.captured_on
    ORDER BY o.captured_on
  `);
  const soilCover = computeSoilCoverDays(
    ndviRows.rows.map((r) => ({ date: r.date, ndvi: Number(r.ndvi) })),
    asOf,
  );

  const diversityRows = await tx.execute<{ weight: string }>(sql`
    SELECT SUM(ST_Area(f.boundary)) AS weight
    FROM crop_cycles cc
    JOIN fields f ON f.organization_id = cc.organization_id AND f.id = cc.field_id
    WHERE cc.organization_id = ${organizationId} AND f.farm_id = ${farmId}
      -- Trailing 3 years (§2.4); interval literals aren't bind-parameterisable.
      AND cc.planted_on > ${asOf}::date - interval '3 years'
      AND cc.planted_on <= ${asOf}::date
    GROUP BY cc.crop_id
  `);
  const cropDiversity = shannonEvennessScore(diversityRows.rows.map((r) => Number(r.weight)));

  const vegRows = await tx.execute<{ total_m2: string | null; stressed_m2: string | null }>(sql`
    WITH field_areas AS (
      SELECT id, ST_Area(boundary) AS area_m2
      FROM fields
      WHERE organization_id = ${organizationId} AND farm_id = ${farmId}
    ),
    stressed AS (
      -- ST_Union has no geography overload — union in geometry (degrees),
      -- then cast back to geography for a metres-based ST_Area, same as
      -- every other area in this file.
      SELECT sz.field_id, ST_Area(ST_Union(sz.geometry::geometry)::geography) AS stressed_m2
      FROM stress_zones sz
      WHERE sz.organization_id = ${organizationId} AND sz.deleted_at IS NULL AND sz.muted_at IS NULL
        AND sz.field_id IN (SELECT id FROM field_areas)
      GROUP BY sz.field_id
    )
    SELECT
      COALESCE(SUM(fa.area_m2), 0) AS total_m2,
      COALESCE(SUM(LEAST(COALESCE(s.stressed_m2, 0), fa.area_m2)), 0) AS stressed_m2
    FROM field_areas fa
    LEFT JOIN stressed s ON s.field_id = fa.id
  `);
  const totalM2 = Number(vegRows.rows[0]?.total_m2 ?? 0);
  const stressedM2 = Number(vegRows.rows[0]?.stressed_m2 ?? 0);
  const vegetationHealth = totalM2 > 0 ? Math.min(100, (1 - stressedM2 / totalM2) * 100) : null;

  return [
    { key: "soilCover", value: soilCover },
    { key: "cropDiversity", value: cropDiversity },
    { key: "vegetationHealth", value: vegetationHealth },
  ];
}

// ---------------------------------------------------------------------------
// The write path (§2.2, §2.9) — one implementation, called by the worker's
// daily job and the API's rollup-miss path (§2.8), never duplicated (§3).
// ---------------------------------------------------------------------------

export interface BuildFarmRollupResult {
  rollup: FarmRollupPayload;
  score: RegenerationScore;
}

export async function buildFarmRollup(
  tx: Tx,
  organizationId: string,
  farmId: string,
  day: string,
): Promise<BuildFarmRollupResult> {
  const cropsStocked = await cropsStockedByCrop(tx, organizationId, farmId, day);
  const fieldsAtRisk = await fieldsAtRiskCount(tx, organizationId, farmId);
  const waterUsed = await waterUsedM3(tx, organizationId, farmId, day);
  const productivity = await plantingProductivity(tx, organizationId, farmId, day);
  const gathering = await gatheringRate(tx, organizationId, farmId, day);
  const components = await regenerationComponents(tx, organizationId, farmId, day);

  const rollup = farmRollupPayloadSchema.parse({
    cropsStocked,
    fieldsAtRiskCount: fieldsAtRisk,
    waterUsedM3: waterUsed,
    plantingProductivity: productivity,
    gatheringRate: gathering,
  } satisfies FarmRollupPayload);

  const score = computeRegenerationScore(components);

  await tx.execute(sql`
    INSERT INTO farm_daily_rollups (organization_id, farm_id, day, payload, computed_at)
    VALUES (${organizationId}, ${farmId}, ${day}, ${JSON.stringify(rollup)}::jsonb, now())
    ON CONFLICT (farm_id, day) DO UPDATE SET payload = EXCLUDED.payload, computed_at = now()
  `);

  await tx.execute(sql`
    INSERT INTO farm_scores (organization_id, farm_id, computed_on, score, class, components, formula_version)
    VALUES (
      ${organizationId}, ${farmId}, ${day}, ${score.score}, ${score.class},
      ${JSON.stringify(score.components)}::jsonb, ${score.formulaVersion}
    )
    ON CONFLICT (farm_id, computed_on) DO UPDATE SET
      score = EXCLUDED.score, class = EXCLUDED.class,
      components = EXCLUDED.components, formula_version = EXCLUDED.formula_version
  `);

  return { rollup, score };
}

// ---------------------------------------------------------------------------
// Reads (§2.2's `getFarmRollup`, §2.8's live reads)
// ---------------------------------------------------------------------------

export interface FarmRollupRow {
  day: string;
  payload: FarmRollupPayload;
  computedAt: string;
}

/** The latest rollup row, plus the row from 7 days earlier for §2.3's deltas — one query. */
export async function getFarmRollup(
  tx: Tx,
  organizationId: string,
  farmId: string,
): Promise<{ latest: FarmRollupRow | null; sevenDaysAgo: FarmRollupRow | null }> {
  const rows = await tx.execute<{ kind: "latest" | "prior"; day: string; payload: unknown; computed_at: string }>(sql`
    WITH latest AS (
      SELECT day, payload, computed_at FROM farm_daily_rollups
      WHERE organization_id = ${organizationId} AND farm_id = ${farmId}
      ORDER BY day DESC LIMIT 1
    ),
    prior AS (
      SELECT r.day, r.payload, r.computed_at
      FROM farm_daily_rollups r, latest l
      WHERE r.organization_id = ${organizationId} AND r.farm_id = ${farmId} AND r.day <= l.day - interval '7 days'
      ORDER BY r.day DESC LIMIT 1
    )
    SELECT 'latest' AS kind, day::text, payload, computed_at::text AS computed_at FROM latest
    UNION ALL
    SELECT 'prior' AS kind, day::text, payload, computed_at::text AS computed_at FROM prior
  `);

  const toRow = (r: { day: string; payload: unknown; computed_at: string }): FarmRollupRow => ({
    day: r.day,
    payload: farmRollupPayloadSchema.parse(r.payload),
    // computed_at::text is Postgres's own timestamptz format ("2026-08-16
    // 13:33:36.123+00"), not RFC3339 — round-trip through Date for the ISO
    // form dashboardSchema's meta.computedAt (z.iso.datetime()) requires.
    computedAt: new Date(r.computed_at).toISOString(),
  });

  const latest = rows.rows.find((r) => r.kind === "latest");
  const prior = rows.rows.find((r) => r.kind === "prior");
  return { latest: latest ? toRow(latest) : null, sevenDaysAgo: prior ? toRow(prior) : null };
}

export interface FarmScoreRow {
  computedOn: string;
  score: number;
  class: RegenerationClass;
  components: RegenerationComponentResult[];
  formulaVersion: string;
}

/** The latest `farm_scores` row and the one immediately before it, for the card's "previous" comparison (§2.4). */
export async function getFarmScore(
  tx: Tx,
  organizationId: string,
  farmId: string,
): Promise<{ current: FarmScoreRow | null; previous: FarmScoreRow | null }> {
  const rows = await tx.execute<{
    computed_on: string;
    score: string;
    class: string;
    components: unknown;
    formula_version: string;
  }>(sql`
    SELECT computed_on::text, score, class, components, formula_version
    FROM farm_scores
    WHERE organization_id = ${organizationId} AND farm_id = ${farmId}
    ORDER BY computed_on DESC
    LIMIT 2
  `);
  const toRow = (r: (typeof rows.rows)[number]): FarmScoreRow => ({
    computedOn: r.computed_on,
    score: Number(r.score),
    class: r.class as RegenerationClass,
    components: regenerationComponentResultSchema.array().parse(r.components),
    formulaVersion: r.formula_version,
  });
  return {
    current: rows.rows[0] ? toRow(rows.rows[0]) : null,
    previous: rows.rows[1] ? toRow(rows.rows[1]) : null,
  };
}

/**
 * Pending Tasks is never read from the rollup (§3) — a task finished a
 * minute ago must not show as pending until tomorrow's rollup. Scoped to the
 * farm via its fields; a task with no field (legitimate, `schema/task.ts`)
 * is treated as farm-wide and always included.
 */
export async function getPendingTasks(
  tx: Tx,
  organizationId: string,
  farmId: string,
  limit = 2,
): Promise<TaskRecord[]> {
  const rows = await tx.execute<TaskRow>(sql`
    ${TASK_PROJECTION_SQL}
    WHERE t.organization_id = ${organizationId} AND t.status != 'done'
      AND (t.field_id IS NULL OR EXISTS (
        SELECT 1 FROM fields ff
        WHERE ff.organization_id = t.organization_id AND ff.id = t.field_id AND ff.farm_id = ${farmId}
      ))
    ORDER BY t.position ASC
    LIMIT ${limit}
  `);
  return rows.rows.map(toTaskRecord);
}

/** Today (horizon `"0"`) and tomorrow (horizon `"1"`) from the latest ingestion run — also a live read, weather refreshes hourly, not daily (§2.6). */
export async function getLatestWeather(tx: Tx, organizationId: string, farmId: string): Promise<DashboardWeather> {
  const rows = await tx.execute<{ horizon: WeatherHorizon; payload: WeatherSnapshotPayload }>(sql`
    SELECT DISTINCT ON (horizon) horizon, payload
    FROM weather_snapshots
    WHERE organization_id = ${organizationId} AND farm_id = ${farmId} AND horizon IN ('0', '1')
    ORDER BY horizon, observed_at DESC
  `);
  const byHorizon = new Map(rows.rows.map((r) => [r.horizon, r.payload]));
  const toWeatherDay = (p: WeatherSnapshotPayload | undefined): WeatherDay | null =>
    p ? { date: p.date, tempC: p.tempMaxC, weatherCode: p.weatherCode } : null;
  return { today: toWeatherDay(byHorizon.get("0")), tomorrow: toWeatherDay(byHorizon.get("1")) };
}

/** `(current - previous) / previous × 100`, or `null` when there's nothing to compare against — the badge never renders a fabricated number (§2.3). */
export function kpiDelta(current: number, previous: number | undefined | null): number | null {
  if (previous === undefined || previous === null || previous === 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}
