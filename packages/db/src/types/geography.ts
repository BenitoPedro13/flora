import { customType } from "drizzle-orm/pg-core";

/**
 * `[VERIFY]` in architecture.md §5.2 resolved 2026-08-15 against a live
 * PostGIS 3.4 instance (packages/db/src/queries/spike-roundtrip.ts): node-postgres
 * returns `geography` columns as **WKB hex** (e.g. `0106000020E6...`), not GeoJSON
 * text. `JSON.parse`-ing it throws.
 *
 * So these types exist only to give `drizzle-kit generate` the correct column
 * DDL (`geography(...)`) and are never used to move a value through Drizzle's
 * typed select/insert API. Every read and write goes through `ST_AsGeoJSON` /
 * `ST_GeomFromGeoJSON` in `packages/db/src/queries/spatial.ts` instead — the
 * fallback architecture.md §5.2 already named. `data` is typed `string` (the
 * raw WKB hex) precisely so nothing accidentally treats it as parsed GeoJSON.
 */
export const geographyMultiPolygon = customType<{ data: string }>({
  dataType: () => "geography(MultiPolygon,4326)",
});

export const geographyPolygon = customType<{ data: string }>({
  dataType: () => "geography(Polygon,4326)",
});

export const geographyPoint = customType<{ data: string }>({
  dataType: () => "geography(Point,4326)",
});
