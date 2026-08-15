import { area as turfArea } from "@turf/turf";
import type { MultiPolygon } from "@flora/contracts";
import { createDbClient } from "../client.js";
import {
  explainGeoSpikeBboxScan,
  getGeoSpikeAreaM2,
  getGeoSpikeGeoJSON,
  insertGeoSpike,
} from "./spatial.js";

/**
 * The acceptance test TASK-foundations §6.6/§6.7 exists for. Not a unit
 * test — a one-shot script run against the live compose stack, because the
 * thing under test is the driver/PostGIS boundary itself, not application
 * logic. `pnpm --filter @flora/db run spike:roundtrip`.
 */

const KNOWN_BOUNDARY: MultiPolygon = {
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

const COORD_TOLERANCE = 1e-9;
const AREA_TOLERANCE_PCT = 0.5;

function coordsApproxEqual(a: MultiPolygon["coordinates"], b: MultiPolygon["coordinates"]): boolean {
  const flatA = a.flat(3) as number[];
  const flatB = b.flat(3) as number[];
  return flatA.length === flatB.length && flatA.every((v, i) => Math.abs(v - flatB[i]!) < COORD_TOLERANCE);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  const { db, pool } = createDbClient(databaseUrl);

  try {
    const id = await insertGeoSpike(db, "roundtrip-probe", KNOWN_BOUNDARY);
    const readBack = await getGeoSpikeGeoJSON(db, id);
    if (!readBack) {
      throw new Error(`no row read back for id ${id}`);
    }

    const structurallyEqual =
      readBack.boundary.type === "MultiPolygon" &&
      coordsApproxEqual(readBack.boundary.coordinates, KNOWN_BOUNDARY.coordinates);

    if (!structurallyEqual) {
      throw new Error(
        `GeoJSON round-trip mismatch.\n  in:  ${JSON.stringify(KNOWN_BOUNDARY)}\n  out: ${JSON.stringify(readBack.boundary)}`,
      );
    }
    console.log("PASS: GeoJSON round-trip is structurally equal");

    const postgisAreaM2 = await getGeoSpikeAreaM2(db, id);
    const turfAreaM2 = turfArea({ type: "Feature", properties: {}, geometry: KNOWN_BOUNDARY });
    const deltaPct = (Math.abs(postgisAreaM2 - turfAreaM2) / turfAreaM2) * 100;

    console.log(
      `PostGIS ST_Area: ${postgisAreaM2.toFixed(2)} m² · turf.area: ${turfAreaM2.toFixed(2)} m² · delta: ${deltaPct.toFixed(4)}%`,
    );
    if (deltaPct > AREA_TOLERANCE_PCT) {
      throw new Error(`area delta ${deltaPct.toFixed(4)}% exceeds ${AREA_TOLERANCE_PCT}% tolerance`);
    }
    console.log(`PASS: ST_Area agrees with turf.area within ${AREA_TOLERANCE_PCT}%`);

    const plan = await explainGeoSpikeBboxScan(db);
    console.log(`EXPLAIN for bbox query:\n${plan}`);
    if (!/Index Scan/i.test(plan)) {
      throw new Error("expected an index scan on geo_spike_boundary_gist, got:\n" + plan);
    }
    console.log("PASS: GIST index is used for the bounding-box query");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
