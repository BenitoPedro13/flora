import type { MultiPolygon, TaskActivity } from "@flora/contracts";
import { hash } from "@node-rs/argon2";
import { eq, sql } from "drizzle-orm";
import { createDbClient } from "./client.js";
import { insertField } from "./queries/fields.js";
import { memberships, organizations, users } from "./schema/auth.js";
import { crops } from "./schema/crop.js";
import { cropCycles, fields } from "./schema/field.js";
import { subtasks, taskAssignees, taskComments, tasks } from "./schema/task.js";
import type { Tx } from "./tenancy.js";
import { withOrganization } from "./tenancy.js";

/** Same cost parameters as `seed.ts` / `apps/api/src/auth/password.service.ts`. */
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

/**
 * `TASK-tasks-board` §1.4 row 5 / §2.10: the demo org has one user, but
 * `24:11420`'s cards show a 2–3-person avatar group. Two placeholder
 * teammates, seeded (not real accounts anyone logs into) so assignees are
 * real rows, not mock data.
 */
const SEED_TEAMMATES = [
  { email: "maria@flora.local", name: "Maria Santos" },
  { email: "joao@flora.local", name: "João Silva" },
];

/**
 * Demo data — matched to `1:35172`'s four field cards (TASK-fields §2.12) so
 * the visual diff against the Figma export is a real comparison, not a diff
 * of unrelated copy. Field names, crop species, quantities and activity tags
 * were read off the Figma via the MCP (`get_design_context` on each card:
 * `2158:18884`/`19459`/`19362`/`19539`, file `hY3Nd3BBbJsjpihPnfZgpd`).
 * Growth is derived (never stored, architecture §17 Q10), so `plantedOn` is
 * computed relative to the run date — each field lands on its designed
 * growth percentage on the day the seed runs, against a 100-day cycle so
 * "N days before today" produces exactly N% growth. Idempotent, must run
 * after `db:seed`.
 */

// Matches seed.ts's SEED_ORG_SLUG / SEED_FARM_NAME — the org and farm this
// script attaches demo fields to.
const SEED_ORG_SLUG = "flora-farm";
const SEED_FARM_NAME = "Flora Farm — Amazonas";
const SEED_FARM_TIMEZONE = "America/Manaus";

// A 100-day crop cycle: "N days before today" is exactly N% growth under
// fields.ts's ROUND((today - plantedOn) * 100 / (harvestOn - plantedOn)).
const CYCLE_DAYS = 100;

/**
 * TASK-home-dashboard §2.12: 12 months of **harvested** history across all
 * four seeded crops, so Crops Stocked, Planting Productivity, Gathering Rate
 * and the Regeneration Score's crop-diversity component all have real,
 * multi-crop data instead of "one Corn cycle, 100 days old" (which is all
 * `DEMO_FIELDS` above produces). **Add rows; never repurpose the four
 * growing Corn cycles or the eight non-done tasks** — `fields.spec.ts` and
 * `apps/web/e2e/fields.spec.ts` assert on those (§6 item 14's guard).
 *
 * Each field rotates through the crop list in a different starting order —
 * that's what gives the whole farm's Shannon-evenness component something
 * to score, not just a repeated single crop across fields.
 */
const HISTORICAL_CROPS = ["Corn", "Wheat", "Soy", "Rice"] as const;
const HISTORICAL_HARVEST_OFFSETS_DAYS = [330, 240, 150, 60] as const;
const HISTORICAL_CYCLE_DAYS = 75;

interface DemoField {
  name: string;
  center: [number, number];
  cropName: string;
  quantityKg: number;
  growthPct: number;
  /** Distinct non-done task activities — rendered as the card's activity tags, in enum declaration order. */
  activities: TaskActivity[];
}

const DEMO_FIELDS: DemoField[] = [
  {
    name: "Field 237",
    center: [-59.1328, -4.5831],
    cropName: "Corn",
    quantityKg: 1900,
    growthPct: 30,
    activities: ["watering", "fertilization"],
  },
  {
    name: "Field 238",
    center: [-59.126, -4.5831],
    cropName: "Corn",
    quantityKg: 1900,
    growthPct: 80,
    activities: ["watering", "fertilization"],
  },
  {
    name: "Field 239",
    center: [-59.1328, -4.5885],
    cropName: "Corn",
    quantityKg: 1900,
    growthPct: 10,
    activities: ["planting", "fertilization"],
  },
  {
    name: "Field 240",
    center: [-59.126, -4.5885],
    cropName: "Corn",
    quantityKg: 1900,
    growthPct: 40,
    activities: ["fertilization", "pest_control"],
  },
];

/** The farm-local calendar date (`America/Manaus`), not the server's UTC date — architecture §5.3. */
function farmLocalToday(timezone: string): Date {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  return new Date(`${iso}T00:00:00Z`);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

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

    const orgCrops = await db.select().from(crops).where(eq(crops.organizationId, org.id));
    const cropByName = new Map(orgCrops.map((c) => [c.name, c]));

    const farmRows = await db.execute<{ id: string }>(
      sql`select id from farms where organization_id = ${org.id} and name = ${SEED_FARM_NAME}`,
    );
    const farm = farmRows.rows[0];
    if (!farm) {
      throw new Error(`seed farm '${SEED_FARM_NAME}' not found — run 'pnpm db:seed' first`);
    }

    const today = farmLocalToday(SEED_FARM_TIMEZONE);

    // The four-field demo fixture (fields + growing cycle + tasks) is
    // created once, only when the org has no fields at all — a farmer's own
    // fields (created through the app, not this script) must never be
    // touched or duplicated by it (§2.12's "add rows, never repurpose").
    const existing = await db.select().from(fields).where(eq(fields.organizationId, org.id)).limit(1);
    if (existing.length === 0) {
      await seedDemoFieldsAndTasks(db, org.id, farm.id, cropByName, today);
    } else {
      console.log(`Org already has field(s) — skipping demo field/task creation, backfilling history only`);
    }

    // §2.12: 12 months of harvested history, on **whatever fields the org
    // actually has** — the four just-seeded demo fields, or a farmer's own,
    // real fields. Idempotent per field (skips a field that already has any
    // harvested cycle), so this is safe to run again after the app has since
    // added more real data.
    const historyCount = await backfillHistoricalCropCycles(db, org.id, farm.id, cropByName, today);
    console.log(`Backfilled 12-month harvested history for ${historyCount} field(s)`);
  } finally {
    await pool.end();
  }
}

async function seedDemoFieldsAndTasks(
  db: ReturnType<typeof createDbClient>["db"],
  organizationId: string,
  farmId: string,
  cropByName: Map<string, { id: string }>,
  today: Date,
): Promise<void> {
  const [ownerMembership] = await db.select().from(memberships).where(eq(memberships.organizationId, organizationId)).limit(1);
  if (!ownerMembership) {
    throw new Error(`no membership found for org — run 'pnpm db:seed' first`);
  }

  const teammateIds: string[] = [];
  for (const teammate of SEED_TEAMMATES) {
    const passwordHash = await hash(`${teammate.email}-unused-seed-password`, ARGON2_OPTIONS);
    const [user] = await db.insert(users).values({ email: teammate.email, passwordHash, name: teammate.name }).returning();
    await db.insert(memberships).values({ organizationId, userId: user!.id, role: "operator" });
    teammateIds.push(user!.id);
  }
  const assigneePool = [ownerMembership.userId, ...teammateIds];

  /**
   * Comments, subtasks and assignees on a real task row — so the card's
   * `2` comment count, `1/5` subtask fraction and avatar group are genuine
   * (§2.10), not the mock's fixed numbers. Varies by `seedIndex` only to
   * avoid every card looking identical.
   */
  async function enrichTask(tx: Tx, taskId: string, seedIndex: number) {
    await tx.insert(taskComments).values([
      { organizationId, taskId, authorId: ownerMembership.userId, body: "Checked the field this morning, looks on track." },
      { organizationId, taskId, authorId: assigneePool[seedIndex % assigneePool.length]!, body: "Will follow up tomorrow." },
    ]);

    const subtaskCount = 3 + (seedIndex % 3);
    const doneCount = seedIndex % (subtaskCount + 1);
    await tx.insert(subtasks).values(
      Array.from({ length: subtaskCount }, (_, k) => ({
        organizationId,
        taskId,
        title: `Step ${k + 1}`,
        doneAt: k < doneCount ? new Date() : null,
        position: String(k + 1),
      })),
    );

    const assigneeCount = 1 + (seedIndex % 2);
    const assignees = Array.from(new Set([assigneePool[seedIndex % assigneePool.length]!, ...assigneePool])).slice(0, assigneeCount);
    await tx.insert(taskAssignees).values(assignees.map((userId) => ({ organizationId, taskId, userId })));
  }

  await withOrganization(db, organizationId, async (tx) => {
    let seedIndex = 0;
    for (const [i, demoField] of DEMO_FIELDS.entries()) {
      const fieldId = await insertField(tx, {
        organizationId,
        farmId,
        name: demoField.name,
        boundary: rectangleBoundary(demoField.center),
        position: i + 1,
      });

      const crop = cropByName.get(demoField.cropName);
      if (!crop) {
        throw new Error(`seed crop '${demoField.cropName}' not found — run 'pnpm db:seed' first`);
      }

      const plantedOn = addDays(today, -demoField.growthPct);
      const expectedHarvestOn = addDays(plantedOn, CYCLE_DAYS);

      await tx.insert(cropCycles).values({
        organizationId,
        fieldId,
        cropId: crop.id,
        plantedOn: isoDate(plantedOn),
        expectedHarvestOn: isoDate(expectedHarvestOn),
        status: "growing",
        quantityKg: String(demoField.quantityKg),
      });

      // Non-done tasks whose distinct activities render as the card's
      // activity tags (TASK-domain-schema §7, resolved by TASK-fields §1.1).
      // These eight rows are exactly what `fields.spec.ts` and
      // `apps/web/e2e/fields.spec.ts` assert their activity tags against
      // (§2.10's constraint) — extended with real progress/dates and
      // `enrichTask`, never repurposed to a different status or activity.
      for (const [j, activity] of demoField.activities.entries()) {
        const [row] = await tx
          .insert(tasks)
          .values({
            organizationId,
            fieldId,
            title: `${activity.replace("_", " ")} — ${demoField.name}`,
            status: j === 0 ? "todo" : "in_progress",
            activity,
            progressPct: j === 0 ? 15 : 55,
            startsOn: isoDate(addDays(today, -3)),
            dueOn: isoDate(addDays(today, 11)),
            position: String(j + 1),
          })
          .returning({ id: tasks.id });
        await enrichTask(tx, row!.id, seedIndex++);
      }

      // A third, `done` task per field — the board needs a populated
      // third column, and the seed previously produced none (§1.1, §2.10).
      // A new row, not a repurposing of the two above.
      const doneActivity = demoField.activities[0]!;
      const [doneRow] = await tx
        .insert(tasks)
        .values({
          organizationId,
          fieldId,
          title: `${doneActivity.replace("_", " ")} — ${demoField.name} (completed)`,
          status: "done",
          activity: doneActivity,
          progressPct: 100,
          startsOn: isoDate(addDays(today, -14)),
          dueOn: isoDate(addDays(today, -1)),
          waterVolumeM3: doneActivity === "watering" ? "4.5" : null,
          position: "1",
        })
        .returning({ id: tasks.id });
      await enrichTask(tx, doneRow!.id, seedIndex++);
    }
  });

  console.log(`Seeded ${DEMO_FIELDS.length} demo fields, crop cycles and tasks for the org`);
}

/**
 * §2.12: 12 months of harvested history across all four seeded crops, on
 * every field the org currently has — real fields included, not just
 * `DEMO_FIELDS`. Skips a field that already has any harvested crop cycle,
 * so re-running this script never duplicates history it already wrote.
 * Returns the number of fields it actually backfilled.
 */
async function backfillHistoricalCropCycles(
  db: ReturnType<typeof createDbClient>["db"],
  organizationId: string,
  farmId: string,
  cropByName: Map<string, { id: string }>,
  today: Date,
): Promise<number> {
  const orgFields = await db
    .execute<{ id: string; name: string }>(
      sql`SELECT id, name FROM fields WHERE organization_id = ${organizationId} AND farm_id = ${farmId} ORDER BY position`,
    )
    .then((r) => r.rows);

  let backfilled = 0;
  await withOrganization(db, organizationId, async (tx) => {
    for (const [i, field] of orgFields.entries()) {
      const already = await tx.execute<{ exists: boolean }>(sql`
        SELECT EXISTS (
          SELECT 1 FROM crop_cycles WHERE organization_id = ${organizationId} AND field_id = ${field.id} AND status = 'harvested'
        ) AS exists
      `);
      if (already.rows[0]!.exists) {
        continue;
      }

      for (const [offsetIndex, harvestOffsetDays] of HISTORICAL_HARVEST_OFFSETS_DAYS.entries()) {
        const cropName = HISTORICAL_CROPS[(i + offsetIndex) % HISTORICAL_CROPS.length]!;
        const historicalCrop = cropByName.get(cropName);
        if (!historicalCrop) {
          throw new Error(`seed crop '${cropName}' not found — run 'pnpm db:seed' first`);
        }
        const harvestedOn = addDays(today, -harvestOffsetDays);
        const historicalPlantedOn = addDays(harvestedOn, -HISTORICAL_CYCLE_DAYS);
        await tx.insert(cropCycles).values({
          organizationId,
          fieldId: field.id,
          cropId: historicalCrop.id,
          plantedOn: isoDate(historicalPlantedOn),
          expectedHarvestOn: isoDate(harvestedOn),
          status: "harvested",
          quantityKg: String(400 + i * 50 + offsetIndex * 30),
        });
      }
      backfilled++;
    }
  });

  return backfilled;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
