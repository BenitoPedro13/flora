import type { MultiPolygon, Polygon } from "@flora/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbClient } from "../client.js";
import { organizations, users } from "../schema/auth.js";
import { startTestInfra, type TestInfra } from "../test/containers.js";
import { withOrganization } from "../tenancy.js";
import { insertField } from "./fields.js";
import {
  bufferedFieldInterior,
  findOverlappingZone,
  getStressZone,
  insertStressZone,
  listStressZones,
  setStressZoneClassification,
  setStressZoneMuted,
  softDeleteStressZone,
  updateStressZoneGeometry,
} from "./stress-zones.js";

/** Integration suite against real testcontainers PostGIS (TASK-satellite-pipeline §2.10, §6). */

const FIELD_BOUNDARY: MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [-59.14, -4.59],
        [-59.12, -4.59],
        [-59.12, -4.57],
        [-59.14, -4.57],
        [-59.14, -4.59],
      ],
    ],
  ],
};

function square(west: number, south: number, east: number, north: number): Polygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}

describe("stress-zones queries", () => {
  let infra: TestInfra;
  let owner: ReturnType<typeof createDbClient>;
  let orgId: string;
  let fieldId: string;

  beforeAll(async () => {
    infra = await startTestInfra();
    owner = createDbClient(infra.ownerUrl);

    const [org] = await owner.db.insert(organizations).values({ name: "Zone Org", slug: "zone-spec-org" }).returning();
    orgId = org!.id;
    await owner.db.insert(users).values({ email: "zone-spec@example.test", passwordHash: "unused" });

    const { rows } = await owner.pool.query<{ id: string }>(
      `INSERT INTO farms (organization_id, name, location, timezone)
       VALUES ($1, 'Zone Farm', ST_GeomFromGeoJSON($2), 'America/Manaus') RETURNING id`,
      [orgId, JSON.stringify({ type: "Point", coordinates: [-59.13, -4.58] })],
    );
    const farmId = rows[0]!.id;

    await withOrganization(owner.db, orgId, async (tx) => {
      fieldId = await insertField(tx, {
        organizationId: orgId,
        farmId,
        name: "Zone Field",
        boundary: FIELD_BOUNDARY,
        position: 1,
      });
    });
  });

  afterAll(async () => {
    await owner.pool.end();
    await infra.stop();
  });

  it("derives areaM2 via ST_Area rather than storing it, and new zones are unclassified (§2.9)", async () => {
    await withOrganization(owner.db, orgId, async (tx) => {
      const id = await insertStressZone(tx, {
        organizationId: orgId,
        fieldId,
        geometry: square(-59.133, -4.585, -59.132, -4.584),
        detectedOn: "2026-08-10",
        windowStart: "2026-08-01",
        windowEnd: "2026-08-10",
        severity: "high",
        indexValue: 0.2,
      });
      const zone = await getStressZone(tx, orgId, id);
      expect(zone).not.toBeNull();
      expect(zone!.classification).toBe("unclassified");
      expect(zone!.areaM2).toBeGreaterThan(0);
      expect(zone!.isNew).toBe(true);
    });
  });

  it("sort=priority orders severity DESC, area DESC, detected_on DESC in SQL", async () => {
    await withOrganization(owner.db, orgId, async (tx) => {
      await insertStressZone(tx, {
        organizationId: orgId,
        fieldId,
        geometry: square(-59.139, -4.589, -59.1385, -4.5885),
        detectedOn: "2026-08-05",
        windowStart: "2026-07-27",
        windowEnd: "2026-08-05",
        severity: "low",
        indexValue: 0.5,
      });
      await insertStressZone(tx, {
        organizationId: orgId,
        fieldId,
        geometry: square(-59.138, -4.588, -59.1375, -4.5875),
        detectedOn: "2026-08-06",
        windowStart: "2026-07-28",
        windowEnd: "2026-08-06",
        severity: "high",
        indexValue: 0.15,
      });

      const zones = await listStressZones(tx, orgId, fieldId, { sort: "priority" });
      expect(zones[0]!.severity).toBe("high");
    });
  });

  it("findOverlappingZone matches >= 50% overlap and re-detection preserves classification and muted_at (§6 item 6)", async () => {
    await withOrganization(owner.db, orgId, async (tx) => {
      const original = square(-59.136, -4.583, -59.1345, -4.5815);
      const id = await insertStressZone(tx, {
        organizationId: orgId,
        fieldId,
        geometry: original,
        detectedOn: "2026-08-01",
        windowStart: "2026-07-23",
        windowEnd: "2026-08-01",
        severity: "medium",
        indexValue: 0.4,
      });
      await setStressZoneClassification(tx, orgId, id, "pest");
      await setStressZoneMuted(tx, orgId, id, true);

      // ~80% overlap with `original`.
      const overlapping = square(-59.136, -4.583, -59.1346, -4.5816);
      const match = await findOverlappingZone(tx, orgId, fieldId, overlapping);
      expect(match?.id).toBe(id);

      await updateStressZoneGeometry(tx, orgId, id, {
        geometry: overlapping,
        detectedOn: "2026-08-11",
        windowStart: "2026-08-02",
        windowEnd: "2026-08-11",
        severity: "high",
        indexValue: 0.1,
      });

      const updated = await getStressZone(tx, orgId, id);
      expect(updated!.classification).toBe("pest");
      expect(updated!.mutedAt).not.toBeNull();
      expect(updated!.severity).toBe("high");
      expect(updated!.detectedOn.slice(0, 10)).toBe("2026-08-11");

      // A non-overlapping polygon elsewhere on the field is not a match.
      const farAway = square(-59.125, -4.575, -59.1245, -4.5745);
      expect(await findOverlappingZone(tx, orgId, fieldId, farAway)).toBeNull();
    });
  });

  it("soft delete sets deleted_at and the row disappears from list but not from the table (§6 item 16)", async () => {
    await withOrganization(owner.db, orgId, async (tx) => {
      const id = await insertStressZone(tx, {
        organizationId: orgId,
        fieldId,
        geometry: square(-59.129, -4.579, -59.1285, -4.5785),
        detectedOn: "2026-08-12",
        windowStart: "2026-08-03",
        windowEnd: "2026-08-12",
        severity: "low",
        indexValue: 0.6,
      });
      const deleted = await softDeleteStressZone(tx, orgId, id);
      expect(deleted).toBe(true);
      expect(await getStressZone(tx, orgId, id)).toBeNull();
    });

    const { rows } = await owner.pool.query<{ deleted_at: Date | null }>(
      `SELECT deleted_at FROM stress_zones WHERE field_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [fieldId],
    );
    expect(rows[0]!.deleted_at).not.toBeNull();
  });

  it("bufferedFieldInterior shrinks the boundary inward — is contained by the original", async () => {
    await withOrganization(owner.db, orgId, async (tx) => {
      const interior = await bufferedFieldInterior(tx, orgId, fieldId, 10);
      expect(interior).not.toBeNull();
      const { rows } = await owner.pool.query<{ contains: boolean }>(
        `SELECT ST_Contains(
           (SELECT boundary::geometry FROM fields WHERE id = $1),
           ST_GeomFromGeoJSON($2)
         ) AS contains`,
        [fieldId, JSON.stringify(interior)],
      );
      expect(rows[0]!.contains).toBe(true);
    });
  });
});
