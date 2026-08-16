import type { BBox, CropCycleStatus, FieldSort, MultiPolygon, Point, TaskActivity } from "@flora/contracts";
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

/**
 * A self-intersecting boundary is a drawing mistake the farmer needs to see
 * — never silently `ST_MakeValid`-ed, which would change their acreage
 * without telling them (TASK-fields §2.3, §3.3 of that doc's rationale).
 */
export class InvalidGeometryError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "InvalidGeometryError";
  }
}

/** Run inside the same transaction, before the write. */
export async function assertValidBoundary(tx: Tx, boundary: MultiPolygon): Promise<void> {
  const geojson = JSON.stringify(boundary);
  const rows = await tx.execute<{ valid: boolean; reason: string }>(sql`
    SELECT
      ST_IsValid(ST_GeomFromGeoJSON(${geojson})) AS valid,
      ST_IsValidReason(ST_GeomFromGeoJSON(${geojson})) AS reason
  `);
  const row = rows.rows[0]!;
  if (!row.valid) {
    throw new InvalidGeometryError(row.reason);
  }
}

/** Non-throwing form of `assertValidBoundary`, plus area — the import preview's per-row verdict (§2.9), which must not raise on the exact geometry it's meant to flag. */
export async function checkBoundaryValidity(
  tx: Tx,
  boundary: MultiPolygon,
): Promise<{ valid: boolean; reason: string | null; areaM2: number }> {
  const geojson = JSON.stringify(boundary);
  const rows = await tx.execute<{ valid: boolean; reason: string | null; area_m2: number }>(sql`
    SELECT
      ST_IsValid(ST_GeomFromGeoJSON(${geojson})) AS valid,
      ST_IsValidReason(ST_GeomFromGeoJSON(${geojson})) AS reason,
      ST_Area(ST_GeomFromGeoJSON(${geojson})::geography) AS area_m2
  `);
  const row = rows.rows[0]!;
  return { valid: row.valid, reason: row.valid ? null : row.reason, areaM2: row.area_m2 };
}

/** Field names for this org — the import preview's duplicate-name check (§2.9). */
export async function listFieldNames(tx: Tx, organizationId: string): Promise<string[]> {
  const rows = await tx.execute<{ name: string }>(sql`SELECT name FROM fields WHERE organization_id = ${organizationId}`);
  return rows.rows.map((r) => r.name);
}

export interface InsertFieldInput {
  organizationId: string;
  farmId: string;
  name: string;
  boundary: MultiPolygon;
  position: number | string;
}

export async function insertField(tx: Tx, input: InsertFieldInput): Promise<string> {
  await assertValidBoundary(tx, input.boundary);
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
  await assertValidBoundary(tx, boundary);
  await tx.execute(sql`
    UPDATE fields
    SET boundary = ST_GeomFromGeoJSON(${JSON.stringify(boundary)}), updated_at = now()
    WHERE organization_id = ${organizationId} AND id = ${id}
  `);
}

/**
 * The keyset pagination cursor (architecture §8.1): an opaque base64 of
 * `${sortValue} ${id}`. `id` is always a UUID (36 chars), so it's taken from
 * the tail rather than split on the space — a field name can itself contain
 * spaces.
 */
function encodeFieldCursor(sortValue: string, id: string): string {
  return Buffer.from(`${sortValue} ${id}`, "utf-8").toString("base64url");
}

function decodeFieldCursor(cursor: string): { sortValue: string; id: string } {
  const decoded = Buffer.from(cursor, "base64url").toString("utf-8");
  const id = decoded.slice(-36);
  const sortValue = decoded.slice(0, -37);
  return { sortValue, id };
}

/** The `CASE` in TASK-fields §2.3 — growth against the *farm's* local date, never the server's (architecture §5.3). */
export const GROWTH_PCT_SQL = sql`
  CASE
    WHEN cc.expected_harvest_on <= cc.planted_on THEN 100
    ELSE LEAST(100, GREATEST(0, ROUND(
      ((now() AT TIME ZONE fa.timezone)::date - cc.planted_on)::numeric * 100
        / (cc.expected_harvest_on - cc.planted_on)::numeric)))
  END
`;

export interface FieldCropCycleRecord {
  id: string;
  cropId: string;
  cropName: string;
  plantedOn: string;
  expectedHarvestOn: string;
  status: CropCycleStatus;
  quantityKg: number | null;
  growthPct: number;
}

export interface FieldSummaryRecord {
  id: string;
  farmId: string;
  name: string;
  areaM2: number;
  centroid: Point;
  position: number;
  lastRefreshSucceededAt: string | null;
  lastRefreshError: string | null;
  cropCycle: FieldCropCycleRecord | null;
  activities: TaskActivity[];
}

interface FieldSummaryRow {
  [key: string]: unknown;
  id: string;
  farm_id: string;
  name: string;
  area_m2: number;
  centroid: Point;
  position: string;
  // node-postgres returns these as strings when read through a raw
  // `tx.execute` (not drizzle's typed select) — `numeric` and `timestamptz`
  // both arrive un-parsed. Typed `string | Date` here, normalized below,
  // rather than trusted at the declared type — caught by
  // fields-list.spec.ts (§6 items 3–4), not assumed.
  last_refresh_succeeded_at: string | Date | null;
  last_refresh_error: string | null;
  cycle_id: string | null;
  cycle_crop_id: string | null;
  cycle_crop_name: string | null;
  cycle_planted_on: string | null;
  cycle_expected_harvest_on: string | null;
  cycle_status: CropCycleStatus | null;
  cycle_quantity_kg: string | null;
  cycle_growth_pct: string | number | null;
  activities: TaskActivity[];
  sort_position: string;
  sort_name: string;
  sort_created_at: string | Date;
}

function toFieldSummary(row: FieldSummaryRow): FieldSummaryRecord {
  return {
    id: row.id,
    farmId: row.farm_id,
    name: row.name,
    areaM2: row.area_m2,
    centroid: row.centroid,
    position: Number(row.position),
    lastRefreshSucceededAt: row.last_refresh_succeeded_at ? new Date(row.last_refresh_succeeded_at).toISOString() : null,
    lastRefreshError: row.last_refresh_error,
    cropCycle:
      row.cycle_id === null
        ? null
        : {
            id: row.cycle_id,
            cropId: row.cycle_crop_id!,
            cropName: row.cycle_crop_name!,
            plantedOn: row.cycle_planted_on!,
            expectedHarvestOn: row.cycle_expected_harvest_on!,
            status: row.cycle_status!,
            quantityKg: row.cycle_quantity_kg === null ? null : Number(row.cycle_quantity_kg),
            growthPct: Number(row.cycle_growth_pct!),
          },
    activities: row.activities ?? [],
  };
}

export interface ListFieldsParams {
  farmId?: string;
  q?: string;
  cropId?: string;
  sort: FieldSort;
  cursor?: string;
  limit: number;
}

export interface ListFieldsResult {
  items: FieldSummaryRecord[];
  nextCursor: string | null;
}

/**
 * One statement: `fields` LEFT JOIN LATERAL the `growing` crop cycle (the
 * partial unique index guarantees <= 1) LEFT JOIN LATERAL the distinct
 * non-`done` `tasks.activity`, plus `ST_Area`/centroid. Keyset predicate as a
 * row-value comparison so ties on the sort column cannot drop or duplicate a
 * row across pages (TASK-fields §2.3, §6 item 4).
 */
export async function listFields(tx: Tx, organizationId: string, params: ListFieldsParams): Promise<ListFieldsResult> {
  const conditions: ReturnType<typeof sql>[] = [sql`f.organization_id = ${organizationId}`];
  if (params.farmId) {
    conditions.push(sql`f.farm_id = ${params.farmId}`);
  }
  if (params.q) {
    conditions.push(sql`f.name ILIKE ${`%${params.q}%`}`);
  }
  if (params.cropId) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM crop_cycles cc2
      WHERE cc2.organization_id = f.organization_id AND cc2.field_id = f.id
        AND cc2.status = 'growing' AND cc2.crop_id = ${params.cropId}
    )`);
  }

  let orderBy: ReturnType<typeof sql>;
  let sortColumn: ReturnType<typeof sql>;
  switch (params.sort) {
    case "name":
      orderBy = sql`f.name ASC, f.id ASC`;
      sortColumn = sql`f.name`;
      break;
    case "-name":
      orderBy = sql`f.name DESC, f.id DESC`;
      sortColumn = sql`f.name`;
      break;
    case "newest":
      orderBy = sql`f.created_at DESC, f.id DESC`;
      sortColumn = sql`f.created_at`;
      break;
    case "position":
    default:
      orderBy = sql`f.position ASC, f.id ASC`;
      sortColumn = sql`f.position`;
      break;
  }

  if (params.cursor) {
    const { sortValue, id } = decodeFieldCursor(params.cursor);
    // Descending sorts (-name, newest) page "downward" — the next page's
    // rows are less than the last-seen row, not greater.
    const operator = params.sort === "-name" || params.sort === "newest" ? sql`<` : sql`>`;
    const castValue =
      params.sort === "newest" ? sql`${sortValue}::timestamptz` : params.sort === "position" ? sql`${sortValue}::numeric` : sql`${sortValue}`;
    conditions.push(sql`(${sortColumn}, f.id) ${operator} (${castValue}, ${id}::uuid)`);
  }

  const whereClause = sql.join(conditions, sql` AND `);
  const fetchLimit = params.limit + 1;

  const rows = await tx.execute<FieldSummaryRow>(sql`
    SELECT
      f.id,
      f.farm_id,
      f.name,
      ST_Area(f.boundary) AS area_m2,
      ST_AsGeoJSON(ST_Centroid(f.boundary))::json AS centroid,
      f.position,
      f.last_refresh_succeeded_at,
      f.last_refresh_error,
      cyc.id AS cycle_id,
      cyc.crop_id AS cycle_crop_id,
      cyc.crop_name AS cycle_crop_name,
      cyc.planted_on AS cycle_planted_on,
      cyc.expected_harvest_on AS cycle_expected_harvest_on,
      cyc.status AS cycle_status,
      cyc.quantity_kg AS cycle_quantity_kg,
      cyc.growth_pct AS cycle_growth_pct,
      COALESCE(act.activities, '[]'::json) AS activities,
      f.position AS sort_position,
      f.name AS sort_name,
      f.created_at AS sort_created_at
    FROM fields f
    JOIN farms fa ON fa.organization_id = f.organization_id AND fa.id = f.farm_id
    LEFT JOIN LATERAL (
      SELECT cc.id, cc.crop_id, c.name AS crop_name, cc.planted_on, cc.expected_harvest_on,
        cc.status, cc.quantity_kg, ${GROWTH_PCT_SQL} AS growth_pct
      FROM crop_cycles cc
      JOIN crops c ON c.organization_id = cc.organization_id AND c.id = cc.crop_id
      WHERE cc.organization_id = f.organization_id AND cc.field_id = f.id AND cc.status = 'growing'
      LIMIT 1
    ) cyc ON true
    LEFT JOIN LATERAL (
      SELECT json_agg(x.activity ORDER BY x.activity) AS activities
      FROM (
        SELECT DISTINCT t.activity
        FROM tasks t
        WHERE t.organization_id = f.organization_id AND t.field_id = f.id AND t.status != 'done'
      ) x
    ) act ON true
    WHERE ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ${fetchLimit}
  `);

  const hasMore = rows.rows.length > params.limit;
  const page = hasMore ? rows.rows.slice(0, params.limit) : rows.rows;

  let nextCursor: string | null = null;
  if (hasMore) {
    const last = page[page.length - 1]!;
    const sortValue =
      params.sort === "newest"
        ? // Postgres's timestamptz has microsecond precision; JS `Date`
          // only has millisecond precision. Round-tripping `created_at`
          // through `Date` truncates it, and since many rows can share one
          // `now()` value (e.g. a bulk seed running in one transaction),
          // that truncated cursor undershoots the true value and silently
          // drops every row still sitting at that exact instant. Keep the
          // driver's raw text form instead — it's valid input to `::timestamptz` as-is.
          (typeof last.sort_created_at === "string" ? last.sort_created_at : last.sort_created_at.toISOString())
        : params.sort === "name" || params.sort === "-name"
          ? last.sort_name
          : last.sort_position;
    nextCursor = encodeFieldCursor(sortValue, last.id);
  }

  return { items: page.map(toFieldSummary), nextCursor };
}

export interface FieldWithCycleRecord {
  id: string;
  farmId: string;
  name: string;
  boundary: MultiPolygon;
  areaM2: number;
  centroid: Point;
  position: number;
  lastRefreshSucceededAt: string | null;
  lastRefreshError: string | null;
  cropCycle: FieldCropCycleRecord | null;
}

/** The same projection as `listFields`' per-row shape plus `boundary`, for the editor (§2.3). */
export async function getFieldWithCycle(tx: Tx, organizationId: string, id: string): Promise<FieldWithCycleRecord | null> {
  const rows = await tx.execute<
    FieldSummaryRow & { boundary: MultiPolygon }
  >(sql`
    SELECT
      f.id,
      f.farm_id,
      f.name,
      ST_AsGeoJSON(f.boundary)::json AS boundary,
      ST_Area(f.boundary) AS area_m2,
      ST_AsGeoJSON(ST_Centroid(f.boundary))::json AS centroid,
      f.position,
      f.last_refresh_succeeded_at,
      f.last_refresh_error,
      cyc.id AS cycle_id,
      cyc.crop_id AS cycle_crop_id,
      cyc.crop_name AS cycle_crop_name,
      cyc.planted_on AS cycle_planted_on,
      cyc.expected_harvest_on AS cycle_expected_harvest_on,
      cyc.status AS cycle_status,
      cyc.quantity_kg AS cycle_quantity_kg,
      cyc.growth_pct AS cycle_growth_pct
    FROM fields f
    JOIN farms fa ON fa.organization_id = f.organization_id AND fa.id = f.farm_id
    LEFT JOIN LATERAL (
      SELECT cc.id, cc.crop_id, c.name AS crop_name, cc.planted_on, cc.expected_harvest_on,
        cc.status, cc.quantity_kg, ${GROWTH_PCT_SQL} AS growth_pct
      FROM crop_cycles cc
      JOIN crops c ON c.organization_id = cc.organization_id AND c.id = cc.crop_id
      WHERE cc.organization_id = f.organization_id AND cc.field_id = f.id AND cc.status = 'growing'
      LIMIT 1
    ) cyc ON true
    WHERE f.organization_id = ${organizationId} AND f.id = ${id}
  `);
  const row = rows.rows[0];
  if (!row) {
    return null;
  }
  const summary = toFieldSummary(row);
  return {
    id: summary.id,
    farmId: summary.farmId,
    name: summary.name,
    boundary: row.boundary,
    areaM2: summary.areaM2,
    centroid: summary.centroid,
    position: summary.position,
    lastRefreshSucceededAt: summary.lastRefreshSucceededAt,
    lastRefreshError: summary.lastRefreshError,
    cropCycle: summary.cropCycle,
  };
}

export interface FieldFeature {
  type: "Feature";
  geometry: MultiPolygon;
  properties: { id: string; name: string; centroid: Point; areaM2: number };
}

export interface FieldFeatureCollection {
  type: "FeatureCollection";
  features: FieldFeature[];
}

/**
 * The map's own endpoint (§2.3, §3.1): deliberately returns geometry the
 * list omits, so the panel's page size and the map's viewport are
 * independent — paging the list must not blank polygons off the map.
 */
export async function listFieldGeometries(
  tx: Tx,
  organizationId: string,
  bbox?: BBox,
): Promise<FieldFeatureCollection> {
  const conditions: ReturnType<typeof sql>[] = [sql`organization_id = ${organizationId}`];
  if (bbox) {
    const [west, south, east, north] = bbox;
    conditions.push(sql`boundary && ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)::geography`);
  }
  const whereClause = sql.join(conditions, sql` AND `);

  const rows = await tx.execute<{
    id: string;
    name: string;
    boundary: MultiPolygon;
    centroid: Point;
    area_m2: number;
  }>(sql`
    SELECT id, name, ST_AsGeoJSON(boundary)::json AS boundary,
      ST_AsGeoJSON(ST_Centroid(boundary))::json AS centroid, ST_Area(boundary) AS area_m2
    FROM fields
    WHERE ${whereClause}
  `);

  return {
    type: "FeatureCollection",
    features: rows.rows.map((row) => ({
      type: "Feature" as const,
      geometry: row.boundary,
      properties: { id: row.id, name: row.name, centroid: row.centroid, areaM2: row.area_m2 },
    })),
  };
}

export interface UpdateFieldInput {
  name?: string;
  boundary?: MultiPolygon;
}

export async function updateField(tx: Tx, organizationId: string, id: string, input: UpdateFieldInput): Promise<void> {
  if (input.boundary) {
    await assertValidBoundary(tx, input.boundary);
  }
  if (input.name === undefined && input.boundary === undefined) {
    return;
  }
  const assignments: ReturnType<typeof sql>[] = [sql`updated_at = now()`];
  if (input.name !== undefined) {
    assignments.push(sql`name = ${input.name}`);
  }
  if (input.boundary !== undefined) {
    assignments.push(sql`boundary = ST_GeomFromGeoJSON(${JSON.stringify(input.boundary)})`);
  }
  await tx.execute(sql`
    UPDATE fields SET ${sql.join(assignments, sql`, `)}
    WHERE organization_id = ${organizationId} AND id = ${id}
  `);
}

export async function deleteField(tx: Tx, organizationId: string, id: string): Promise<void> {
  await tx.execute(sql`DELETE FROM fields WHERE organization_id = ${organizationId} AND id = ${id}`);
}

/** The worker's post-refresh rollup enqueue needs to know which farm a field belongs to (TASK-home-dashboard §2.9) — `RefreshProcessor` only carries a `fieldId`. */
export async function getFieldFarmId(tx: Tx, organizationId: string, fieldId: string): Promise<string | null> {
  const rows = await tx.execute<{ farm_id: string }>(sql`
    SELECT farm_id FROM fields WHERE organization_id = ${organizationId} AND id = ${fieldId}
  `);
  return rows.rows[0]?.farm_id ?? null;
}

/** A cheap existence check for the field-scoped observation/stress-zone endpoints' 404 (NFR-7) — no crop-cycle join, unlike `getFieldWithCycle`. */
export async function fieldExists(tx: Tx, organizationId: string, id: string): Promise<boolean> {
  const rows = await tx.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (SELECT 1 FROM fields WHERE organization_id = ${organizationId} AND id = ${id}) AS exists
  `);
  return rows.rows[0]!.exists;
}

export interface RefreshResult {
  succeeded: boolean;
  error: string | null;
}

/**
 * NFR-8: `lastRefreshAt` moves on every attempt; `lastRefreshSucceededAt`
 * only on success, so a farmer sees the last time data actually changed, not
 * merely the last time the worker tried. `lastRefreshError` is cleared on
 * success and set only on the final (post-retry) failure — a scene skipped
 * for cloud cover is not a failure and must not touch either column
 * (TASK-satellite-pipeline §6 item 5).
 */
export async function recordRefreshResult(
  tx: Tx,
  organizationId: string,
  id: string,
  result: RefreshResult,
): Promise<void> {
  await tx.execute(sql`
    UPDATE fields
    SET last_refresh_at = now(),
      last_refresh_succeeded_at = CASE WHEN ${result.succeeded} THEN now() ELSE last_refresh_succeeded_at END,
      last_refresh_error = ${result.error},
      updated_at = now()
    WHERE organization_id = ${organizationId} AND id = ${id}
  `);
}

/** `max(position) + 1` for the org's farm — the append position for a newly created field. */
export async function nextFieldPosition(tx: Tx, organizationId: string, farmId: string): Promise<number> {
  const rows = await tx.execute<{ next: string }>(sql`
    SELECT COALESCE(MAX(position), 0) + 1 AS next
    FROM fields
    WHERE organization_id = ${organizationId} AND farm_id = ${farmId}
  `);
  return Number(rows.rows[0]!.next);
}
