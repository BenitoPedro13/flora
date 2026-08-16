import { weatherSnapshotPayloadSchema, type WeatherHorizon, type WeatherSnapshotPayload } from "@flora/contracts";
import { sql } from "drizzle-orm";
import type { Tx } from "../tenancy.js";

/**
 * TASK-home-dashboard §2.6. `days[i]` is `i` days ahead of `observedAt` (the
 * ingestion run's own timestamp) — `horizon = String(i)` locates it later.
 * One ingestion run writes one row per element (8 rows for Open-Meteo's
 * `forecast_days=8`), all sharing `observedAt`.
 */
export async function upsertWeatherSnapshots(
  tx: Tx,
  organizationId: string,
  farmId: string,
  observedAt: Date,
  days: WeatherSnapshotPayload[],
): Promise<void> {
  for (const [horizon, day] of days.entries()) {
    const payload = weatherSnapshotPayloadSchema.parse(day);
    await tx.execute(sql`
      INSERT INTO weather_snapshots (organization_id, farm_id, observed_at, horizon, payload)
      VALUES (${organizationId}, ${farmId}, ${observedAt.toISOString()}, ${String(horizon)}, ${JSON.stringify(payload)}::jsonb)
      ON CONFLICT (farm_id, observed_at, horizon) DO UPDATE SET payload = EXCLUDED.payload
    `);
  }
}

export interface FarmWeekRow {
  horizon: WeatherHorizon;
  payload: WeatherSnapshotPayload;
}

export interface FarmWeekResult {
  /** Newest `observed_at` across the returned rows — `null` when the farm has never been ingested. */
  observedAt: Date | null;
  days: FarmWeekRow[];
}

/**
 * TASK-weather §2.3 — the latest ingestion run's payload for each horizon
 * below `days`, for the Weather screen's `GET /farms/:id/weather`. Reuses
 * `rollups.ts#getLatestWeather`'s `DISTINCT ON (horizon) … ORDER BY horizon,
 * observed_at DESC` idiom verbatim (the "latest run per horizon" read), not
 * a `MAX(observed_at)` subquery.
 *
 * `horizon::text::int < $3::int` — both sides cast explicitly. `horizon` is
 * an *enum* column: an uncast bound parameter next to it gets inferred to
 * the enum's own type, not `int`, and `<` on an enum sorts lexically, not
 * numerically (TASK-home-dashboard §10 defect 2, the same trap, sharper
 * here because the column type makes the wrong inference silent rather than
 * a query error).
 *
 * A row whose `payload` fails `weatherSnapshotPayloadSchema.parse` is
 * dropped with a `console.warn`, not thrown — a partially-written or
 * pre-extension row must degrade one day, never the whole request.
 */
export async function getFarmWeek(
  tx: Tx,
  organizationId: string,
  farmId: string,
  days: number,
): Promise<FarmWeekResult> {
  const rows = await tx.execute<{ horizon: WeatherHorizon; observed_at: string; payload: unknown }>(sql`
    SELECT DISTINCT ON (horizon) horizon, observed_at, payload
    FROM weather_snapshots
    WHERE organization_id = ${organizationId} AND farm_id = ${farmId} AND horizon::text::int < ${days}::int
    ORDER BY horizon, observed_at DESC
  `);

  const parsed: FarmWeekRow[] = [];
  let observedAt: Date | null = null;
  for (const row of rows.rows) {
    const rowObservedAt = new Date(row.observed_at);
    if (!observedAt || rowObservedAt > observedAt) {
      observedAt = rowObservedAt;
    }
    const result = weatherSnapshotPayloadSchema.safeParse(row.payload);
    if (!result.success) {
      console.warn(`getFarmWeek: dropping unparseable payload for farm ${farmId}, horizon ${row.horizon}`, result.error);
      continue;
    }
    parsed.push({ horizon: row.horizon, payload: result.data });
  }
  parsed.sort((a, b) => Number(a.horizon) - Number(b.horizon));

  return { observedAt, days: parsed };
}
