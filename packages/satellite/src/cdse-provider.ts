import type { BBox, MultiPolygon } from "@flora/contracts";
import { findLatestScene } from "./cdse/catalog.js";
import {
  fetchAllIndexRasters as processFetchAllIndexRasters,
  fetchIndexRaster as processFetchIndexRaster,
  fetchTrueColorRaster as processFetchTrueColorRaster,
} from "./cdse/process.js";
import { getAccessToken, type CdseCredentials, type TokenCache } from "./cdse/token.js";
import type {
  FetchAllIndexRastersInput,
  FetchAllIndexRastersResult,
  FetchIndexRasterInput,
  FetchIndexRasterResult,
  FetchTrueColorRasterInput,
  FetchTrueColorRasterResult,
  FindLatestSceneInput,
  Scene,
  SatelliteProvider,
} from "./provider.js";

function envelopeOf(boundary: MultiPolygon): BBox {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const polygon of boundary.coordinates) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        west = Math.min(west, lon);
        east = Math.max(east, lon);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
      }
    }
  }
  return [west, south, east, north];
}

/** The real `SatelliteProvider` (`TASK-satellite-pipeline` §2.2) — HTTP conversation with CDSE, nothing else. */
export class CdseSatelliteProvider implements SatelliteProvider {
  constructor(
    private readonly cache: TokenCache,
    private readonly credentials: CdseCredentials,
  ) {}

  async findLatestScene(input: FindLatestSceneInput): Promise<Scene | null> {
    const token = await getAccessToken(this.cache, this.credentials);
    return findLatestScene(token, input);
  }

  async fetchIndexRaster(input: FetchIndexRasterInput): Promise<FetchIndexRasterResult> {
    const token = await getAccessToken(this.cache, this.credentials);
    const { indexGeotiff, sclGeotiff } = await processFetchIndexRaster(token, {
      boundary: input.boundary,
      sceneDate: input.sceneDate,
      index: input.index,
      widthPx: input.widthPx,
      heightPx: input.heightPx,
    });
    return { indexGeotiff, sclGeotiff, bbox: envelopeOf(input.boundary) };
  }

  async fetchAllIndexRasters(input: FetchAllIndexRastersInput): Promise<FetchAllIndexRastersResult> {
    const token = await getAccessToken(this.cache, this.credentials);
    const { indexGeotiffs, sclGeotiff } = await processFetchAllIndexRasters(token, {
      boundary: input.boundary,
      sceneDate: input.sceneDate,
      indices: input.indices,
      widthPx: input.widthPx,
      heightPx: input.heightPx,
    });
    return { indexGeotiffs, sclGeotiff, bbox: envelopeOf(input.boundary) };
  }

  async fetchTrueColorRaster(input: FetchTrueColorRasterInput): Promise<FetchTrueColorRasterResult> {
    const token = await getAccessToken(this.cache, this.credentials);
    const { rgbGeotiff, sclGeotiff } = await processFetchTrueColorRaster(token, {
      boundary: input.boundary,
      sceneDate: input.sceneDate,
      widthPx: input.widthPx,
      heightPx: input.heightPx,
    });
    return { rgbGeotiff, sclGeotiff, bbox: envelopeOf(input.boundary) };
  }
}
