import type { MultiPolygon, ObservationStats } from "@flora/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbClient } from "../client.js";
import { organizations, users } from "../schema/auth.js";
import { startTestInfra, type TestInfra } from "../test/containers.js";
import { withOrganization } from "../tenancy.js";
import { insertField } from "./fields.js";
import {
  allObservationsExist,
  getFieldBoundaryForRefresh,
  listObservationDates,
  listObservations,
  observationExists,
  upsertObservation,
} from "./observations.js";

/** Integration suite against real testcontainers PostGIS (TASK-satellite-pipeline §2.10). */

const BOUNDARY: MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [-59.134, -4.585],
        [-59.132, -4.585],
        [-59.132, -4.583],
        [-59.134, -4.583],
        [-59.134, -4.585],
      ],
    ],
  ],
};

const STATS: ObservationStats = { min: 0.1, max: 0.9, mean: 0.55, stddev: 0.12, p10: 0.3, p90: 0.75 };

describe("observations queries", () => {
  let infra: TestInfra;
  let owner: ReturnType<typeof createDbClient>;
  let orgId: string;
  let fieldId: string;

  beforeAll(async () => {
    infra = await startTestInfra();
    owner = createDbClient(infra.ownerUrl);

    const [org] = await owner.db.insert(organizations).values({ name: "Obs Org", slug: "obs-spec-org" }).returning();
    orgId = org!.id;
    await owner.db.insert(users).values({ email: "obs-spec@example.test", passwordHash: "unused" });

    const { rows } = await owner.pool.query<{ id: string }>(
      `INSERT INTO farms (organization_id, name, location, timezone)
       VALUES ($1, 'Obs Farm', ST_GeomFromGeoJSON($2), 'America/Manaus') RETURNING id`,
      [orgId, JSON.stringify({ type: "Point", coordinates: [-59.13, -4.58] })],
    );
    const farmId = rows[0]!.id;

    await withOrganization(owner.db, orgId, async (tx) => {
      fieldId = await insertField(tx, { organizationId: orgId, farmId, name: "Obs Field", boundary: BOUNDARY, position: 1 });
    });
  });

  afterAll(async () => {
    await owner.pool.end();
    await infra.stop();
  });

  it("upserts, then overwrites on the same (field, date, index) rather than duplicating", async () => {
    await withOrganization(owner.db, orgId, async (tx) => {
      await upsertObservation(tx, {
        organizationId: orgId,
        fieldId,
        capturedOn: "2026-08-01",
        index: "ndvi",
        stats: STATS,
        rasterKey: `rasters/${orgId}/${fieldId}/ndvi/2026-08-01.png`,
        bbox: [-59.134, -4.585, -59.132, -4.583],
        sceneId: "scene-1",
      });
      await upsertObservation(tx, {
        organizationId: orgId,
        fieldId,
        capturedOn: "2026-08-01",
        index: "ndvi",
        stats: { ...STATS, mean: 0.6 },
        rasterKey: `rasters/${orgId}/${fieldId}/ndvi/2026-08-01.png`,
        bbox: [-59.134, -4.585, -59.132, -4.583],
        sceneId: "scene-1-rerun",
      });

      const rows = await listObservations(tx, orgId, fieldId, { index: "ndvi" });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.stats.mean).toBe(0.6);
      expect(rows[0]!.sceneId).toBe("scene-1-rerun");
    });
  });

  it("observationExists is the cheapest-possible-skip check (§2.4 step 1)", async () => {
    await withOrganization(owner.db, orgId, async (tx) => {
      expect(await observationExists(tx, orgId, fieldId, "2026-08-01", "ndvi")).toBe(true);
      expect(await observationExists(tx, orgId, fieldId, "2026-08-02", "ndvi")).toBe(false);
    });
  });

  it("allObservationsExist is true only once every requested index has a row (found live: a lone pre-existing NDVI row must not block backfilling the rest)", async () => {
    await withOrganization(owner.db, orgId, async (tx) => {
      // Only 'ndvi' exists for this date (from the test above) — 'ndre' does not.
      expect(await allObservationsExist(tx, orgId, fieldId, "2026-08-01", ["ndvi"])).toBe(true);
      expect(await allObservationsExist(tx, orgId, fieldId, "2026-08-01", ["ndvi", "ndre"])).toBe(false);

      await upsertObservation(tx, {
        organizationId: orgId,
        fieldId,
        capturedOn: "2026-08-01",
        index: "ndre",
        stats: STATS,
        rasterKey: `rasters/${orgId}/${fieldId}/ndre/2026-08-01.png`,
        bbox: [-59.134, -4.585, -59.132, -4.583],
        sceneId: "scene-1",
      });
      expect(await allObservationsExist(tx, orgId, fieldId, "2026-08-01", ["ndvi", "ndre"])).toBe(true);
    });
  });

  it("lists dates only, most recent first, for the date picker", async () => {
    await withOrganization(owner.db, orgId, async (tx) => {
      await upsertObservation(tx, {
        organizationId: orgId,
        fieldId,
        capturedOn: "2026-07-20",
        index: "ndvi",
        stats: STATS,
        rasterKey: "k",
        bbox: [0, 0, 1, 1],
        sceneId: "scene-2",
      });
      const dates = await listObservationDates(tx, orgId, fieldId, "ndvi");
      expect(dates[0]).toBe("2026-08-01");
      expect(dates).toContain("2026-07-20");
    });
  });

  it("getFieldBoundaryForRefresh returns the boundary and its envelope for the worker's one read", async () => {
    await withOrganization(owner.db, orgId, async (tx) => {
      const result = await getFieldBoundaryForRefresh(tx, orgId, fieldId);
      expect(result).not.toBeNull();
      expect(result!.boundary.type).toBe("MultiPolygon");
      const [west, south, east, north] = result!.bbox;
      expect(west).toBeCloseTo(-59.134, 5);
      expect(south).toBeCloseTo(-4.585, 5);
      expect(east).toBeCloseTo(-59.132, 5);
      expect(north).toBeCloseTo(-4.583, 5);
    });
  });
});
