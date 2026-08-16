import type { ObservationStats } from "@flora/contracts";
import { fromArrayBuffer } from "geotiff";

/**
 * GeoTIFF → stats (architecture §7.2 step 3a). The Process API request
 * (`packages/satellite/src/cdse/process.ts`) declares two named evalscript
 * outputs — the requested index (e.g. NDVI, FLOAT32) and the Scene
 * Classification Layer (UINT8) — and asks for two `output.responses[]`,
 * which Sentinel Hub returns as a `multipart/form-data` response, one
 * `image/tiff` part per identifier (`[VERIFY: this is the standard
 * documented Sentinel Hub behaviour for multiple responses, but was not
 * independently confirmed against a live CDSE response in this session —
 * confirm before the first live call, per CLAUDE.md §2.0]`). So this module
 * decodes two single-band GeoTIFFs, not one two-band file.
 */

const NON_VEGETATION_FLOOR = 0.1;

/**
 * Sentinel-2 L2A SCL classes counted as "clear" for the §7.5 scene-validity
 * rule: vegetation(4), not-vegetated(5), water(6), unclassified(7), snow(11).
 * Excluded: no-data(0), saturated/defective(1), dark-area(2), cloud-shadow(3),
 * cloud-medium(8), cloud-high(9), thin-cirrus(10) — the standard ESA
 * Sentinel-2 Level-2A classification (stable, public spec, not a `[VERIFY]`).
 */
const CLEAR_SCL_CLASSES = new Set([4, 5, 6, 7, 11]);

export interface DecodedRaster {
  width: number;
  height: number;
  /** Row-major, length `width * height`. `NaN` where nodata (outside the field boundary). */
  indexValues: Float32Array;
  /** Row-major SCL class per pixel, same dimensions. */
  sclValues: Uint8Array;
}

async function decodeSingleBand(buffer: ArrayBuffer): Promise<{ width: number; height: number; nodata: number | null; values: ArrayLike<number> }> {
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const rasters = await image.readRasters();
  return {
    width: image.getWidth(),
    height: image.getHeight(),
    nodata: image.getGDALNoData(),
    values: rasters[0] as unknown as ArrayLike<number>,
  };
}

export async function decodeGeoTiff(indexBuffer: ArrayBuffer, sclBuffer: ArrayBuffer): Promise<DecodedRaster> {
  const indexBand = await decodeSingleBand(indexBuffer);
  const sclBand = await decodeSingleBand(sclBuffer);
  if (indexBand.width !== sclBand.width || indexBand.height !== sclBand.height) {
    throw new Error(
      `Index and SCL rasters have different dimensions (${indexBand.width}x${indexBand.height} vs ${sclBand.width}x${sclBand.height})`,
    );
  }
  const { width, height } = indexBand;

  const indexValues = new Float32Array(width * height);
  for (let i = 0; i < indexValues.length; i++) {
    const v = indexBand.values[i]!;
    indexValues[i] = indexBand.nodata !== null && v === indexBand.nodata ? NaN : v;
  }
  const sclValues = new Uint8Array(width * height);
  for (let i = 0; i < sclValues.length; i++) {
    sclValues[i] = sclBand.values[i]!;
  }

  return { width, height, indexValues, sclValues };
}

/** The §7.5 scene-validity rule: skip the date unless >= 70% of in-field (non-nodata) pixels are clear per SCL. */
export function sceneIsValid(raster: DecodedRaster, minClearFraction = 0.7): boolean {
  let inField = 0;
  let clear = 0;
  for (let i = 0; i < raster.indexValues.length; i++) {
    if (Number.isNaN(raster.indexValues[i])) {
      continue;
    }
    inField++;
    if (CLEAR_SCL_CLASSES.has(raster.sclValues[i]!)) {
      clear++;
    }
  }
  if (inField === 0) {
    return false;
  }
  return clear / inField >= minClearFraction;
}

export function percentile(sorted: Float64Array, p: number): number {
  if (sorted.length === 0) {
    return NaN;
  }
  if (sorted.length === 1) {
    return sorted[0]!;
  }
  const rank = p * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) {
    return sorted[lower]!;
  }
  const weight = rank - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

/**
 * The floor-filtered, sorted population both `computeStats`'s percentiles
 * and `detect.ts`'s field-median severity threshold read from — one sort,
 * shared, so the two can never silently disagree on which pixels count as
 * "the field" (TASK-satellite-pipeline §7.5).
 */
export function floorFilteredSortedValues(raster: DecodedRaster): Float64Array {
  const values: number[] = [];
  for (const v of raster.indexValues) {
    if (!Number.isNaN(v) && v >= NON_VEGETATION_FLOOR) {
      values.push(v);
    }
  }
  return Float64Array.from(values).sort();
}

/**
 * Stats over in-field pixels at or above the non-vegetation floor (0.10) —
 * excluded from every statistic here, not just p10, so `min`/`mean` describe
 * the vegetated population the legend and the detector both reason about
 * (§7.5: floor pixels dragging p10 down is exactly the under-fire bug this
 * exclusion prevents; applying it uniformly avoids a second, inconsistent
 * "raw" stats object nobody asked for).
 */
export function computeStats(raster: DecodedRaster): ObservationStats {
  const sorted = floorFilteredSortedValues(raster);
  const n = sorted.length;
  const min = n > 0 ? sorted[0]! : NaN;
  const max = n > 0 ? sorted[n - 1]! : NaN;
  const mean = n > 0 ? sorted.reduce((sum, v) => sum + v, 0) / n : NaN;
  const variance = n > 0 ? sorted.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n : NaN;
  return {
    min,
    max,
    mean,
    stddev: Math.sqrt(variance),
    p10: percentile(sorted, 0.1),
    p90: percentile(sorted, 0.9),
  };
}
