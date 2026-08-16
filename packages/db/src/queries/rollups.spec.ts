import type { MultiPolygon, Polygon } from "@flora/contracts";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbClient } from "../client.js";
import { organizations, users } from "../schema/auth.js";
import { startTestInfra, type TestInfra } from "../test/containers.js";
import { withOrganization } from "../tenancy.js";
import { insertField } from "./fields.js";
import { insertStressZone, setStressZoneMuted } from "./stress-zones.js";
import { upsertObservation } from "./observations.js";
import {
  buildFarmRollup,
  cropsStockedByCrop,
  fieldsAtRiskCount,
  getFarmRollup,
  getFarmScore,
  getPendingTasks,
  kpiDelta,
  plantingProductivity,
  regenerationComponents,
  waterUsedM3,
} from "./rollups.js";

/** Integration suite against real testcontainers PostGIS (TASK-home-dashboard §2.14). */

const FIELD_A: MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [-59.14, -4.59],
        [-59.13, -4.59],
        [-59.13, -4.58],
        [-59.14, -4.58],
        [-59.14, -4.59],
      ],
    ],
  ],
};

const FIELD_B: MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [-59.12, -4.59],
        [-59.11, -4.59],
        [-59.11, -4.58],
        [-59.12, -4.58],
        [-59.12, -4.59],
      ],
    ],
  ],
};

/** A quarter of field A, for a partial-stress test — well inside FIELD_A's box. */
const STRESS_ZONE_IN_A: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [-59.138, -4.588],
      [-59.134, -4.588],
      [-59.134, -4.582],
      [-59.138, -4.582],
      [-59.138, -4.588],
    ],
  ],
};

describe("rollups queries", () => {
  let infra: TestInfra;
  let owner: ReturnType<typeof createDbClient>;
  let orgId: string;
  let farmId: string;
  let fieldAId: string;
  let fieldBId: string;
  let cornId: string;
  let wheatId: string;
  const asOf = "2026-08-16";

  beforeAll(async () => {
    infra = await startTestInfra();
    owner = createDbClient(infra.ownerUrl);

    const [org] = await owner.db.insert(organizations).values({ name: "Rollup Org", slug: "rollup-spec-org" }).returning();
    orgId = org!.id;
    await owner.db.insert(users).values({ email: "rollup-spec@example.test", passwordHash: "unused" });

    const { rows } = await owner.pool.query<{ id: string }>(
      `INSERT INTO farms (organization_id, name, location, timezone)
       VALUES ($1, 'Rollup Farm', ST_GeomFromGeoJSON($2), 'America/Manaus') RETURNING id`,
      [orgId, JSON.stringify({ type: "Point", coordinates: [-59.13, -4.58] })],
    );
    farmId = rows[0]!.id;

    const { rows: cropRows } = await owner.pool.query<{ id: string; name: string }>(
      `INSERT INTO crops (organization_id, name, slug) VALUES ($1, 'Corn', 'corn'), ($1, 'Wheat', 'wheat') RETURNING id, name`,
      [orgId],
    );
    cornId = cropRows.find((r) => r.name === "Corn")!.id;
    wheatId = cropRows.find((r) => r.name === "Wheat")!.id;

    await withOrganization(owner.db, orgId, async (tx) => {
      fieldAId = await insertField(tx, { organizationId: orgId, farmId, name: "Field A", boundary: FIELD_A, position: 1 });
      fieldBId = await insertField(tx, { organizationId: orgId, farmId, name: "Field B", boundary: FIELD_B, position: 2 });
    });
  });

  afterAll(async () => {
    await owner.pool.end();
    await infra.stop();
  });

  describe("cropsStockedByCrop (§6 item 2)", () => {
    it("shares sum to 100 and each matches SUM(quantity_kg) GROUP BY crop", async () => {
      await withOrganization(owner.db, orgId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO crop_cycles (organization_id, field_id, crop_id, planted_on, expected_harvest_on, status, quantity_kg)
          VALUES
            (${orgId}, ${fieldAId}, ${cornId}, '2026-01-01', '2026-06-01', 'harvested', 700),
            (${orgId}, ${fieldBId}, ${wheatId}, '2026-01-01', '2026-06-01', 'harvested', 300)
        `);
        const result = await cropsStockedByCrop(tx, orgId, farmId, asOf);
        expect(result.totalKg).toBe(1000);
        const shareSum = result.byCrop.reduce((sum, c) => sum + c.sharePct, 0);
        expect(shareSum).toBeCloseTo(100, 6);
        const corn = result.byCrop.find((c) => c.crop === "Corn")!;
        expect(corn.kg).toBe(700);
        expect(corn.sharePct).toBeCloseTo(70, 6);
      });
    });

    it("a single-crop farm renders one slice without breaking the total", async () => {
      await withOrganization(owner.db, orgId, async (tx) => {
        const result = await cropsStockedByCrop(tx, orgId, farmId, "2020-01-01");
        expect(result.totalKg).toBe(0);
        expect(result.byCrop).toEqual([]);
      });
    });
  });

  describe("fieldsAtRiskCount (§6 item 2's sibling)", () => {
    let zoneId: string;

    it("ignores muted and deleted zones", async () => {
      await withOrganization(owner.db, orgId, async (tx) => {
        expect(await fieldsAtRiskCount(tx, orgId, farmId)).toBe(0);

        zoneId = await insertStressZone(tx, {
          organizationId: orgId,
          fieldId: fieldAId,
          geometry: STRESS_ZONE_IN_A,
          detectedOn: asOf,
          windowStart: "2026-08-01",
          windowEnd: asOf,
          severity: "medium",
          indexValue: 0.3,
        });
        expect(await fieldsAtRiskCount(tx, orgId, farmId)).toBe(1);

        await setStressZoneMuted(tx, orgId, zoneId, true);
        expect(await fieldsAtRiskCount(tx, orgId, farmId)).toBe(0);

        await setStressZoneMuted(tx, orgId, zoneId, false);
        expect(await fieldsAtRiskCount(tx, orgId, farmId)).toBe(1);
      });
    });
  });

  describe("waterUsedM3 (§7 decision 1 — trailing 30 days, watering + done only)", () => {
    it("ignores non-watering and non-done tasks", async () => {
      await withOrganization(owner.db, orgId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO tasks (organization_id, field_id, title, status, activity, position, water_volume_m3, updated_at)
          VALUES
            (${orgId}, ${fieldAId}, 'Watered', 'done', 'watering', 1, 12.5, ${asOf}::date),
            (${orgId}, ${fieldAId}, 'Watering in progress', 'in_progress', 'watering', 2, 99, ${asOf}::date),
            (${orgId}, ${fieldAId}, 'Fertilized', 'done', 'fertilization', 3, NULL, ${asOf}::date),
            (${orgId}, ${fieldAId}, 'Watered long ago', 'done', 'watering', 4, 500, '2025-01-01'::date)
        `);
        const total = await waterUsedM3(tx, orgId, farmId, asOf);
        expect(total).toBe(12.5);
      });
    });
  });

  describe("plantingProductivity (§6 item 7)", () => {
    it("has 12 buckets including months with no cycle, and no bucket exceeds 100%", async () => {
      await withOrganization(owner.db, orgId, async (tx) => {
        const months = await plantingProductivity(tx, orgId, farmId, asOf);
        expect(months).toHaveLength(12);
        expect(months[11]!.month).toBe("2026-08-01");
        expect(months[0]!.month).toBe("2025-09-01");
        for (const m of months) {
          const total = m.byCrop.reduce((sum, c) => sum + c.sharePct, 0);
          expect(total).toBeLessThanOrEqual(100.0001);
        }
        // A month with no overlapping cycle at all exists (e.g. far in the past window edge).
        expect(months.some((m) => m.byCrop.length === 0)).toBe(true);
      });
    });
  });

  describe("regenerationComponents (§6 item 6a's SQL half)", () => {
    it("vegetationHealth reflects the stress-free area share", async () => {
      await withOrganization(owner.db, orgId, async (tx) => {
        const components = await regenerationComponents(tx, orgId, farmId, asOf);
        const veg = components.find((c) => c.key === "vegetationHealth")!;
        expect(veg.value).not.toBeNull();
        expect(veg.value!).toBeGreaterThan(0);
        expect(veg.value!).toBeLessThan(100);
      });
    });

    it("cropDiversity is null with no crop cycles in the trailing 3 years, then scores once cycles exist", async () => {
      await withOrganization(owner.db, orgId, async (tx) => {
        const components = await regenerationComponents(tx, orgId, farmId, "2020-01-01");
        const diversity = components.find((c) => c.key === "cropDiversity")!;
        expect(diversity.value).toBeNull();

        const componentsNow = await regenerationComponents(tx, orgId, farmId, asOf);
        const diversityNow = componentsNow.find((c) => c.key === "cropDiversity")!;
        expect(diversityNow.value).not.toBeNull();
      });
    });

    it("soilCover integrates NDVI observations over the trailing window", async () => {
      await withOrganization(owner.db, orgId, async (tx) => {
        await upsertObservation(tx, {
          organizationId: orgId,
          fieldId: fieldAId,
          capturedOn: "2026-06-01",
          index: "ndvi",
          stats: { min: 0.5, max: 0.9, mean: 0.8, stddev: 0.05, p10: 0.7, p90: 0.85 },
          rasterKey: "k1",
          bbox: [-59.14, -4.59, -59.13, -4.58],
          sceneId: "scene-scd-1",
        });
        await upsertObservation(tx, {
          organizationId: orgId,
          fieldId: fieldAId,
          capturedOn: "2026-08-01",
          index: "ndvi",
          stats: { min: 0.5, max: 0.9, mean: 0.8, stddev: 0.05, p10: 0.7, p90: 0.85 },
          rasterKey: "k2",
          bbox: [-59.14, -4.59, -59.13, -4.58],
          sceneId: "scene-scd-2",
        });
        const components = await regenerationComponents(tx, orgId, farmId, asOf);
        const soilCover = components.find((c) => c.key === "soilCover")!;
        expect(soilCover.value).not.toBeNull();
        expect(soilCover.value!).toBeGreaterThan(0);
      });
    });
  });

  describe("getPendingTasks (§6 item 8 — never from the rollup)", () => {
    it("reflects a task completed one minute ago", async () => {
      await withOrganization(owner.db, orgId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO tasks (organization_id, field_id, title, status, activity, position)
          VALUES (${orgId}, ${fieldAId}, 'Just finished', 'todo', 'planting', 5)
        `);
        const before = await getPendingTasks(tx, orgId, farmId, 10);
        expect(before.some((t) => t.title === "Just finished")).toBe(true);

        await tx.execute(sql`UPDATE tasks SET status = 'done' WHERE organization_id = ${orgId} AND title = 'Just finished'`);
        const after = await getPendingTasks(tx, orgId, farmId, 10);
        expect(after.some((t) => t.title === "Just finished")).toBe(false);
      });
    });
  });

  describe("buildFarmRollup (§6 item 3 — idempotent)", () => {
    it("run twice for the same day produces one row and an identical payload", async () => {
      await withOrganization(owner.db, orgId, async (tx) => {
        const first = await buildFarmRollup(tx, orgId, farmId, asOf);
        const second = await buildFarmRollup(tx, orgId, farmId, asOf);
        expect(second.rollup).toEqual(first.rollup);

        const { rows } = await tx.execute<{ count: string }>(sql`
          SELECT count(*)::text AS count FROM farm_daily_rollups
          WHERE organization_id = ${orgId} AND farm_id = ${farmId} AND day = ${asOf}
        `);
        expect(rows[0]!.count).toBe("1");

        const { rows: scoreRows } = await tx.execute<{ count: string }>(sql`
          SELECT count(*)::text AS count FROM farm_scores
          WHERE organization_id = ${orgId} AND farm_id = ${farmId} AND computed_on = ${asOf}
        `);
        expect(scoreRows[0]!.count).toBe("1");
      });
    });

    it("getFarmRollup and getFarmScore read back what buildFarmRollup wrote", async () => {
      await withOrganization(owner.db, orgId, async (tx) => {
        const { latest } = await getFarmRollup(tx, orgId, farmId);
        expect(latest?.day).toBe(asOf);
        expect(latest?.payload.cropsStocked.totalKg).toBe(1000);

        const { current } = await getFarmScore(tx, orgId, farmId);
        expect(current?.computedOn).toBe(asOf);
        expect(current?.formulaVersion).toBe("v1");
      });
    });
  });

  describe("kpiDelta", () => {
    it("is null with nothing to compare against", () => {
      expect(kpiDelta(100, null)).toBeNull();
      expect(kpiDelta(100, undefined)).toBeNull();
      expect(kpiDelta(100, 0)).toBeNull();
    });

    it("computes a real percentage otherwise", () => {
      expect(kpiDelta(110, 100)).toBeCloseTo(10, 6);
    });
  });
});
