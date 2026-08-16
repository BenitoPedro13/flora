import type { BBox, MultiPolygon, Point } from "@flora/contracts";
import { sql } from "drizzle-orm";
import type { Tx } from "../tenancy.js";

/**
 * The geometry read/write pattern `geo_spike` proved on a throwaway table
 * (architecture §5.2), now on the real one. Every function takes a `Tx`
 * (from tenancy.ts), never a bare `Database` — querying a tenant table
 * outside `withOrganization` is awkward by construction — and filters
 * explicitly by `organizationId` as the repository-layer half of invariant
 * 6, RLS being the backstop (architecture §10). `ST_Area` on a `geography`
 * returns square metres with no `use_spheroid` argument needed — the SI
 * value stored nowhere and returned here as `areaM2`.
 */

export interface InsertFieldInput {
  organizationId: string;
  farmId: string;
  name: string;
  boundary: MultiPolygon;
  position: number | string;
}

export async function insertField(tx: Tx, input: InsertFieldInput): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    INSERT INTO fields (organization_id, farm_id, name, boundary, position)
    VALUES (
      ${input.organizationId},
      ${input.farmId},
      ${input.name},
      ST_GeomFromGeoJSON(${JSON.stringify(input.boundary)}),
      ${input.position}
    )
    RETURNING id
  `);
  return rows.rows[0]!.id;
}

export interface FieldRecord {
  id: string;
  organizationId: string;
  farmId: string;
  name: string;
  boundary: MultiPolygon;
  areaM2: number;
  centroid: Point;
  position: string;
  lastRefreshAt: Date | null;
  lastRefreshSucceededAt: Date | null;
  lastRefreshError: string | null;
}

interface FieldRow {
  [key: string]: unknown;
  id: string;
  organization_id: string;
  farm_id: string;
  name: string;
  boundary: MultiPolygon;
  area_m2: number;
  centroid: Point;
  position: string;
  last_refresh_at: Date | null;
  last_refresh_succeeded_at: Date | null;
  last_refresh_error: string | null;
}

export async function getField(tx: Tx, organizationId: string, id: string): Promise<FieldRecord | null> {
  const rows = await tx.execute<FieldRow>(sql`
    SELECT
      id,
      organization_id,
      farm_id,
      name,
      ST_AsGeoJSON(boundary)::json AS boundary,
      ST_Area(boundary) AS area_m2,
      ST_AsGeoJSON(ST_Centroid(boundary))::json AS centroid,
      position,
      last_refresh_at,
      last_refresh_succeeded_at,
      last_refresh_error
    FROM fields
    WHERE organization_id = ${organizationId} AND id = ${id}
  `);
  const row = rows.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    farmId: row.farm_id,
    name: row.name,
    boundary: row.boundary,
    areaM2: row.area_m2,
    centroid: row.centroid,
    position: row.position,
    lastRefreshAt: row.last_refresh_at,
    lastRefreshSucceededAt: row.last_refresh_succeeded_at,
    lastRefreshError: row.last_refresh_error,
  };
}

export async function listFieldsInBbox(
  tx: Tx,
  organizationId: string,
  bbox: BBox,
): Promise<Array<{ id: string; name: string }>> {
  const [west, south, east, north] = bbox;
  const rows = await tx.execute<{ id: string; name: string }>(sql`
    SELECT id, name
    FROM fields
    WHERE organization_id = ${organizationId}
      AND boundary && ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)::geography
  `);
  return rows.rows;
}

/** Same predicate as `listFieldsInBbox`, `EXPLAIN`-ed — proves the GIST index is used, not a seq scan. */
export async function explainListFieldsInBbox(tx: Tx, organizationId: string, bbox: BBox): Promise<string> {
  const [west, south, east, north] = bbox;
  const rows = await tx.execute<{ "QUERY PLAN": string }>(sql`
    EXPLAIN
    SELECT id FROM fields
    WHERE organization_id = ${organizationId}
      AND boundary && ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)::geography
  `);
  return rows.rows.map((r) => r["QUERY PLAN"]).join("\n");
}

export async function updateFieldBoundary(
  tx: Tx,
  organizationId: string,
  id: string,
  boundary: MultiPolygon,
): Promise<void> {
  await tx.execute(sql`
    UPDATE fields
    SET boundary = ST_GeomFromGeoJSON(${JSON.stringify(boundary)}), updated_at = now()
    WHERE organization_id = ${organizationId} AND id = ${id}
  `);
}
