import type { MultiPolygon } from "@flora/contracts";
import { eq, sql } from "drizzle-orm";
import { createDbClient } from "./client.js";
import { insertField } from "./queries/fields.js";
import { organizations } from "./schema/auth.js";
import { crops } from "./schema/crop.js";
import { cropCycles, fields } from "./schema/field.js";
import { tasks } from "./schema/task.js";
import { withOrganization } from "./tenancy.js";

/**
 * Demo data — three fields, a growing crop cycle on each, a handful of
 * tasks (TASK-domain-schema §2.8). Kept separate from `seed.ts` so demo
 * data never lands in a database that merely ran `db:seed`, and so its
 * polygons can be regenerated without touching identity seeding.
 *
 * Boundaries are hand-authored, not random: `TASK-fields`'s map has to
 * render something with a plausible shape and a centroid matching the
 * design's footer (4.5831° S / 59.1328° W, design-spec §5.2), and
 * `ST_Area` has to return a farm-sized number. Must run after `db:seed`.
 */

// Matches seed.ts's SEED_ORG_SLUG / SEED_FARM_NAME — the org and farm this
// script attaches demo fields to.
const SEED_ORG_SLUG = "flora-farm";
const SEED_FARM_NAME = "Flora Farm — Amazonas";

interface DemoField {
  name: string;
  center: [number, number];
  cropName: string;
}

const DEMO_FIELDS: DemoField[] = [
  { name: "Field 237", center: [-59.1328, -4.5831], cropName: "Corn" },
  { name: "Field 238", center: [-59.126, -4.5831], cropName: "Wheat" },
  { name: "Field 239", center: [-59.1328, -4.5885], cropName: "Soy" },
];

// ~333m × ~222m per field (a few hectares), spaced far enough apart at this
// latitude (~500m+ between centers) that the rectangles never overlap.
const HALF_LON = 0.0015;
const HALF_LAT = 0.001;

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

    const existing = await db.select().from(fields).where(eq(fields.organizationId, org.id)).limit(1);
    if (existing.length > 0) {
      console.log("Demo fields already exist — skipping");
      return;
    }

    const orgCrops = await db.select().from(crops).where(eq(crops.organizationId, org.id));
    const cropByName = new Map(orgCrops.map((c) => [c.name, c]));

    const farmRows = await db.execute<{ id: string }>(
      sql`select id from farms where organization_id = ${org.id} and name = ${SEED_FARM_NAME}`,
    );
    const farm = farmRows.rows[0];
    if (!farm) {
      throw new Error(`seed farm '${SEED_FARM_NAME}' not found — run 'pnpm db:seed' first`);
    }

    await withOrganization(db, org.id, async (tx) => {
      const statuses = ["todo", "in_progress", "done"] as const;

      for (const [i, demoField] of DEMO_FIELDS.entries()) {
        const fieldId = await insertField(tx, {
          organizationId: org.id,
          farmId: farm.id,
          name: demoField.name,
          boundary: rectangleBoundary(demoField.center),
          position: i + 1,
        });

        const crop = cropByName.get(demoField.cropName);
        if (!crop) {
          throw new Error(`seed crop '${demoField.cropName}' not found — run 'pnpm db:seed' first`);
        }

        await tx.insert(cropCycles).values({
          organizationId: org.id,
          fieldId,
          cropId: crop.id,
          plantedOn: "2026-06-01",
          expectedHarvestOn: "2026-10-01",
          status: "growing",
          quantityKg: null,
        });

        await tx.insert(tasks).values({
          organizationId: org.id,
          fieldId,
          title: `${statuses[i]!.replace("_", " ")} task on ${demoField.name}`,
          status: statuses[i]!,
          activity: "watering",
          position: String(i + 1),
        });
      }
    });

    console.log(`Seeded ${DEMO_FIELDS.length} demo fields, crop cycles and tasks for org ${org.slug}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
