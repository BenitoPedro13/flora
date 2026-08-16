import type { MultiPolygon } from "@flora/contracts";
import { eq, sql } from "drizzle-orm";
import { createDbClient } from "./client.js";
import { insertField } from "./queries/fields.js";
import { organizations } from "./schema/auth.js";
import { fields } from "./schema/field.js";
import { withOrganization } from "./tenancy.js";

/**
 * 200 non-overlapping fields on a grid — TASK-fields §6 item 4 (cursor
 * pagination walked to exhaustion, including 50 fields sharing an identical
 * `position`) and §6 item 15 (NFR-11's 60fps pan with 200 polygons). Kept
 * separate from `seed-demo.ts`: the demo fields exist for the visual diff
 * and must stay exactly four; this is a scale fixture. Must run after
 * `db:seed`. Idempotent.
 */

const SEED_ORG_SLUG = "flora-farm";
const SEED_FARM_NAME = "Flora Farm — Amazonas";
const BULK_FIELD_COUNT = 200;
// 50 fields share position 1 (§6 item 4's "naive OFFSET or a single-column
// keyset gets this wrong" case) — the rest get distinct increasing positions.
const SHARED_POSITION_COUNT = 50;

const HALF_LON = 0.0006;
const HALF_LAT = 0.0004;
const GRID_COLUMNS = 20;
const COL_SPACING = 0.002;
const ROW_SPACING = 0.0015;
const ORIGIN: [number, number] = [-59.3, -4.7];

function rectangleBoundary([lon, lat]: [number, number]): MultiPolygon {
  const ring: [number, number][] = [
    [lon - HALF_LON, lat - HALF_LAT],
    [lon + HALF_LON, lat - HALF_LAT],
    [lon + HALF_LON, lat + HALF_LAT],
    [lon - HALF_LON, lat + HALF_LAT],
    [lon - HALF_LON, lat - HALF_LAT],
  ];
  return { type: "MultiPolygon", coordinates: [[ring]] };
}

async function main() {
  const databaseUrl = process.env.DATABASE_MIGRATION_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_MIGRATION_URL is not set");
  }

  const { db, pool } = createDbClient(databaseUrl);
  try {
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, SEED_ORG_SLUG)).limit(1);
    if (!org) {
      throw new Error(`seed org '${SEED_ORG_SLUG}' not found — run 'pnpm db:seed' first`);
    }

    const existing = await db.select().from(fields).where(sql`${fields.organizationId} = ${org.id} AND ${fields.name} LIKE 'Bulk Field %'`).limit(1);
    if (existing.length > 0) {
      console.log("Bulk fields already exist — skipping");
      return;
    }

    const farmRows = await db.execute<{ id: string }>(
      sql`select id from farms where organization_id = ${org.id} and name = ${SEED_FARM_NAME}`,
    );
    const farm = farmRows.rows[0];
    if (!farm) {
      throw new Error(`seed farm '${SEED_FARM_NAME}' not found — run 'pnpm db:seed' first`);
    }

    await withOrganization(db, org.id, async (tx) => {
      for (let i = 0; i < BULK_FIELD_COUNT; i++) {
        const col = i % GRID_COLUMNS;
        const row = Math.floor(i / GRID_COLUMNS);
        const center: [number, number] = [ORIGIN[0] + col * COL_SPACING, ORIGIN[1] + row * ROW_SPACING];
        const position = i < SHARED_POSITION_COUNT ? 1 : i - SHARED_POSITION_COUNT + 2;

        await insertField(tx, {
          organizationId: org.id,
          farmId: farm.id,
          name: `Bulk Field ${String(i + 1).padStart(3, "0")}`,
          boundary: rectangleBoundary(center),
          position,
        });
      }
    });

    console.log(`Seeded ${BULK_FIELD_COUNT} bulk fields for org ${org.slug}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
