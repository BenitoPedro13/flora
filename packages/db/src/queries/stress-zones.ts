import type { Polygon, StressClassification, StressSeverity, StressZoneSort } from "@flora/contracts";
import { sql } from "drizzle-orm";
import type { Tx } from "../tenancy.js";

/**
 * `stress_zones` queries (TASK-satellite-pipeline §2.5, architecture §7.5).
 * `areaM2` is always derived via `ST_Area` (invariant 3 — every geometry, not
 * just `fields`), never stored. `deleted_at IS NULL` is the soft-delete
 * filter every read applies; `DELETE /stress-zones/:id` only ever sets it.
 */

const SEVERITY_RANK_SQL = sql`CASE severity WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END`;

export interface StressZoneRecord {
  id: string;
  fieldId: string;
  geometry: Polygon;
  areaM2: number;
  detectedOn: string;
  windowStart: string;
  windowEnd: string;
  classification: StressClassification;
  severity: StressSeverity;
  indexValue: number;
  isNew: boolean;
  mutedAt: string | null;
}

interface StressZoneRow {
  [key: string]: unknown;
  id: string;
  field_id: string;
  geometry: Polygon;
  area_m2: number;
  detected_on: string;
  window_start: string;
  window_end: string;
  classification: StressClassification;
  severity: StressSeverity;
  index_value: string;
  is_new: boolean;
  muted_at: string | Date | null;
}

function toStressZoneRecord(row: StressZoneRow): StressZoneRecord {
  return {
    id: row.id,
    fieldId: row.field_id,
    geometry: row.geometry,
    areaM2: row.area_m2,
    detectedOn: row.detected_on,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    classification: row.classification,
    severity: row.severity,
    indexValue: Number(row.index_value),
    isNew: row.is_new,
    mutedAt: row.muted_at ? new Date(row.muted_at).toISOString() : null,
  };
}

/**
 * `sort=priority` orders `severity DESC → area DESC → detected_on DESC` with
 * the enum ranked in SQL — never re-sorted in JS after a paged read (§2.5).
 * `isNew` is `detected_on > current_date - 7` (§7.5's NEW badge), computed
 * here rather than in JS so the value can't drift from the row's own date.
 */
export async function listStressZones(
  tx: Tx,
  organizationId: string,
  fieldId: string,
  params: { sort: StressZoneSort },
): Promise<StressZoneRecord[]> {
  const orderBy =
    params.sort === "newest"
      ? sql`detected_on DESC`
      : params.sort === "area"
        ? sql`ST_Area(geometry) DESC`
        : sql`${SEVERITY_RANK_SQL} DESC, ST_Area(geometry) DESC, detected_on DESC`;

  const rows = await tx.execute<StressZoneRow>(sql`
    SELECT
      id, field_id, ST_AsGeoJSON(geometry)::json AS geometry, ST_Area(geometry) AS area_m2,
      detected_on, window_start, window_end, classification, severity, index_value,
      (detected_on > current_date - 7) AS is_new, muted_at
    FROM stress_zones
    WHERE organization_id = ${organizationId} AND field_id = ${fieldId} AND deleted_at IS NULL
    ORDER BY ${orderBy}
  `);
  return rows.rows.map(toStressZoneRecord);
}

export async function getStressZone(tx: Tx, organizationId: string, id: string): Promise<StressZoneRecord | null> {
  const rows = await tx.execute<StressZoneRow>(sql`
    SELECT
      id, field_id, ST_AsGeoJSON(geometry)::json AS geometry, ST_Area(geometry) AS area_m2,
      detected_on, window_start, window_end, classification, severity, index_value,
      (detected_on > current_date - 7) AS is_new, muted_at
    FROM stress_zones
    WHERE organization_id = ${organizationId} AND id = ${id} AND deleted_at IS NULL
  `);
  const row = rows.rows[0];
  return row ? toStressZoneRecord(row) : null;
}

/**
 * The §7.5 re-detection rule: a candidate polygon overlaps an existing,
 * non-deleted zone if their intersection covers at least half of the
 * *smaller* of the two areas. What the GIST index on `stress_zones.geometry`
 * was built for — the `&&` bbox check lets Postgres use it before falling to
 * the exact `ST_Intersection`.
 */
export async function findOverlappingZone(
  tx: Tx,
  organizationId: string,
  fieldId: string,
  geometry: Polygon,
): Promise<StressZoneRecord | null> {
  const geojson = JSON.stringify(geometry);
  const rows = await tx.execute<StressZoneRow>(sql`
    SELECT
      id, field_id, ST_AsGeoJSON(geometry)::json AS geometry, ST_Area(geometry) AS area_m2,
      detected_on, window_start, window_end, classification, severity, index_value,
      (detected_on > current_date - 7) AS is_new, muted_at
    FROM stress_zones
    WHERE organization_id = ${organizationId} AND field_id = ${fieldId} AND deleted_at IS NULL
      AND geometry && ST_GeomFromGeoJSON(${geojson})::geography
      AND ST_Area(ST_Intersection(geometry, ST_GeomFromGeoJSON(${geojson})::geography))
        >= 0.5 * LEAST(ST_Area(geometry), ST_Area(ST_GeomFromGeoJSON(${geojson})::geography))
    LIMIT 1
  `);
  const row = rows.rows[0];
  return row ? toStressZoneRecord(row) : null;
}

export interface InsertStressZoneInput {
  organizationId: string;
  fieldId: string;
  geometry: Polygon;
  detectedOn: string;
  windowStart: string;
  windowEnd: string;
  severity: StressSeverity;
  indexValue: number;
}

/** New zones are always `unclassified` (§2.9) — the detector has no evidence to distinguish pest from soil issue from water stress. */
export async function insertStressZone(tx: Tx, input: InsertStressZoneInput): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    INSERT INTO stress_zones (
      organization_id, field_id, geometry, detected_on, window_start, window_end,
      classification, severity, index_value
    )
    VALUES (
      ${input.organizationId}, ${input.fieldId}, ST_GeomFromGeoJSON(${JSON.stringify(input.geometry)}),
      ${input.detectedOn}, ${input.windowStart}, ${input.windowEnd},
      'unclassified', ${input.severity}, ${input.indexValue}
    )
    RETURNING id
  `);
  return rows.rows[0]!.id;
}

/**
 * Re-detection (§2.9): updates geometry/severity/index/dates on a matched
 * zone while **preserving** `classification` and `muted_at` — an operator's
 * triage must survive the next day's refresh finding the same problem.
 */
export async function updateStressZoneGeometry(
  tx: Tx,
  organizationId: string,
  id: string,
  input: {
    geometry: Polygon;
    detectedOn: string;
    windowStart: string;
    windowEnd: string;
    severity: StressSeverity;
    indexValue: number;
  },
): Promise<void> {
  await tx.execute(sql`
    UPDATE stress_zones
    SET geometry = ST_GeomFromGeoJSON(${JSON.stringify(input.geometry)}),
      detected_on = ${input.detectedOn}, window_start = ${input.windowStart}, window_end = ${input.windowEnd},
      severity = ${input.severity}, index_value = ${input.indexValue}, updated_at = now()
    WHERE organization_id = ${organizationId} AND id = ${id}
  `);
}

export async function setStressZoneClassification(
  tx: Tx,
  organizationId: string,
  id: string,
  classification: StressClassification,
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    UPDATE stress_zones SET classification = ${classification}, updated_at = now()
    WHERE organization_id = ${organizationId} AND id = ${id} AND deleted_at IS NULL
    RETURNING id
  `);
  return rows.rows.length > 0;
}

export async function setStressZoneMuted(
  tx: Tx,
  organizationId: string,
  id: string,
  muted: boolean,
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    UPDATE stress_zones SET muted_at = ${muted ? sql`now()` : sql`NULL`}, updated_at = now()
    WHERE organization_id = ${organizationId} AND id = ${id} AND deleted_at IS NULL
    RETURNING id
  `);
  return rows.rows.length > 0;
}

/** `DELETE /stress-zones/:id` (§2.7): a `deleted_at` write, never a row delete (architecture §5.3). */
export async function softDeleteStressZone(tx: Tx, organizationId: string, id: string): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    UPDATE stress_zones SET deleted_at = now(), updated_at = now()
    WHERE organization_id = ${organizationId} AND id = ${id} AND deleted_at IS NULL
    RETURNING id
  `);
  return rows.rows.length > 0;
}

/**
 * The §7.5 edge-buffer rule: 10m inward from the field boundary, in PostGIS
 * rather than turf — the authoritative geometry is already there, and
 * `geography` buffering is in metres for free. Returns `null` if the field
 * doesn't exist in this org (the worker's own 404-equivalent).
 */
export async function bufferedFieldInterior(
  tx: Tx,
  organizationId: string,
  fieldId: string,
  metres: number,
): Promise<Polygon | null> {
  const rows = await tx.execute<{ interior: Polygon }>(sql`
    SELECT ST_AsGeoJSON(ST_Buffer(boundary, ${-metres}))::json AS interior
    FROM fields
    WHERE organization_id = ${organizationId} AND id = ${fieldId}
  `);
  return rows.rows[0]?.interior ?? null;
}
