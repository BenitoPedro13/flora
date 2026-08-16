import { sql } from "drizzle-orm";
import { OpenMeteoProvider } from "@flora/weather";
import { createDbClient } from "./client.js";
import { upsertWeatherSnapshots } from "./queries/weather.js";
import { withOrganization } from "./tenancy.js";

/**
 * TASK-home-dashboard §2.6: a real, keyless Open-Meteo call per farm, run
 * once — what the worker's hourly job does on its own schedule
 * (`WEATHER_SCHEDULE_ENABLED=true`), for a demo environment that wants real
 * weather data without waiting on that scheduler or enabling it. Run after
 * `db:seed:demo`.
 */
const SEED_ORG_SLUG = "flora-farm";

async function main() {
  const databaseUrl = process.env.DATABASE_MIGRATION_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_MIGRATION_URL is not set");
  }

  const { db, pool } = createDbClient(databaseUrl);
  const provider = new OpenMeteoProvider(process.env.OPEN_METEO_BASE_URL || undefined);
  try {
    const [org] = await db.execute<{ id: string }>(sql`SELECT id FROM organizations WHERE slug = ${SEED_ORG_SLUG}`).then((r) => r.rows);
    if (!org) {
      throw new Error(`Seed org '${SEED_ORG_SLUG}' not found — run db:seed first`);
    }
    const farms = await db
      .execute<{ id: string; name: string; longitude: number; latitude: number; timezone: string }>(sql`
        SELECT id, name, ST_X(location::geometry) AS longitude, ST_Y(location::geometry) AS latitude, timezone
        FROM farms WHERE organization_id = ${org.id}
      `)
      .then((r) => r.rows);
    if (farms.length === 0) {
      throw new Error("No farms found — run db:seed first");
    }

    for (const farm of farms) {
      const days = await provider.fetchDailyForecast({
        latitude: farm.latitude,
        longitude: farm.longitude,
        timezone: farm.timezone,
      });
      await withOrganization(db, org.id, async (tx) => {
        await upsertWeatherSnapshots(tx, org.id, farm.id, new Date(), days);
      });
      console.log(`db:seed:weather: wrote ${days.length} horizon(s) for '${farm.name}' — today's high ${days[0]?.tempMaxC}°C`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
