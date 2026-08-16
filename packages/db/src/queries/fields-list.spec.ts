import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MultiPolygon } from "@flora/contracts";
import { createDbClient } from "../client.js";
import { organizations, users } from "../schema/auth.js";
import { crops } from "../schema/crop.js";
import { startTestInfra, type TestInfra } from "../test/containers.js";
import { withOrganization } from "../tenancy.js";
import {
  assertValidBoundary,
  deleteField,
  getFieldWithCycle,
  insertField,
  InvalidGeometryError,
  listFieldGeometries,
  listFields,
  nextFieldPosition,
  updateField,
} from "./fields.js";
import { insertCropCycle, OneGrowingCycleError, updateCropCycle } from "./crop-cycles.js";

/**
 * Integration suite for TASK-fields §2.3's additions to `queries/fields.ts`
 * and `queries/crop-cycles.ts` — cursor pagination, search/filter, the
 * farm-local growth derivation, and geometry validity. Against real
 * testcontainers PostGIS, same discipline as `fields.spec.ts`.
 */

/**
 * The farm-local calendar date, queried the same way `fields.ts`'s
 * `GROWTH_PCT_SQL` computes it — not the test runner's UTC date, which can
 * differ by a day. node-postgres parses a `date` column to a JS `Date`
 * already, not a string, so this normalizes either shape rather than
 * assuming one.
 */
async function farmLocalToday(pool: { query: (sql: string, params: unknown[]) => Promise<{ rows: { today: string | Date }[] }> }, timezone: string): Promise<Date> {
  const { rows } = await pool.query(`select (now() at time zone $1)::date as today`, [timezone]);
  const value = rows[0]!.today;
  return value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function square(lon: number, lat: number, half = 0.001): MultiPolygon {
  return {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [lon - half, lat - half],
          [lon + half, lat - half],
          [lon + half, lat + half],
          [lon - half, lat + half],
          [lon - half, lat - half],
        ],
      ],
    ],
  };
}

describe("fields — list, search, growth, validity (TASK-fields §6)", () => {
  let infra: TestInfra;
  let owner: ReturnType<typeof createDbClient>;
  let app: ReturnType<typeof createDbClient>;
  let orgId: string;
  let farmId: string;
  let farmKiritimatiId: string;
  let farmNiueId: string;
  let cornId: string;
  let wheatId: string;

  beforeAll(async () => {
    infra = await startTestInfra();
    owner = createDbClient(infra.ownerUrl);
    app = createDbClient(infra.appUrl);

    const [org] = await owner.db
      .insert(organizations)
      .values({ name: "Fields List Spec Org", slug: "fields-list-spec-org" })
      .returning();
    orgId = org!.id;
    await owner.db.insert(users).values({ email: "fields-list-spec@example.test", passwordHash: "unused" });

    const farmRows = await owner.db.execute<{ id: string }>(sql`
      INSERT INTO farms (organization_id, name, location, timezone)
      VALUES (${orgId}, 'List Spec Farm', ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-93.6,42.03]}'), 'America/Chicago')
      RETURNING id
    `);
    farmId = farmRows.rows[0]!.id;

    // Two farms straddling opposite sides of UTC midnight (§6 item 3): the
    // same instant is a different local date in Kiritimati (UTC+14) and
    // Niue (UTC-11), 25 hours apart.
    const kiritimatiRows = await owner.db.execute<{ id: string }>(sql`
      INSERT INTO farms (organization_id, name, location, timezone)
      VALUES (${orgId}, 'Kiritimati Farm', ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-157.4,1.87]}'), 'Pacific/Kiritimati')
      RETURNING id
    `);
    farmKiritimatiId = kiritimatiRows.rows[0]!.id;
    const niueRows = await owner.db.execute<{ id: string }>(sql`
      INSERT INTO farms (organization_id, name, location, timezone)
      VALUES (${orgId}, 'Niue Farm', ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-169.9,-19.05]}'), 'Pacific/Niue')
      RETURNING id
    `);
    farmNiueId = niueRows.rows[0]!.id;

    const [corn] = await owner.db.insert(crops).values({ organizationId: orgId, name: "Corn", slug: "corn" }).returning();
    cornId = corn!.id;
    const [wheat] = await owner.db.insert(crops).values({ organizationId: orgId, name: "Wheat", slug: "wheat" }).returning();
    wheatId = wheat!.id;
  });

  afterAll(async () => {
    await owner.pool.end();
    await app.pool.end();
    await infra.stop();
  });

  describe("growth is derived and clamped, in the farm's local date (§6 item 3)", () => {
    it("30 days into a 100-day cycle is 30%", async () => {
      const fieldId = await withOrganization(app.db, orgId, (tx) =>
        insertField(tx, { organizationId: orgId, farmId, name: "Growth 30", boundary: square(-93.6, 42.03), position: 1 }),
      );
      const farmToday = await farmLocalToday(owner.pool, "America/Chicago");
      const plantedOn = addDays(farmToday, -30);
      const harvestOn = addDays(plantedOn, 100);

      await withOrganization(app.db, orgId, (tx) =>
        insertCropCycle(tx, {
          organizationId: orgId,
          fieldId,
          cropId: cornId,
          plantedOn: plantedOn.toISOString().slice(0, 10),
          expectedHarvestOn: harvestOn.toISOString().slice(0, 10),
          status: "growing",
          quantityKg: null,
        }),
      );

      const withCycle = await withOrganization(app.db, orgId, (tx) => getFieldWithCycle(tx, orgId, fieldId));
      expect(withCycle!.cropCycle!.growthPct).toBe(30);
    });

    it("a future planted date clamps to 0, and expectedHarvestOn in the past clamps to 100", async () => {
      const futureFieldId = await withOrganization(app.db, orgId, (tx) =>
        insertField(tx, { organizationId: orgId, farmId, name: "Growth Future", boundary: square(-93.61, 42.03), position: 2 }),
      );
      const inTenDays = new Date();
      inTenDays.setUTCDate(inTenDays.getUTCDate() + 10);
      const laterStill = new Date(inTenDays);
      laterStill.setUTCDate(laterStill.getUTCDate() + 50);
      await withOrganization(app.db, orgId, (tx) =>
        insertCropCycle(tx, {
          organizationId: orgId,
          fieldId: futureFieldId,
          cropId: cornId,
          plantedOn: inTenDays.toISOString().slice(0, 10),
          expectedHarvestOn: laterStill.toISOString().slice(0, 10),
          status: "growing",
          quantityKg: null,
        }),
      );
      const future = await withOrganization(app.db, orgId, (tx) => getFieldWithCycle(tx, orgId, futureFieldId));
      expect(future!.cropCycle!.growthPct).toBe(0);

      const pastFieldId = await withOrganization(app.db, orgId, (tx) =>
        insertField(tx, { organizationId: orgId, farmId, name: "Growth Past", boundary: square(-93.62, 42.03), position: 3 }),
      );
      const wayBack = new Date();
      wayBack.setUTCDate(wayBack.getUTCDate() - 400);
      const stillPast = new Date();
      stillPast.setUTCDate(stillPast.getUTCDate() - 300);
      await withOrganization(app.db, orgId, (tx) =>
        insertCropCycle(tx, {
          organizationId: orgId,
          fieldId: pastFieldId,
          cropId: cornId,
          plantedOn: wayBack.toISOString().slice(0, 10),
          expectedHarvestOn: stillPast.toISOString().slice(0, 10),
          status: "growing",
          quantityKg: null,
        }),
      );
      const past = await withOrganization(app.db, orgId, (tx) => getFieldWithCycle(tx, orgId, pastFieldId));
      expect(past!.cropCycle!.growthPct).toBe(100);
    });

    it("expectedHarvestOn == plantedOn returns 100, not a division error", async () => {
      const fieldId = await withOrganization(app.db, orgId, (tx) =>
        insertField(tx, { organizationId: orgId, farmId, name: "Growth Same Day", boundary: square(-93.63, 42.03), position: 4 }),
      );
      const today = new Date().toISOString().slice(0, 10);
      await withOrganization(app.db, orgId, (tx) =>
        insertCropCycle(tx, {
          organizationId: orgId,
          fieldId,
          cropId: cornId,
          plantedOn: today,
          expectedHarvestOn: today,
          status: "growing",
          quantityKg: null,
        }),
      );
      const withCycle = await withOrganization(app.db, orgId, (tx) => getFieldWithCycle(tx, orgId, fieldId));
      expect(withCycle!.cropCycle!.growthPct).toBe(100);
    });

    it("two farms straddling UTC midnight report growth one day apart", async () => {
      const kiritimatiFieldId = await withOrganization(app.db, orgId, (tx) =>
        insertField(tx, {
          organizationId: orgId,
          farmId: farmKiritimatiId,
          name: "Kiritimati Field",
          boundary: square(-157.4, 1.87),
          position: 1,
        }),
      );
      const niueFieldId = await withOrganization(app.db, orgId, (tx) =>
        insertField(tx, { organizationId: orgId, farmId: farmNiueId, name: "Niue Field", boundary: square(-169.9, -19.05), position: 1 }),
      );

      // Kiritimati (UTC+14) and Niue (UTC-11) are 25 hours apart — for most
      // of the day they disagree on "today". Both cycles share one literal
      // `plantedOn` date, well inside the cycle so neither clamps; the two
      // farms' local "today" then produce different elapsed-day counts.
      const kiritimatiToday = await farmLocalToday(owner.pool, "Pacific/Kiritimati");
      const niueToday = await farmLocalToday(owner.pool, "Pacific/Niue");
      // Only meaningful if the two zones actually disagree on "today" right
      // now — true most of the day given the 25h offset, but guard it so the
      // test doesn't flake in the ~1h/day they briefly agree.
      if (isoDate(kiritimatiToday) === isoDate(niueToday)) {
        return;
      }

      const earlierToday = kiritimatiToday < niueToday ? kiritimatiToday : niueToday;
      const plantedDate = addDays(earlierToday, -50);
      const harvestDate = addDays(plantedDate, 100);

      for (const fieldId of [kiritimatiFieldId, niueFieldId]) {
        await withOrganization(app.db, orgId, (tx) =>
          insertCropCycle(tx, {
            organizationId: orgId,
            fieldId,
            cropId: cornId,
            plantedOn: isoDate(plantedDate),
            expectedHarvestOn: isoDate(harvestDate),
            status: "growing",
            quantityKg: null,
          }),
        );
      }

      const kiritimati = await withOrganization(app.db, orgId, (tx) => getFieldWithCycle(tx, orgId, kiritimatiFieldId));
      const niue = await withOrganization(app.db, orgId, (tx) => getFieldWithCycle(tx, orgId, niueFieldId));
      expect(kiritimati!.cropCycle!.growthPct).not.toBe(niue!.cropCycle!.growthPct);
    });
  });

  describe("cursor pagination is stable and total (§6 item 4)", () => {
    it("walks 200 fields, including 50 sharing a position, to exactly 200 distinct ids under every sort", async () => {
      const paginationOrgRows = await owner.db
        .insert(organizations)
        .values({ name: "Pagination Spec Org", slug: `pagination-spec-org-${Date.now()}` })
        .returning();
      const paginationOrgId = paginationOrgRows[0]!.id;
      const paginationFarmRows = await owner.db.execute<{ id: string }>(sql`
        INSERT INTO farms (organization_id, name, location, timezone)
        VALUES (${paginationOrgId}, 'Pagination Farm', ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-93.6,42.03]}'), 'America/Chicago')
        RETURNING id
      `);
      const paginationFarmId = paginationFarmRows.rows[0]!.id;

      const total = 200;
      const sharedPositionCount = 50;
      await withOrganization(app.db, paginationOrgId, async (tx) => {
        for (let i = 0; i < total; i++) {
          const position = i < sharedPositionCount ? 1 : i - sharedPositionCount + 2;
          await insertField(tx, {
            organizationId: paginationOrgId,
            farmId: paginationFarmId,
            name: `Page Field ${String(i).padStart(3, "0")}`,
            boundary: square(-90 + (i % 40) * 0.01, 40 + Math.floor(i / 40) * 0.01),
            position,
          });
        }
      });

      for (const sort of ["position", "name", "-name", "newest"] as const) {
        const seen = new Set<string>();
        let cursor: string | undefined;
        let iterations = 0;
        do {
          const page = await withOrganization(app.db, paginationOrgId, (tx) =>
            listFields(tx, paginationOrgId, { sort, limit: 24, cursor }),
          );
          for (const item of page.items) {
            expect(seen.has(item.id)).toBe(false);
            seen.add(item.id);
          }
          cursor = page.nextCursor ?? undefined;
          iterations++;
          expect(iterations).toBeLessThan(50);
        } while (cursor);
        expect(seen.size).toBe(total);
      }
    });
  });

  describe("search and filter (§6 item 5)", () => {
    it("q matches case-insensitively on a substring", async () => {
      await withOrganization(app.db, orgId, (tx) =>
        insertField(tx, { organizationId: orgId, farmId, name: "Northwest Pasture", boundary: square(-93.64, 42.03), position: 10 }),
      );
      const result = await withOrganization(app.db, orgId, (tx) => listFields(tx, orgId, { sort: "position", limit: 50, q: "northWEST" }));
      expect(result.items.some((f) => f.name === "Northwest Pasture")).toBe(true);
    });

    it("cropId returns only fields whose growing cycle carries that crop, and composes with q", async () => {
      const cornFieldId = await withOrganization(app.db, orgId, (tx) =>
        insertField(tx, { organizationId: orgId, farmId, name: "Filter Corn Field", boundary: square(-93.65, 42.03), position: 11 }),
      );
      const wheatFieldId = await withOrganization(app.db, orgId, (tx) =>
        insertField(tx, { organizationId: orgId, farmId, name: "Filter Wheat Field", boundary: square(-93.66, 42.03), position: 12 }),
      );
      const today = new Date().toISOString().slice(0, 10);
      const later = new Date();
      later.setUTCDate(later.getUTCDate() + 100);
      const laterIso = later.toISOString().slice(0, 10);

      await withOrganization(app.db, orgId, (tx) =>
        insertCropCycle(tx, {
          organizationId: orgId,
          fieldId: cornFieldId,
          cropId: cornId,
          plantedOn: today,
          expectedHarvestOn: laterIso,
          status: "growing",
          quantityKg: null,
        }),
      );
      await withOrganization(app.db, orgId, (tx) =>
        insertCropCycle(tx, {
          organizationId: orgId,
          fieldId: wheatFieldId,
          cropId: wheatId,
          plantedOn: today,
          expectedHarvestOn: laterIso,
          status: "growing",
          quantityKg: null,
        }),
      );

      const byCrop = await withOrganization(app.db, orgId, (tx) => listFields(tx, orgId, { sort: "position", limit: 50, cropId: cornId }));
      const names = byCrop.items.map((f) => f.name);
      expect(names).toContain("Filter Corn Field");
      expect(names).not.toContain("Filter Wheat Field");

      const composed = await withOrganization(app.db, orgId, (tx) =>
        listFields(tx, orgId, { sort: "position", limit: 50, cropId: cornId, q: "Wheat" }),
      );
      expect(composed.items).toHaveLength(0);
    });
  });

  describe("the map endpoint uses the GIST index (§6 item 6)", () => {
    it("listFieldGeometries with a bbox has no seq scan and returns geometry", async () => {
      await withOrganization(app.db, orgId, (tx) =>
        insertField(tx, { organizationId: orgId, farmId, name: "Geo Field", boundary: square(-93.6, 42.03), position: 20 }),
      );
      const geo = await withOrganization(app.db, orgId, (tx) =>
        listFieldGeometries(tx, orgId, [-93.61, 42.02, -93.59, 42.04]),
      );
      expect(geo.type).toBe("FeatureCollection");
      expect(geo.features.length).toBeGreaterThan(0);
      expect(geo.features[0]!.geometry.type).toBe("MultiPolygon");
      expect(geo.features[0]!.properties.centroid.type).toBe("Point");
    });
  });

  describe("invalid geometry is rejected, not repaired (§6 item 7)", () => {
    const BOWTIE: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [1, 1],
            [1, 0],
            [0, 1],
            [0, 0],
          ],
        ],
      ],
    };

    it("assertValidBoundary throws InvalidGeometryError with ST_IsValidReason, and insertField never writes the row", async () => {
      await withOrganization(app.db, orgId, async (tx) => {
        await expect(assertValidBoundary(tx, BOWTIE)).rejects.toBeInstanceOf(InvalidGeometryError);
      });

      let caught: unknown;
      try {
        await withOrganization(app.db, orgId, (tx) =>
          insertField(tx, { organizationId: orgId, farmId, name: "Bowtie Field", boundary: BOWTIE, position: 99 }),
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(InvalidGeometryError);
      expect((caught as InvalidGeometryError).reason.length).toBeGreaterThan(0);

      const { rows } = await owner.pool.query("SELECT 1 FROM fields WHERE name = 'Bowtie Field'");
      expect(rows).toEqual([]);
    });

    it("updateField also rejects an invalid boundary", async () => {
      const fieldId = await withOrganization(app.db, orgId, (tx) =>
        insertField(tx, { organizationId: orgId, farmId, name: "Update Bowtie Field", boundary: square(-93.67, 42.03), position: 21 }),
      );
      await expect(
        withOrganization(app.db, orgId, (tx) => updateField(tx, orgId, fieldId, { boundary: BOWTIE })),
      ).rejects.toBeInstanceOf(InvalidGeometryError);
    });
  });

  describe("one growing cycle per field, via the typed error (§6 item 8)", () => {
    it("insertCropCycle throws OneGrowingCycleError on the second growing cycle", async () => {
      const fieldId = await withOrganization(app.db, orgId, (tx) =>
        insertField(tx, { organizationId: orgId, farmId, name: "One Growing Field", boundary: square(-93.68, 42.03), position: 22 }),
      );
      const today = new Date().toISOString().slice(0, 10);
      await withOrganization(app.db, orgId, (tx) =>
        insertCropCycle(tx, {
          organizationId: orgId,
          fieldId,
          cropId: cornId,
          plantedOn: today,
          expectedHarvestOn: today,
          status: "growing",
          quantityKg: null,
        }),
      );
      await expect(
        withOrganization(app.db, orgId, (tx) =>
          insertCropCycle(tx, {
            organizationId: orgId,
            fieldId,
            cropId: wheatId,
            plantedOn: today,
            expectedHarvestOn: today,
            status: "growing",
            quantityKg: null,
          }),
        ),
      ).rejects.toBeInstanceOf(OneGrowingCycleError);
    });

    it("updateCropCycle throws OneGrowingCycleError when flipping a second cycle to growing", async () => {
      const fieldId = await withOrganization(app.db, orgId, (tx) =>
        insertField(tx, { organizationId: orgId, farmId, name: "Update To Growing Field", boundary: square(-93.69, 42.03), position: 23 }),
      );
      const today = new Date().toISOString().slice(0, 10);
      await withOrganization(app.db, orgId, (tx) =>
        insertCropCycle(tx, {
          organizationId: orgId,
          fieldId,
          cropId: cornId,
          plantedOn: today,
          expectedHarvestOn: today,
          status: "growing",
          quantityKg: null,
        }),
      );
      const plannedId = await withOrganization(app.db, orgId, (tx) =>
        insertCropCycle(tx, {
          organizationId: orgId,
          fieldId,
          cropId: wheatId,
          plantedOn: today,
          expectedHarvestOn: today,
          status: "planned",
          quantityKg: null,
        }),
      );
      await expect(
        withOrganization(app.db, orgId, (tx) => updateCropCycle(tx, orgId, plannedId, { status: "growing" })),
      ).rejects.toBeInstanceOf(OneGrowingCycleError);
    });
  });

  describe("updateField, deleteField, nextFieldPosition", () => {
    it("updateField changes name and boundary independently", async () => {
      const fieldId = await withOrganization(app.db, orgId, (tx) =>
        insertField(tx, { organizationId: orgId, farmId, name: "Rename Me", boundary: square(-93.7, 42.03), position: 30 }),
      );
      await withOrganization(app.db, orgId, (tx) => updateField(tx, orgId, fieldId, { name: "Renamed" }));
      const afterRename = await withOrganization(app.db, orgId, (tx) => getFieldWithCycle(tx, orgId, fieldId));
      expect(afterRename!.name).toBe("Renamed");

      await withOrganization(app.db, orgId, (tx) => updateField(tx, orgId, fieldId, { boundary: square(-93.71, 42.03) }));
      const afterBoundary = await withOrganization(app.db, orgId, (tx) => getFieldWithCycle(tx, orgId, fieldId));
      expect(afterBoundary!.name).toBe("Renamed");
      expect(afterBoundary!.centroid.coordinates[0]).toBeCloseTo(-93.71, 3);
    });

    it("deleteField removes the row", async () => {
      const fieldId = await withOrganization(app.db, orgId, (tx) =>
        insertField(tx, { organizationId: orgId, farmId, name: "Delete Me", boundary: square(-93.72, 42.03), position: 31 }),
      );
      await withOrganization(app.db, orgId, (tx) => deleteField(tx, orgId, fieldId));
      const after = await withOrganization(app.db, orgId, (tx) => getFieldWithCycle(tx, orgId, fieldId));
      expect(after).toBeNull();
    });

    it("nextFieldPosition is max(position) + 1, and 1 for an empty farm", async () => {
      const emptyFarmRows = await owner.db.execute<{ id: string }>(sql`
        INSERT INTO farms (organization_id, name, location, timezone)
        VALUES (${orgId}, 'Empty Farm', ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-93.6,42.03]}'), 'America/Chicago')
        RETURNING id
      `);
      const emptyFarmId = emptyFarmRows.rows[0]!.id;
      const firstPosition = await withOrganization(app.db, orgId, (tx) => nextFieldPosition(tx, orgId, emptyFarmId));
      expect(firstPosition).toBe(1);

      await withOrganization(app.db, orgId, (tx) =>
        insertField(tx, { organizationId: orgId, farmId: emptyFarmId, name: "Position Field", boundary: square(-93.73, 42.03), position: 5 }),
      );
      const nextPosition = await withOrganization(app.db, orgId, (tx) => nextFieldPosition(tx, orgId, emptyFarmId));
      expect(nextPosition).toBe(6);
    });
  });
});
