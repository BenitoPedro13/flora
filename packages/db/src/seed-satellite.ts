import type { BBox, MultiPolygon } from "@flora/contracts";
import {
  computeStats,
  createRasterStore,
  detectStressZones,
  pixelToLonLat,
  rasterObjectKey,
  renderRasterPng,
  type DecodedRaster,
} from "@flora/raster";
import { booleanPointInPolygon, point } from "@turf/turf";
import { sql } from "drizzle-orm";
import { createDbClient } from "./client.js";
import { recordRefreshResult } from "./queries/fields.js";
import { getFieldBoundaryForRefresh } from "./queries/observations.js";
import { upsertObservationAndZones } from "./queries/satellite-upsert.js";
import { bufferedFieldInterior } from "./queries/stress-zones.js";
import { withOrganization } from "./tenancy.js";

/**
 * Replays a synthetic-but-known raster pattern through the **real**
 * `packages/raster` pipeline (`computeStats`, `renderRasterPng`,
 * `detectStressZones`) and the real `packages/db` reconciliation
 * (`upsertObservationAndZones`) — not a hand-written `INSERT` of invented
 * rows (§3.5). Deliberately **not** a live CDSE call: this task has no CDSE
 * credentials in this environment (risk log item 3), so there is nothing
 * real to replay from a captured fixture. `db:seed:satellite`, run after
 * `db:seed:demo`.
 *
 * **Deviation, recorded honestly (§10):** design-spec §5.3 shows "8 stress
 * zones totalling ~24.1 ac" on the selected field. `TASK-fields`'s demo
 * field rectangles (`seed-demo.ts`) are ~332m x 222m, ~18.3 ac **total** —
 * smaller than that target sum. Every zone this script produces is
 * `ST_Contains`-ed by its field's real boundary (the same invariant the
 * live pipeline enforces), which makes hitting 24.1 ac on an 18.3 ac field
 * impossible without inventing geometry that violates that invariant. This
 * script instead produces the largest realistic pattern that *does* fit —
 * see the run's own log line for the actual zone count/area, which
 * `TASK-crop-stress` should use as its real visual-diff target instead of
 * the Figma's illustrative number, or resolve by enlarging the demo
 * boundary in a `TASK-fields` follow-up.
 */

const SEED_ORG_SLUG = "flora-farm";
/**
 * TASK-home-dashboard §2.12: widened from 12 observations (60 days) to a
 * full trailing year on Sentinel-2's real ~5-day revisit cadence — the
 * Regeneration Score's Soil Cover Days component integrates fractional
 * cover between consecutive observations over 365 days (packages/db/src/scoring/regeneration.ts),
 * and two points near "today" would score a well-managed demo farm near
 * zero for a data-availability reason, not a real one (§8's risk log).
 */
const OBSERVATION_COUNT = 73;
const OBSERVATION_INTERVAL_DAYS = 5;
const RASTER_SIZE_PX = 100;
const EDGE_BUFFER_METRES = 10;

interface StressBlock {
  x: number;
  y: number;
  size: number;
}

/**
 * "Field 237" — the one with a persistent, multi-block stress pattern (the
 * design's "selected field"). Two constraints fight each other here, both
 * found empirically (§10): each block must be large enough in *pixels* to
 * clear the 0.5 ac (2023 m²) minimum zone size — this field is ~333m x 222m
 * (`seed-demo.ts`) over a 100px raster, so each pixel is only ~7.36 m², and
 * an 18x18px block (~324 px, ~2385 m², ~0.59 ac) is close to the smallest
 * block that clears it — but the *total* stressed pixel count must stay
 * under 10% of the field, or the stressed population itself starts pulling
 * `p10` down to meet it (detect.ts's percentile-rank threshold, not a fixed
 * value), and pixels sitting exactly at that dragged-down `p10` fail the
 * strict `< p10` test — the mask goes empty and every zone silently
 * vanishes. Three 18x18 blocks (~9.7% of the field) sit inside both limits;
 * a fourth does not (verified against a live container before landing this
 * file — see the module doc's zone-count/area log line for the real
 * result).
 */
const STRESSED_FIELD_NAME = "Field 237";
const STRESS_BLOCKS: StressBlock[] = [
  { x: 10, y: 10, size: 18 },
  { x: 70, y: 20, size: 18 },
  { x: 30, y: 70, size: 18 },
];

/** "Field 240" is left with a stale badge (NFR-8) — an older success, then a simulated final failure. */
const STALE_FIELD_NAME = "Field 240";

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/**
 * A smooth annual cycle (wet-season canopy peak, dry-season dip) plus small
 * day-to-day noise — a real seasonal NDVI curve, not a flat baseline with
 * high-frequency wiggle, so `computeSoilCoverDays`'s trapezoid integration
 * over the trailing year has a real curve to integrate rather than a nearly
 * constant line (§2.12).
 */
function seasonalNdvi(daysAgo: number): number {
  const phase = (daysAgo / 365) * 2 * Math.PI;
  const seasonal = 0.55 + 0.25 * Math.cos(phase);
  const noise = 0.03 * Math.sin(daysAgo);
  return seasonal + noise;
}

/**
 * The real CDSE Process API clips returned imagery to the requested field
 * geometry server-side, which is where `raster.ts`'s "NaN = outside the
 * field boundary" nodata convention comes from — this synthetic raster has
 * no such server to do it, so it clips itself the same way: any pixel whose
 * centre falls outside the field's real (non-rectangular) boundary gets
 * `NaN`, exactly like a real response's nodata band. Found live: without
 * this, `RasterOverlay` painted the full bbox rectangle as solid colour —
 * visibly wrong the moment a real triangular demo field rendered next to its
 * boundary (`TASK-crop-stress` §6 item 2's "look at it" verification, the
 * same lesson `TASK-satellite-pipeline` §10 recorded for the ramp bug).
 */
function clipToBoundary(raster: DecodedRaster, bbox: BBox, boundary: MultiPolygon): void {
  const { width, height, indexValues } = raster;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [lon, lat] = pixelToLonLat(bbox, width, height, x + 0.5, y + 0.5);
      if (!booleanPointInPolygon(point([lon, lat]), boundary)) {
        indexValues[y * width + x] = NaN;
      }
    }
  }
}

function buildRaster(baseline: number, stressBlocks: StressBlock[], bbox: BBox, boundary: MultiPolygon): DecodedRaster {
  const width = RASTER_SIZE_PX;
  const height = RASTER_SIZE_PX;
  const indexValues = new Float32Array(width * height).fill(baseline);
  const sclValues = new Uint8Array(width * height).fill(4); // vegetation, clear
  for (const block of stressBlocks) {
    for (let y = block.y; y < block.y + block.size; y++) {
      for (let x = block.x; x < block.x + block.size; x++) {
        indexValues[y * width + x] = 0.2;
      }
    }
  }
  const raster = { width, height, indexValues, sclValues };
  clipToBoundary(raster, bbox, boundary);
  return raster;
}

async function refreshOneObservation(
  tx: Parameters<typeof getFieldBoundaryForRefresh>[0],
  organizationId: string,
  fieldId: string,
  capturedOn: string,
  raster: DecodedRaster,
  bbox: BBox,
  rasterStore: ReturnType<typeof createRasterStore>,
): Promise<void> {
  const stats = computeStats(raster);
  const png = await renderRasterPng(raster, stats);
  const rasterKey = rasterObjectKey(organizationId, fieldId, "ndvi", capturedOn);
  await rasterStore.putRaster(rasterKey, png);

  const interior = await bufferedFieldInterior(tx, organizationId, fieldId, EDGE_BUFFER_METRES);
  const zones = interior ? detectStressZones({ raster, bbox, bufferedInterior: interior }) : [];

  await upsertObservationAndZones(tx, {
    organizationId,
    fieldId,
    capturedOn,
    index: "ndvi",
    stats,
    rasterKey,
    bbox,
    sceneId: `seed-scene-${capturedOn}`,
    zones,
    windowStart: isoDate(OBSERVATION_COUNT * OBSERVATION_INTERVAL_DAYS),
    windowEnd: capturedOn,
  });
  await recordRefreshResult(tx, organizationId, fieldId, { succeeded: true, error: null });
}

async function main() {
  const databaseUrl = process.env.DATABASE_MIGRATION_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_MIGRATION_URL is not set");
  }
  const rasterStore = createRasterStore({
    endpoint: process.env.S3_ENDPOINT!,
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    bucket: process.env.S3_BUCKET!,
  });

  const { db, pool } = createDbClient(databaseUrl);
  try {
    const [org] = await db.execute<{ id: string }>(sql`SELECT id FROM organizations WHERE slug = ${SEED_ORG_SLUG}`).then((r) => r.rows);
    if (!org) {
      throw new Error(`Seed org '${SEED_ORG_SLUG}' not found — run db:seed and db:seed:demo first`);
    }
    const fields = await db
      .execute<{ id: string; name: string }>(sql`SELECT id, name FROM fields WHERE organization_id = ${org.id}`)
      .then((r) => r.rows);
    if (fields.length === 0) {
      throw new Error("No demo fields found — run db:seed:demo first");
    }

    let totalZones = 0;
    let totalAreaAcres = 0;

    for (const field of fields) {
      await withOrganization(db, org.id, async (tx) => {
        const boundary = await getFieldBoundaryForRefresh(tx, org.id, field.id);
        if (!boundary) {
          return;
        }

        const isStressed = field.name === STRESSED_FIELD_NAME;
        const isStale = field.name === STALE_FIELD_NAME;
        const observationsToWrite = isStale ? Math.floor(OBSERVATION_COUNT * 0.7) : OBSERVATION_COUNT;

        for (let i = observationsToWrite - 1; i >= 0; i--) {
          const daysAgo = i * OBSERVATION_INTERVAL_DAYS;
          const capturedOn = isoDate(daysAgo);
          const baseline = seasonalNdvi(daysAgo);
          const raster = buildRaster(baseline, isStressed ? STRESS_BLOCKS : [], boundary.bbox, boundary.boundary);
          await refreshOneObservation(tx, org.id, field.id, capturedOn, raster, boundary.bbox, rasterStore);
        }

        if (isStale) {
          // Simulates a final failed attempt after the observations above —
          // last_refresh_succeeded_at keeps its older value, last_refresh_error
          // is set, for NFR-8's stale badge.
          await recordRefreshResult(tx, org.id, field.id, {
            succeeded: false,
            error: "CDSE process request failed: 503 service temporarily unavailable",
          });
        }

        if (isStressed) {
          const { rows } = await tx.execute<{ count: string; total_ac: string }>(sql`
            SELECT count(*) AS count, COALESCE(sum(ST_Area(geometry)), 0) / 4046.8564224 AS total_ac
            FROM stress_zones
            WHERE organization_id = ${org.id} AND field_id = ${field.id} AND deleted_at IS NULL
          `);
          totalZones = Number(rows[0]!.count);
          totalAreaAcres = Number(rows[0]!.total_ac);
        }
      });
    }

    console.log(
      `db:seed:satellite: ${fields.length} field(s), ${OBSERVATION_COUNT} observations attempted per field. ` +
        `'${STRESSED_FIELD_NAME}' produced ${totalZones} stress zone(s) totalling ${totalAreaAcres.toFixed(1)} ac ` +
        `(design-spec §5.3's illustrative target is 8 zones / ~24.1 ac — see this file's header comment for why that ` +
        `exact figure doesn't fit the current demo field size).`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
