import { sql } from "drizzle-orm";
import type { Database } from "../client.js";
import type { MultiPolygon } from "@flora/contracts";

/**
 * PostGIS spatial functions, called through Drizzle's `sql` template as
 * architecture.md §5.2 requires — this is the only place a geometry column
 * is read or written. See packages/db/src/types/geography.ts for why.
 */

export async function insertGeoSpike(db: Database, label: string, boundary: MultiPolygon) {
  const rows = await db.execute<{ id: number }>(sql`
    INSERT INTO geo_spike (label, boundary)
    VALUES (${label}, ST_GeomFromGeoJSON(${JSON.stringify(boundary)}))
    RETURNING id
  `);
  return rows.rows[0]!.id;
}

export async function getGeoSpikeGeoJSON(db: Database, id: number) {
  const rows = await db.execute<{ id: number; label: string; boundary: MultiPolygon }>(sql`
    SELECT id, label, ST_AsGeoJSON(boundary)::json AS boundary
    FROM geo_spike
    WHERE id = ${id}
  `);
  return rows.rows[0] ?? null;
}

export async function getGeoSpikeAreaM2(db: Database, id: number) {
  const rows = await db.execute<{ area_m2: number }>(sql`
    SELECT ST_Area(boundary) AS area_m2
    FROM geo_spike
    WHERE id = ${id}
  `);
  return rows.rows[0]!.area_m2;
}

export async function getGeoSpikeCentroid(db: Database, id: number) {
  const rows = await db.execute<{ centroid: { type: "Point"; coordinates: [number, number] } }>(sql`
    SELECT ST_AsGeoJSON(ST_Centroid(boundary))::json AS centroid
    FROM geo_spike
    WHERE id = ${id}
  `);
  return rows.rows[0]!.centroid;
}

export async function explainGeoSpikeBboxScan(db: Database) {
  const rows = await db.execute<{ "QUERY PLAN": string }>(sql`
    EXPLAIN
    SELECT id FROM geo_spike
    WHERE boundary && ST_MakeEnvelope(-1, -1, 2, 2, 4326)::geography
  `);
  return rows.rows.map((r) => r["QUERY PLAN"]).join("\n");
}
