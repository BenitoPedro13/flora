import type { BBox, MultiPolygon, ScalarIndex } from "@flora/contracts";

/**
 * The interface architecture §3 says survived the prototype (`packages/satellite`
 * §2.2). Two implementations: `CdseSatelliteProvider` (real, `cdse-provider.ts`)
 * and `FixtureSatelliteProvider` (replays recorded responses, `fixture-provider.ts`)
 * — this is what makes the worker's raster pipeline testable offline.
 */

export interface Scene {
  id: string;
  /** ISO date the scene was captured. */
  date: string;
  cloudCoverPct: number;
}

export interface FindLatestSceneInput {
  bbox: BBox;
  from: string;
  to: string;
  maxCloudCoverPct: number;
}

export interface FetchIndexRasterInput {
  boundary: MultiPolygon;
  sceneId: string;
  sceneDate: string;
  index: ScalarIndex;
  widthPx: number;
  heightPx: number;
}

/**
 * Two single-band GeoTIFFs from one Process API call (one PU charge) — the
 * requested index and the Scene Classification Layer, extracted from a TAR
 * archive as separate members (`cdse/process.ts`, verified live 2026-08-16,
 * `TASK-satellite-live` §1.2), not one multi-band file. `bbox` is the raster's
 * actual geographic extent (the clipped boundary's envelope), for the
 * observation's stored `bbox` and the pixel↔lon/lat transform in
 * `packages/raster`.
 */
export interface FetchIndexRasterResult {
  indexGeotiff: ArrayBuffer;
  sclGeotiff: ArrayBuffer;
  bbox: BBox;
}

export interface FetchAllIndexRastersInput {
  boundary: MultiPolygon;
  sceneId: string;
  sceneDate: string;
  indices: readonly ScalarIndex[];
  widthPx: number;
  heightPx: number;
}

/**
 * Every requested scalar index from one Process API call, one PU charge
 * (`TASK-spectral-indices` §1.3, §2.1) — the daily-refresh path. Keyed by
 * index rather than positional, matching `cdse/process.ts`'s TAR-by-name
 * extraction.
 */
export interface FetchAllIndexRastersResult {
  indexGeotiffs: Map<ScalarIndex, ArrayBuffer>;
  sclGeotiff: ArrayBuffer;
  bbox: BBox;
}

export interface FetchTrueColorRasterInput {
  boundary: MultiPolygon;
  sceneId: string;
  sceneDate: string;
  widthPx: number;
  heightPx: number;
}

/**
 * A 3-band RGB GeoTIFF plus `scl` — no stats, no detection (§2.4/§2.5's
 * follow-on: true-colour has neither), but `scl` is still requested: the
 * RGB formula has no division, so it can't fall back on `0/0 = NaN` to
 * signal "outside the clip geometry" the way every scalar index does
 * (found live the same day this path shipped — `raster.ts`'s
 * `decodeGeoTiff` doc comment has the full story).
 */
export interface FetchTrueColorRasterResult {
  rgbGeotiff: ArrayBuffer;
  sclGeotiff: ArrayBuffer;
  bbox: BBox;
}

export interface SatelliteProvider {
  findLatestScene(input: FindLatestSceneInput): Promise<Scene | null>;
  /** The on-demand "just this one scalar index" path (§2.1). */
  fetchIndexRaster(input: FetchIndexRasterInput): Promise<FetchIndexRasterResult>;
  /** The daily-refresh path — every scalar index in one call (§2.1, §7 decision 6). */
  fetchAllIndexRasters(input: FetchAllIndexRastersInput): Promise<FetchAllIndexRastersResult>;
  /** True-colour's only path — on-demand, never scheduled (§2.5). */
  fetchTrueColorRaster(input: FetchTrueColorRasterInput): Promise<FetchTrueColorRasterResult>;
}
