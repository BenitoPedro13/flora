import type { BBox, MultiPolygon, ObservationIndex } from "@flora/contracts";

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
  index: ObservationIndex;
  widthPx: number;
  heightPx: number;
}

/**
 * Two single-band GeoTIFFs from one Process API call (one PU charge) — the
 * requested index and the Scene Classification Layer, returned as separate
 * `multipart/form-data` parts (`cdse/process.ts`'s `[VERIFY]`), not one
 * multi-band file. `bbox` is the raster's actual geographic extent (the
 * clipped boundary's envelope), for the observation's stored `bbox` and the
 * pixel↔lon/lat transform in `packages/raster`.
 */
export interface FetchIndexRasterResult {
  indexGeotiff: ArrayBuffer;
  sclGeotiff: ArrayBuffer;
  bbox: BBox;
}

export interface SatelliteProvider {
  findLatestScene(input: FindLatestSceneInput): Promise<Scene | null>;
  fetchIndexRaster(input: FetchIndexRasterInput): Promise<FetchIndexRasterResult>;
}
