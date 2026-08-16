import { SQUARE_METRES_PER_ACRE } from "@flora/contracts";
import type { BBox, Polygon, StressSeverity } from "@flora/contracts";
import { area as turfArea, featureCollection, intersect, polygon as turfPolygon, union } from "@turf/turf";
import type { Feature, MultiPolygon as GeoMultiPolygon, Polygon as GeoPolygon } from "geojson";
import { floorFilteredSortedValues, percentile, type DecodedRaster } from "./raster.js";
import { NON_VEGETATION_FLOOR } from "./vegetation-floor.js";
import { contourMask, lonLatToPixel, meanValueInPolygon, pixelPolygonToGeoJSON, type PixelPolygon } from "./vectorise.js";

/**
 * Architecture §7.5's rules, implemented verbatim (TASK-satellite-pipeline
 * §2.9). `DETECTOR_VERSION` bumps on any threshold change, so a change to a
 * number shows up in review as a version bump rather than a silently edited
 * literal. Stress detection is NDVI-only (`TASK-spectral-indices` §2.4) —
 * every call here always omits `index` from `floorFilteredSortedValues`,
 * which defaults to NDVI's own floor behaviour.
 */
export const DETECTOR_VERSION = "v1";

const MIN_ZONE_M2 = 0.5 * SQUARE_METRES_PER_ACRE;
const MAX_ZONE_M2 = 4 * SQUARE_METRES_PER_ACRE;

export interface DetectedZone {
  geometry: Polygon;
  severity: StressSeverity;
  indexValue: number;
}

function severityFor(indexValue: number, fieldMedian: number): StressSeverity {
  if (indexValue <= 0.6 * fieldMedian) {
    return "high";
  }
  if (indexValue <= 0.75 * fieldMedian) {
    return "medium";
  }
  return "low";
}

function toGeoJsonPolygon(p: Polygon): Feature<GeoPolygon> {
  return turfPolygon(p.coordinates);
}

const METRES_PER_DEGREE_LAT = 111_320;

/**
 * A degree-per-axis grid sized so no cell exceeds `MAX_ZONE_M2`, with
 * `columns`/`rows` from `Math.ceil` (not `turf.squareGrid`'s `Math.floor`) —
 * `squareGrid` centres a floor-rounded grid inside the bbox and silently
 * drops whatever doesn't fit a whole cell at the edges, which for this rule
 * means real stressed area vanishing rather than becoming a (smaller, still
 * valid) zone. `Math.ceil` plus equal subdivision guarantees full coverage;
 * every resulting cell is `<=` the target size, some smaller at the edges,
 * which the undersized-cell merge below already has to handle anyway.
 */
function coverageGrid(bbox: [number, number, number, number], cellSideM: number): Feature<GeoPolygon>[] {
  const [west, south, east, north] = bbox;
  const midLat = (south + north) / 2;
  const lonMetresPerDegree = METRES_PER_DEGREE_LAT * Math.cos((midLat * Math.PI) / 180);
  const cellWidthDeg = cellSideM / lonMetresPerDegree;
  const cellHeightDeg = cellSideM / METRES_PER_DEGREE_LAT;
  const columns = Math.max(1, Math.ceil((east - west) / cellWidthDeg));
  const rows = Math.max(1, Math.ceil((north - south) / cellHeightDeg));
  const actualWidth = (east - west) / columns;
  const actualHeight = (north - south) / rows;

  const cells: Feature<GeoPolygon>[] = [];
  for (let col = 0; col < columns; col++) {
    for (let row = 0; row < rows; row++) {
      const x0 = west + col * actualWidth;
      const x1 = x0 + actualWidth;
      const y0 = south + row * actualHeight;
      const y1 = y0 + actualHeight;
      cells.push(
        turfPolygon([
          [
            [x0, y0],
            [x1, y0],
            [x1, y1],
            [x0, y1],
            [x0, y0],
          ],
        ]),
      );
    }
  }
  return cells;
}

/** Splits a single ring set (no holes tracked through the split — §7 decision 3 accepts this) into cells, largest-neighbour-merges any cell under 0.5 ac. */
function splitLargeRegion(region: Feature<GeoPolygon | GeoMultiPolygon>): Feature<GeoPolygon>[] {
  const cellSideM = Math.sqrt(MAX_ZONE_M2);
  const grid = coverageGrid(turfBboxOf(region), cellSideM);

  const cells: Feature<GeoPolygon>[] = [];
  for (const cell of grid) {
    const clipped = intersect(featureCollection([cell, region as Feature<GeoPolygon>]));
    if (!clipped) {
      continue;
    }
    for (const part of flattenToPolygons(clipped)) {
      cells.push(part);
    }
  }

  // Merge undersized cells into their nearest neighbour (by centroid
  // distance) among this same split — a documented simplification of
  // "largest neighbour" (§7 decision 3): exact shared-edge-length adjacency
  // is unnecessary precision for a rule whose whole point is "this is
  // several jobs, not one."
  const sized = cells.map((cell) => ({ cell, areaM2: turfArea(cell) }));
  const kept: { cell: Feature<GeoPolygon>; areaM2: number }[] = [];
  const undersized = sized.filter((c) => c.areaM2 < MIN_ZONE_M2);
  const large = sized.filter((c) => c.areaM2 >= MIN_ZONE_M2);

  for (const small of undersized) {
    const pool = large.length > 0 ? large : sized.filter((c) => c !== small);
    if (pool.length === 0) {
      kept.push(small);
      continue;
    }
    const [smallLon, smallLat] = centroidOf(small.cell);
    let nearest = pool[0]!;
    let nearestDist = Infinity;
    for (const candidate of pool) {
      const [lon, lat] = centroidOf(candidate.cell);
      const dist = (lon - smallLon) ** 2 + (lat - smallLat) ** 2;
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = candidate;
      }
    }
    const merged = union(featureCollection([small.cell, nearest.cell]));
    if (merged) {
      nearest.cell = merged as Feature<GeoPolygon>;
      nearest.areaM2 = turfArea(merged);
    }
  }
  kept.push(...large);

  return kept.map((c) => c.cell);
}

function centroidOf(feature: Feature<GeoPolygon>): [number, number] {
  const ring = feature.geometry.coordinates[0]!;
  let x = 0;
  let y = 0;
  for (const [lon, lat] of ring) {
    x += lon!;
    y += lat!;
  }
  return [x / ring.length, y / ring.length];
}

function turfBboxOf(feature: Feature<GeoPolygon | GeoMultiPolygon>): [number, number, number, number] {
  const coords = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const polygon of coords) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        west = Math.min(west, lon!);
        east = Math.max(east, lon!);
        south = Math.min(south, lat!);
        north = Math.max(north, lat!);
      }
    }
  }
  return [west, south, east, north];
}

function flattenToPolygons(feature: Feature<GeoPolygon | GeoMultiPolygon>): Feature<GeoPolygon>[] {
  if (feature.geometry.type === "Polygon") {
    return [feature as Feature<GeoPolygon>];
  }
  return feature.geometry.coordinates.map((coordinates) => turfPolygon(coordinates));
}

export interface DetectStressZonesInput {
  raster: DecodedRaster;
  bbox: BBox;
  /** Already 10m-buffered inward from the field boundary (`packages/db`'s `bufferedFieldInterior`) — the §7.5 edge-buffer rule. */
  bufferedInterior: Polygon;
}

/**
 * Stress pixel: `< p10` (computed over the floor-filtered population,
 * `raster.ts`), and `>= 0.10` itself — a bare-soil pixel is not "stressed
 * vegetation," it's not vegetation. Edge buffer, min/max area and the split
 * rule all apply after; severity compares each zone's mean index value
 * against the field's median (of the same floor-filtered population).
 */
export function detectStressZones(input: DetectStressZonesInput): DetectedZone[] {
  const { raster, bbox } = input;
  const { width, height } = raster;
  const sorted = floorFilteredSortedValues(raster);
  const p10 = percentile(sorted, 0.1);
  const median = percentile(sorted, 0.5);

  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    const v = raster.indexValues[i]!;
    mask[i] = !Number.isNaN(v) && v >= NON_VEGETATION_FLOOR && v < p10 ? 1 : 0;
  }

  const interior = toGeoJsonPolygon(input.bufferedInterior);
  const zones: DetectedZone[] = [];

  for (const candidate of contourMask(mask, width, height)) {
    const candidateGeo = pixelPolygonToGeoJSON(bbox, width, height, candidate);
    const candidateFeature = toGeoJsonPolygon(candidateGeo);
    const clipped = intersect(featureCollection([candidateFeature, interior]));
    if (!clipped) {
      continue;
    }

    for (const part of flattenToPolygons(clipped)) {
      const partAreaM2 = turfArea(part);
      const regions = partAreaM2 > MAX_ZONE_M2 ? splitLargeRegion(part) : [part];

      for (const region of regions) {
        const areaM2 = turfArea(region);
        if (areaM2 < MIN_ZONE_M2) {
          continue;
        }
        const geometry: Polygon = { type: "Polygon", coordinates: region.geometry.coordinates as Polygon["coordinates"] };
        const pixelPoly: PixelPolygon = {
          coordinates: geometry.coordinates.map((ring) =>
            ring.map(([lon, lat]) => lonLatToPixel(bbox, width, height, lon!, lat!)),
          ),
        };
        const indexValue = meanValueInPolygon(raster, pixelPoly);
        if (Number.isNaN(indexValue)) {
          continue;
        }
        zones.push({ geometry, severity: severityFor(indexValue, median), indexValue });
      }
    }
  }

  return zones;
}
