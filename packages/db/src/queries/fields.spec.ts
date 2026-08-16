import { area as turfArea } from "@turf/turf";
import type { MultiPolygon } from "@flora/contracts";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbClient } from "../client.js";
import { organizations, users } from "../schema/auth.js";
import { crops } from "../schema/crop.js";
import { cropCycles, fields } from "../schema/field.js";
import { observations } from "../schema/observation.js";
import { stressZones } from "../schema/stress.js";
import { taskAssignees, tasks } from "../schema/task.js";
import { startTestInfra, type TestInfra } from "../test/containers.js";
import { withOrganization } from "../tenancy.js";
import { getField, insertField, listFieldsInBbox, updateFieldBoundary } from "./fields.js";

/**
 * Integration suite against real testcontainers PostGIS — the acceptance
 * test TASK-domain-schema §6 items 2–9 exist for. Not unit tests: the thing
 * under test is the schema and the PostGIS/RLS boundary itself.
 */

const AREA_TOLERANCE_PCT = 0.5;
const COORD_TOLERANCE = 1e-9;

const KNOWN_SQUARE: MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [-93.62, 42.03],
        [-93.615, 42.03],
        [-93.615, 42.034],
        [-93.62, 42.034],
        [-93.62, 42.03],
      ],
    ],
  ],
};

// Two parts, the first with an interior ring — proves the round-trip on
// exactly the geometry complexity real fields have (§6 item 3).
const KNOWN_MULTI_WITH_HOLE: MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [-93.62, 42.03],
        [-93.6, 42.03],
        [-93.6, 42.05],
        [-93.62, 42.05],
        [-93.62, 42.03],
      ],
      [
        [-93.615, 42.035],
        [-93.605, 42.035],
        [-93.605, 42.045],
        [-93.615, 42.045],
        [-93.615, 42.035],
      ],
    ],
    [
      [
        [-93.5, 42.03],
        [-93.49, 42.03],
        [-93.49, 42.04],
        [-93.5, 42.04],
        [-93.5, 42.03],
      ],
    ],
  ],
};

function coordsApproxEqual(a: unknown, b: unknown): boolean {
  const flatA = (a as number[][]).flat(4) as number[];
  const flatB = (b as number[][]).flat(4) as number[];
  return flatA.length === flatB.length && flatA.every((v, i) => Math.abs(v - flatB[i]!) < COORD_TOLERANCE);
}

describe("fields — the geometry read/write pattern and domain schema", () => {
  let infra: TestInfra;
  let owner: ReturnType<typeof createDbClient>;
  let app: ReturnType<typeof createDbClient>;
  let orgAId: string;
  let orgBId: string;
  let farmAId: string;
  let farmBId: string;
  let cropAId: string;
  let userId: string;

  beforeAll(async () => {
    infra = await startTestInfra();
    owner = createDbClient(infra.ownerUrl);
    app = createDbClient(infra.appUrl);

    const [orgA] = await owner.db
      .insert(organizations)
      .values({ name: "Fields Spec Org A", slug: "fields-spec-org-a" })
      .returning();
    const [orgB] = await owner.db
      .insert(organizations)
      .values({ name: "Fields Spec Org B", slug: "fields-spec-org-b" })
      .returning();
    orgAId = orgA!.id;
    orgBId = orgB!.id;

    const [user] = await owner.db
      .insert(users)
      .values({ email: "fields-spec@example.test", passwordHash: "unused" })
      .returning();
    userId = user!.id;

    const farmRowsA = await owner.db.execute<{ id: string }>(sql`
      INSERT INTO farms (organization_id, name, location, timezone)
      VALUES (${orgAId}, 'Org A Farm', ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-93.6,42.03]}'), 'America/Chicago')
      RETURNING id
    `);
    farmAId = farmRowsA.rows[0]!.id;

    const farmRowsB = await owner.db.execute<{ id: string }>(sql`
      INSERT INTO farms (organization_id, name, location, timezone)
      VALUES (${orgBId}, 'Org B Farm', ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-93.6,42.03]}'), 'America/Chicago')
      RETURNING id
    `);
    farmBId = farmRowsB.rows[0]!.id;

    const [cropA] = await owner.db
      .insert(crops)
      .values({ organizationId: orgAId, name: "Corn", slug: "corn" })
      .returning();
    cropAId = cropA!.id;
  });

  afterAll(async () => {
    await owner.pool.end();
    await app.pool.end();
    await infra.stop();
  });

  it("area is derived and correct, and no area column exists on fields (§6 item 2)", async () => {
    const fieldId = await withOrganization(app.db, orgAId, (tx) =>
      insertField(tx, {
        organizationId: orgAId,
        farmId: farmAId,
        name: "Area Test Field",
        boundary: KNOWN_SQUARE,
        position: 1,
      }),
    );

    const field = await withOrganization(app.db, orgAId, (tx) => getField(tx, orgAId, fieldId));
    expect(field).not.toBeNull();

    const turfAreaM2 = turfArea({ type: "Feature", properties: {}, geometry: KNOWN_SQUARE });
    const deltaPct = (Math.abs(field!.areaM2 - turfAreaM2) / turfAreaM2) * 100;
    expect(deltaPct).toBeLessThanOrEqual(AREA_TOLERANCE_PCT);

    const { rows: columns } = await owner.pool.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'fields'
        AND column_name IN ('area', 'area_m2', 'acres', 'hectares')
    `);
    expect(columns).toEqual([]);
  });

  it("round-trips a MultiPolygon with an interior ring and two parts (§6 item 3)", async () => {
    const fieldId = await withOrganization(app.db, orgAId, (tx) =>
      insertField(tx, {
        organizationId: orgAId,
        farmId: farmAId,
        name: "Roundtrip Test Field",
        boundary: KNOWN_MULTI_WITH_HOLE,
        position: 2,
      }),
    );

    const field = await withOrganization(app.db, orgAId, (tx) => getField(tx, orgAId, fieldId));
    expect(field!.boundary.type).toBe("MultiPolygon");
    expect(coordsApproxEqual(field!.boundary.coordinates, KNOWN_MULTI_WITH_HOLE.coordinates)).toBe(true);

    const updated: MultiPolygon = KNOWN_SQUARE;
    await withOrganization(app.db, orgAId, (tx) => updateFieldBoundary(tx, orgAId, fieldId, updated));
    const afterUpdate = await withOrganization(app.db, orgAId, (tx) => getField(tx, orgAId, fieldId));
    expect(coordsApproxEqual(afterUpdate!.boundary.coordinates, updated.coordinates)).toBe(true);
  });

  it("the GIST index is used for a bbox query, not a seq scan (§6 item 4)", async () => {
    // Scattered widely so the boundary predicate is genuinely selective —
    // on a testcontainers fixture this small, a seq scan of everything is
    // legitimately the cheapest plan, same as it was for geo_spike
    // (architecture §5.2), so this isolates the boundary predicate alone
    // (no organization_id, which listFieldsInBbox also filters by as the
    // repository half of invariant 6, but which is nearly non-selective on
    // this single-org fixture and would otherwise make the comparison
    // meaningless) to prove the index itself is chosen and works.
    await owner.db.execute(sql`
      INSERT INTO fields (organization_id, farm_id, name, boundary, position)
      SELECT
        ${orgAId}, ${farmAId}, 'Bbox Scatter ' || gs,
        ST_MakeEnvelope(lon - 0.001, lat - 0.001, lon + 0.001, lat + 0.001, 4326)::geography,
        gs
      FROM (
        SELECT gs, (gs % 360 - 180)::float AS lon, ((gs * 7) % 160 - 80)::float AS lat
        FROM generate_series(1, 2000) AS gs
      ) t
    `);
    await owner.pool.query("ANALYZE fields");

    // gs = 1 → lon = 1 % 360 - 180 = -179, lat = (1*7) % 160 - 80 = -73.
    const { rows } = await owner.pool.query<{ "QUERY PLAN": string }>(`
      EXPLAIN
      SELECT id FROM fields
      WHERE boundary && ST_MakeEnvelope(-179.01, -73.01, -178.99, -72.99, 4326)::geography
    `);
    const plan = rows.map((r) => r["QUERY PLAN"]).join("\n");
    expect(plan).toMatch(/Index Scan/i);
    expect(plan).toContain("fields_boundary_gist");
    expect(plan).not.toMatch(/Seq Scan/i);

    // listFieldsInBbox itself still returns the right row under the real,
    // organization_id-filtered predicate.
    const found = await withOrganization(app.db, orgAId, (tx) =>
      listFieldsInBbox(tx, orgAId, [-179.01, -73.01, -178.99, -72.99]),
    );
    expect(found.map((f) => f.name)).toContain("Bbox Scatter 1");
  });

  it("allows at most one growing crop cycle per field (§6 item 5)", async () => {
    const fieldId = await withOrganization(app.db, orgAId, (tx) =>
      insertField(tx, {
        organizationId: orgAId,
        farmId: farmAId,
        name: "Growing Cycle Field",
        boundary: KNOWN_SQUARE,
        position: 3,
      }),
    );

    await withOrganization(app.db, orgAId, (tx) =>
      tx.insert(cropCycles).values({
        organizationId: orgAId,
        fieldId,
        cropId: cropAId,
        plantedOn: "2026-01-01",
        expectedHarvestOn: "2026-06-01",
        status: "growing",
      }),
    );

    let caught: unknown;
    try {
      await withOrganization(app.db, orgAId, (tx) =>
        tx.insert(cropCycles).values({
          organizationId: orgAId,
          fieldId,
          cropId: cropAId,
          plantedOn: "2026-02-01",
          expectedHarvestOn: "2026-07-01",
          status: "growing",
        }),
      );
    } catch (err) {
      caught = err;
    }
    const cause = (caught as { cause?: unknown } | undefined)?.cause;
    expect(cause).toBeInstanceOf(Error);
    expect((cause as { code?: string }).code).toBe("23505");

    // A second 'harvested' cycle (not 'growing') is unconstrained.
    await expect(
      withOrganization(app.db, orgAId, (tx) =>
        tx.insert(cropCycles).values({
          organizationId: orgAId,
          fieldId,
          cropId: cropAId,
          plantedOn: "2025-01-01",
          expectedHarvestOn: "2025-06-01",
          status: "harvested",
        }),
      ),
    ).resolves.not.toThrow();
  });

  describe("composite FKs reject cross-org parents (§6 item 6)", () => {
    let fieldAId: string;

    beforeAll(async () => {
      fieldAId = await withOrganization(app.db, orgAId, (tx) =>
        insertField(tx, {
          organizationId: orgAId,
          farmId: farmAId,
          name: "Cross Org Parent Field",
          boundary: KNOWN_SQUARE,
          position: 4,
        }),
      );
    });

    async function expectForeignKeyViolation(fn: () => Promise<unknown>): Promise<void> {
      let caught: unknown;
      try {
        await fn();
      } catch (err) {
        caught = err;
      }
      const cause = (caught as { cause?: unknown } | undefined)?.cause;
      expect(cause).toBeInstanceOf(Error);
      expect((cause as { code?: string }).code).toBe("23503");
    }

    it("rejects a crop cycle carrying org B's id with org A's field", async () => {
      await expectForeignKeyViolation(() =>
        withOrganization(app.db, orgBId, (tx) =>
          tx.insert(cropCycles).values({
            organizationId: orgBId,
            fieldId: fieldAId,
            cropId: cropAId,
            plantedOn: "2026-01-01",
            expectedHarvestOn: "2026-06-01",
            status: "planned",
          }),
        ),
      );
    });

    it("rejects an observation carrying org B's id with org A's field", async () => {
      await expectForeignKeyViolation(() =>
        owner.db.execute(sql`
          INSERT INTO observations (organization_id, field_id, captured_on, index, stats, raster_key, bbox, scene_id)
          VALUES (
            ${orgBId}, ${fieldAId}, '2026-01-01', 'ndvi',
            '{"min":0,"max":1,"mean":0.5,"stddev":0.1,"p10":0.2,"p90":0.8}',
            'rasters/x.png',
            '[-1,-1,1,1]',
            'scene-1'
          )
        `),
      );
    });

    it("rejects a stress zone carrying org B's id with org A's field", async () => {
      await expectForeignKeyViolation(() =>
        owner.db.execute(sql`
          INSERT INTO stress_zones (organization_id, field_id, geometry, detected_on, window_start, window_end, classification, severity, index_value)
          VALUES (
            ${orgBId}, ${fieldAId}, ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[-93.62,42.03],[-93.615,42.03],[-93.615,42.034],[-93.62,42.034],[-93.62,42.03]]]}'),
            '2026-01-01', '2026-01-01', '2026-01-08', 'low_vigor', 'low', 0.4
          )
        `),
      );
    });

    it("rejects a task carrying org B's id with org A's field", async () => {
      await expectForeignKeyViolation(() =>
        withOrganization(app.db, orgBId, (tx) =>
          tx.insert(tasks).values({
            organizationId: orgBId,
            fieldId: fieldAId,
            title: "Cross org task",
            status: "todo",
            activity: "watering",
            position: "1",
          }),
        ),
      );
    });

    it("rejects a task assignee for a user with no membership in the owning org", async () => {
      const taskId = await withOrganization(app.db, orgAId, async (tx) => {
        const [row] = await tx
          .insert(tasks)
          .values({
            organizationId: orgAId,
            fieldId: fieldAId,
            title: "Assignee FK Task",
            status: "todo",
            activity: "watering",
            position: "2",
          })
          .returning();
        return row!.id;
      });

      await expectForeignKeyViolation(() =>
        withOrganization(app.db, orgAId, (tx) =>
          tx.insert(taskAssignees).values({ organizationId: orgAId, taskId, userId }),
        ),
      );
    });
  });

  it("cascades from a deleted field and sets tasks.field_id null, keeping organization_id (§6 item 7)", async () => {
    const fieldId = await withOrganization(app.db, orgAId, (tx) =>
      insertField(tx, {
        organizationId: orgAId,
        farmId: farmAId,
        name: "Cascade Test Field",
        boundary: KNOWN_SQUARE,
        position: 5,
      }),
    );

    await withOrganization(app.db, orgAId, (tx) =>
      tx.insert(cropCycles).values({
        organizationId: orgAId,
        fieldId,
        cropId: cropAId,
        plantedOn: "2026-01-01",
        expectedHarvestOn: "2026-06-01",
        status: "planned",
      }),
    );
    await owner.db.execute(sql`
      INSERT INTO observations (organization_id, field_id, captured_on, index, stats, raster_key, bbox, scene_id)
      VALUES (
        ${orgAId}, ${fieldId}, '2026-01-01', 'ndvi',
        '{"min":0,"max":1,"mean":0.5,"stddev":0.1,"p10":0.2,"p90":0.8}',
        'rasters/x.png', '[-1,-1,1,1]', 'scene-1'
      )
    `);
    await owner.db.execute(sql`
      INSERT INTO stress_zones (organization_id, field_id, geometry, detected_on, window_start, window_end, classification, severity, index_value)
      VALUES (
        ${orgAId}, ${fieldId}, ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[-93.62,42.03],[-93.615,42.03],[-93.615,42.034],[-93.62,42.034],[-93.62,42.03]]]}'),
        '2026-01-01', '2026-01-01', '2026-01-08', 'low_vigor', 'low', 0.4
      )
    `);
    const taskId = await withOrganization(app.db, orgAId, async (tx) => {
      const [row] = await tx
        .insert(tasks)
        .values({
          organizationId: orgAId,
          fieldId,
          title: "Survives Field Deletion",
          status: "todo",
          activity: "watering",
          position: "3",
        })
        .returning();
      return row!.id;
    });

    await owner.db.execute(sql`DELETE FROM fields WHERE id = ${fieldId}`);

    const { rows: cycles } = await owner.pool.query("SELECT 1 FROM crop_cycles WHERE field_id = $1", [fieldId]);
    const { rows: obs } = await owner.pool.query("SELECT 1 FROM observations WHERE field_id = $1", [fieldId]);
    const { rows: zones } = await owner.pool.query("SELECT 1 FROM stress_zones WHERE field_id = $1", [fieldId]);
    expect(cycles).toEqual([]);
    expect(obs).toEqual([]);
    expect(zones).toEqual([]);

    const { rows: survivingTask } = await owner.pool.query<{ field_id: string | null; organization_id: string }>(
      "SELECT field_id, organization_id FROM tasks WHERE id = $1",
      [taskId],
    );
    expect(survivingTask).toHaveLength(1);
    expect(survivingTask[0]!.field_id).toBeNull();
    expect(survivingTask[0]!.organization_id).toBe(orgAId);
  });

  it("upserts an observation on (field_id, captured_on, index), leaving one row (§6 item 8)", async () => {
    const fieldId = await withOrganization(app.db, orgAId, (tx) =>
      insertField(tx, {
        organizationId: orgAId,
        farmId: farmAId,
        name: "Observation Upsert Field",
        boundary: KNOWN_SQUARE,
        position: 6,
      }),
    );

    const upsert = (statsJson: string, rasterKey: string) =>
      owner.db.execute(sql`
        INSERT INTO observations (organization_id, field_id, captured_on, index, stats, raster_key, bbox, scene_id)
        VALUES (${orgAId}, ${fieldId}, '2026-03-01', 'ndvi', ${statsJson}::jsonb, ${rasterKey}, '[-1,-1,1,1]', 'scene-1')
        ON CONFLICT (field_id, captured_on, index) DO UPDATE
          SET stats = excluded.stats, raster_key = excluded.raster_key
      `);

    await upsert('{"min":0,"max":1,"mean":0.5,"stddev":0.1,"p10":0.2,"p90":0.8}', "rasters/first.png");
    await upsert('{"min":0,"max":1,"mean":0.7,"stddev":0.05,"p10":0.4,"p90":0.9}', "rasters/second.png");

    const { rows } = await owner.pool.query<{ raster_key: string; mean: number }>(
      "SELECT raster_key, (stats->>'mean')::float AS mean FROM observations WHERE field_id = $1",
      [fieldId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.raster_key).toBe("rasters/second.png");
    expect(rows[0]!.mean).toBe(0.7);
  });

  describe("RLS holds on the new tables without HTTP (§6 item 9)", () => {
    it("returns only the caller's org's fields when the GUC is set, zero with none, and rejects a cross-org insert", async () => {
      const fieldId = await withOrganization(app.db, orgAId, (tx) =>
        insertField(tx, {
          organizationId: orgAId,
          farmId: farmAId,
          name: "RLS Test Field",
          boundary: KNOWN_SQUARE,
          position: 7,
        }),
      );

      const seenByOrgA = await withOrganization(app.db, orgAId, (tx) =>
        tx.select().from(fields).where(sql`id = ${fieldId}`),
      );
      expect(seenByOrgA).toHaveLength(1);

      const seenByOrgB = await withOrganization(app.db, orgBId, (tx) =>
        tx.select().from(fields).where(sql`id = ${fieldId}`),
      );
      expect(seenByOrgB).toHaveLength(0);

      const seenWithNoGuc = await app.db.select().from(fields).where(sql`id = ${fieldId}`);
      expect(seenWithNoGuc).toHaveLength(0);

      let caught: unknown;
      try {
        await withOrganization(app.db, orgAId, (tx) =>
          tx.insert(fields).values({
            organizationId: orgBId,
            farmId: farmBId,
            name: "Should Be Rejected",
            boundary: sql`ST_GeomFromGeoJSON('{"type":"MultiPolygon","coordinates":[[[[-93.62,42.03],[-93.615,42.03],[-93.615,42.034],[-93.62,42.034],[-93.62,42.03]]]]}')` as unknown as string,
            position: "1",
          }),
        );
      } catch (err) {
        caught = err;
      }
      const cause = (caught as { cause?: unknown } | undefined)?.cause;
      const message = cause instanceof Error ? cause.message : String(caught);
      expect(message).toMatch(/row-level security/i);
    });

    it("has RLS enabled with an app_current_org() policy on all ten domain tables", async () => {
      const domainTables = [
        "farms",
        "crops",
        "fields",
        "crop_cycles",
        "observations",
        "stress_zones",
        "tasks",
        "task_assignees",
        "task_comments",
        "subtasks",
      ];
      const { rows } = await owner.pool.query<{ relname: string; relrowsecurity: boolean }>(`
        SELECT c.relname, c.relrowsecurity
        FROM pg_class c
        WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY($1)
      `, [domainTables]);
      expect(rows).toHaveLength(domainTables.length);
      for (const row of rows) {
        expect(row.relrowsecurity).toBe(true);
      }

      const { rows: policies } = await owner.pool.query<{ tablename: string }>(`
        SELECT tablename FROM pg_policies
        WHERE schemaname = 'public' AND tablename = ANY($1) AND qual LIKE '%app_current_org()%'
      `, [domainTables]);
      expect(policies.map((p) => p.tablename).sort()).toEqual([...domainTables].sort());
    });
  });
});

