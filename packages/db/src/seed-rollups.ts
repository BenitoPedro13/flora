import { sql } from "drizzle-orm";
import { createDbClient } from "./client.js";
import { buildFarmRollup } from "./queries/rollups.js";
import { withOrganization } from "./tenancy.js";

/**
 * TASK-home-dashboard §2.12: replays the **real** `buildFarmRollup` for each
 * of the trailing 30 days, exactly as `db:seed:satellite` replays the real
 * raster pipeline. This is what makes §2.3's KPI deltas real numbers instead
 * of hand-written JSON — and a bug in an aggregate shows up running this
 * script, not hiding behind fixture data. Run after `db:seed:demo` and
 * `db:seed:satellite`.
 */
const SEED_ORG_SLUG = "flora-farm";
const ROLLUP_DAYS = 30;

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const databaseUrl = process.env.DATABASE_MIGRATION_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_MIGRATION_URL is not set");
  }

  const { db, pool } = createDbClient(databaseUrl);
  try {
    const [org] = await db.execute<{ id: string }>(sql`SELECT id FROM organizations WHERE slug = ${SEED_ORG_SLUG}`).then((r) => r.rows);
    if (!org) {
      throw new Error(`Seed org '${SEED_ORG_SLUG}' not found — run db:seed and db:seed:demo first`);
    }
    const farms = await db
      .execute<{ id: string; name: string }>(sql`SELECT id, name FROM farms WHERE organization_id = ${org.id}`)
      .then((r) => r.rows);
    if (farms.length === 0) {
      throw new Error("No demo farms found — run db:seed:demo first");
    }

    let rollupCount = 0;
    for (const farm of farms) {
      await withOrganization(db, org.id, async (tx) => {
        for (let daysAgo = ROLLUP_DAYS - 1; daysAgo >= 0; daysAgo--) {
          await buildFarmRollup(tx, org.id, farm.id, isoDate(daysAgo));
          rollupCount++;
        }
      });
    }

    console.log(`db:seed:rollups: built ${rollupCount} daily rollup(s) across ${farms.length} farm(s), trailing ${ROLLUP_DAYS} days.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
