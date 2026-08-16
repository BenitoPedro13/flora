import { weatherSnapshotPayloadSchema, type WeatherSnapshotPayload } from "@flora/contracts";
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
