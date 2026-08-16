import {
  bboxSchema,
  observationStatsSchema,
  type BBox,
  type MultiPolygon,
  type ObservationIndex,
  type ObservationStats,
} from "@flora/contracts";
import { sql } from "drizzle-orm";
import type { Tx } from "../tenancy.js";

/**
 * `observations` queries (TASK-satellite-pipeline §2.5). Every function takes
 * a `Tx` from `withOrganization` and filters explicitly by `organizationId` —
 * the repository-layer half of invariant 6, RLS the backstop. `stats` and
 * `bbox` are parsed through their zod schemas *on write* — JSONB is not
 * licence to store an unvalidated shape (the schema file's own comment
 * already promises this).
 */

export interface UpsertObservationInput {
  organizationId: string;
  fieldId: string;
  capturedOn: string;
  index: ObservationIndex;
  stats: ObservationStats;
  rasterKey: string;
  bbox: BBox;
  sceneId: string;
}

/** `ON CONFLICT (field_id, captured_on, index) DO UPDATE` — a re-run of the same scene overwrites, never duplicates. */
export async function upsertObservation(tx: Tx, input: UpsertObservationInput): Promise<void> {
  const stats = observationStatsSchema.parse(input.stats);
  const bbox = bboxSchema.parse(input.bbox);
  await tx.execute(sql`
    INSERT INTO observations (organization_id, field_id, captured_on, index, stats, raster_key, bbox, scene_id)
    VALUES (
      ${input.organizationId}, ${input.fieldId}, ${input.capturedOn}, ${input.index},
      ${JSON.stringify(stats)}::jsonb, ${input.rasterKey}, ${JSON.stringify(bbox)}::jsonb, ${input.sceneId}
    )
    ON CONFLICT (field_id, captured_on, index) DO UPDATE SET
      stats = EXCLUDED.stats,
      raster_key = EXCLUDED.raster_key,
      bbox = EXCLUDED.bbox,
      scene_id = EXCLUDED.scene_id
  `);
}

/** Cheapest possible quota saving (§2.4 step 1): skip a Process API call entirely if this scene date is already stored. */
export async function observationExists(
  tx: Tx,
  organizationId: string,
  fieldId: string,
  capturedOn: string,
  index: ObservationIndex,
): Promise<boolean> {
  const rows = await tx.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM observations
      WHERE organization_id = ${organizationId} AND field_id = ${fieldId}
        AND captured_on = ${capturedOn} AND index = ${index}
    ) AS exists
  `);
  return rows.rows[0]!.exists;
}

/**
 * The daily-refresh skip check, widened from a single-index existence check
 * (`TASK-spectral-indices` follow-on, found live): a field with an NDVI row
 * from before this task's ten-index bulk call — or from any interrupted
 * partial refresh — must not silently block the other nine from ever
 * backfilling for that same scene date. True only when *every* one of
 * `indices` already has a row.
 */
export async function allObservationsExist(
  tx: Tx,
  organizationId: string,
  fieldId: string,
  capturedOn: string,
  indices: readonly ObservationIndex[],
): Promise<boolean> {
  const indexList = sql.join(
    indices.map((index) => sql`${index}`),
    sql`, `,
  );
  const rows = await tx.execute<{ count: string }>(sql`
    SELECT count(*) AS count FROM observations
    WHERE organization_id = ${organizationId} AND field_id = ${fieldId}
      AND captured_on = ${capturedOn} AND index IN (${indexList})
  `);
  return Number(rows.rows[0]!.count) === indices.length;
}

export interface ObservationRecord {
  fieldId: string;
  capturedOn: string;
  index: ObservationIndex;
  stats: ObservationStats;
  rasterKey: string;
  bbox: BBox;
  sceneId: string;
}

interface ObservationRow {
  [key: string]: unknown;
  field_id: string;
  captured_on: string;
  index: ObservationIndex;
  stats: ObservationStats;
  raster_key: string;
  bbox: BBox;
  scene_id: string;
}

function toObservationRecord(row: ObservationRow): ObservationRecord {
  return {
    fieldId: row.field_id,
    capturedOn: row.captured_on,
    index: row.index,
    stats: row.stats,
    rasterKey: row.raster_key,
    bbox: row.bbox,
    sceneId: row.scene_id,
  };
}

export interface ListObservationsParams {
  index: ObservationIndex;
  from?: string;
  to?: string;
}

/** Serves NFR-2's 50ms p95 — one index scan on `observations_org_field_index_captured_desc`. */
export async function listObservations(
  tx: Tx,
  organizationId: string,
  fieldId: string,
  params: ListObservationsParams,
): Promise<ObservationRecord[]> {
  const conditions = [
    sql`organization_id = ${organizationId}`,
    sql`field_id = ${fieldId}`,
    sql`index = ${params.index}`,
  ];
  if (params.from) {
    conditions.push(sql`captured_on >= ${params.from}`);
  }
  if (params.to) {
    conditions.push(sql`captured_on <= ${params.to}`);
  }
  const rows = await tx.execute<ObservationRow>(sql`
    SELECT field_id, captured_on, index, stats, raster_key, bbox, scene_id
    FROM observations
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY captured_on DESC
  `);
  return rows.rows.map(toObservationRecord);
}

/** The Crop Stress date picker's feed (§2.5) — `captured_on` only, no stats, no key. */
export async function listObservationDates(
  tx: Tx,
  organizationId: string,
  fieldId: string,
  index: ObservationIndex,
): Promise<string[]> {
  const rows = await tx.execute<{ captured_on: string }>(sql`
    SELECT captured_on FROM observations
    WHERE organization_id = ${organizationId} AND field_id = ${fieldId} AND index = ${index}
    ORDER BY captured_on DESC
  `);
  return rows.rows.map((r) => r.captured_on);
}

export interface FieldBoundaryForRefresh {
  boundary: MultiPolygon;
  bbox: BBox;
}

/** The worker's one read (§2.5) — boundary as GeoJSON plus its envelope, for `SatelliteProvider.findLatestScene`'s bbox argument. */
export async function getFieldBoundaryForRefresh(
  tx: Tx,
  organizationId: string,
  fieldId: string,
): Promise<FieldBoundaryForRefresh | null> {
  const rows = await tx.execute<{ boundary: MultiPolygon; bbox: BBox }>(sql`
    SELECT
      ST_AsGeoJSON(boundary)::json AS boundary,
      (SELECT json_build_array(
        ST_XMin(env), ST_YMin(env), ST_XMax(env), ST_YMax(env)
      ) FROM (SELECT ST_Envelope(boundary::geometry) AS env) e) AS bbox
    FROM fields
    WHERE organization_id = ${organizationId} AND id = ${fieldId}
  `);
  const row = rows.rows[0];
  if (!row) {
    return null;
  }
  return { boundary: row.boundary, bbox: row.bbox };
}
