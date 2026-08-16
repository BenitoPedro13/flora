import type { BBox, Polygon } from "@flora/contracts";
import { contours as d3Contours } from "d3-contour";
import type { DecodedRaster } from "./raster.js";

/**
 * Thresholded pixels → GeoJSON polygons in lon/lat (architecture §7.2 step
 * 3c). d3-contour's documented convention: planar coordinates where
 * `⟨i + 0.5, j + 0.5⟩` corresponds to element `i + j*width` of the input
 * array — the **same** row-major, top-to-bottom order geotiff.js returns
 * pixels in (row 0 = north edge, GDAL's north-up convention). So `j`
 * increases *downward*, and the pixel→lon/lat transform below must subtract
 * for latitude (`north - ...`), never add — the y-flip
 * `TASK-satellite-pipeline`'s risk log warns about is getting that sign
 * backwards. Verified against the golden fixture's `ST_Contains` assertion
 * (§6 item 3), not by eye.
 */

/** A single boolean mask, row-major, `width * height`. `true` = candidate stress pixel. */
export function pixelToLonLat(bbox: BBox, width: number, height: number, x: number, y: number): [number, number] {
  const [west, south, east, north] = bbox;
  const lon = west + (x / width) * (east - west);
  const lat = north - (y / height) * (north - south);
  return [lon, lat];
}

export function lonLatToPixel(bbox: BBox, width: number, height: number, lon: number, lat: number): [number, number] {
  const [west, south, east, north] = bbox;
  const x = ((lon - west) / (east - west)) * width;
  const y = ((north - lat) / (north - south)) * height;
  return [x, y];
}

/** One connected region from the mask, in pixel space (not yet geo-transformed). */
export interface PixelPolygon {
  /** GeoJSON-shaped rings in pixel coordinates — first ring exterior, rest holes. */
  coordinates: number[][][];
}

/**
 * Runs marching squares (`d3-contour`) over a binary mask and returns each
 * disjoint region as a separate pixel-space polygon — a single `contour()`
 * call returns one `MultiPolygon` whose `coordinates` array already
 * separates disjoint regions, one entry per region.
 */
export function contourMask(mask: Uint8Array, width: number, height: number): PixelPolygon[] {
  const values = Array.from(mask, (v) => v);
  const generator = d3Contours().size([width, height]);
  // .contour(values, threshold) returns the single MultiPolygon for
  // "value >= threshold" — 0.5 isolates exactly the `1`-valued pixels.
  const multiPolygon = generator.contour(values, 0.5);
  return multiPolygon.coordinates.map((coordinates) => ({ coordinates }));
}

export function pixelPolygonToGeoJSON(bbox: BBox, width: number, height: number, poly: PixelPolygon): Polygon {
  return {
    type: "Polygon",
    coordinates: poly.coordinates.map((ring) => ring.map(([x, y]) => pixelToLonLat(bbox, width, height, x!, y!))),
  };
}

/** Ray-casting point-in-polygon over pixel-space rings (exterior minus holes), for `meanValueInPolygon`. */
function pointInRings(rings: number[][][], x: number, y: number): boolean {
  let inside = false;
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
    const ring = rings[ringIndex]!;
    let crosses = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi! > y !== yj! > y && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) {
        crosses = !crosses;
      }
    }
    if (ringIndex === 0) {
      inside = crosses;
    } else if (crosses) {
      // A hole ring crossing means the point is excluded.
      inside = false;
      break;
    }
  }
  return inside;
}

/**
 * The mean raw index value of pixels inside `poly` (pixel-space rings) —
 * the zone's `indexValue`, computed by sampling the raster directly rather
 * than trusted from whatever generated the polygon (so it's correct even
 * after a zone has been reprojected or split, §detect.ts).
 */
export function meanValueInPolygon(raster: DecodedRaster, poly: PixelPolygon): number {
  const xs = poly.coordinates.flat().map((p) => p[0]!);
  const ys = poly.coordinates.flat().map((p) => p[1]!);
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const maxX = Math.min(raster.width - 1, Math.ceil(Math.max(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxY = Math.min(raster.height - 1, Math.ceil(Math.max(...ys)));

  let sum = 0;
  let count = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!pointInRings(poly.coordinates, x + 0.5, y + 0.5)) {
        continue;
      }
      const v = raster.indexValues[y * raster.width + x]!;
      if (!Number.isNaN(v)) {
        sum += v;
        count++;
      }
    }
  }
  return count > 0 ? sum / count : NaN;
}
