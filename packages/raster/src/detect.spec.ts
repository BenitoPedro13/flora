import { SQUARE_METRES_PER_ACRE } from "@flora/contracts";
import type { BBox, Polygon } from "@flora/contracts";
import { area as turfArea, polygon as turfPolygon } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { detectStressZones } from "./detect.js";
import type { DecodedRaster } from "./raster.js";

const MIN_ZONE_M2 = 0.5 * SQUARE_METRES_PER_ACRE;
const MAX_ZONE_M2 = 4 * SQUARE_METRES_PER_ACRE;

// 200x200 over a 0.1deg square near the equator — each pixel is roughly
// 55.5m x 55.6m, so a 4x4-pixel block is ~12.2 ac, comfortably over the 4 ac
// split cap and the min 0.5 ac floor.
const BBOX: BBox = [-59.2, -4.6, -59.1, -4.5];
const WIDTH = 200;
const HEIGHT = 200;

function fullBboxPolygon(bbox: BBox): Polygon {
  const [west, south, east, north] = bbox;
  return {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}

function makeRasterWithStressBlock(blockSize: number, startX: number, startY: number): DecodedRaster {
  const indexValues = new Float32Array(WIDTH * HEIGHT).fill(0.6);
  const sclValues = new Uint8Array(WIDTH * HEIGHT).fill(4);
  for (let y = startY; y < startY + blockSize; y++) {
    for (let x = startX; x < startX + blockSize; x++) {
      indexValues[y * WIDTH + x] = 0.15;
    }
  }
  return { width: WIDTH, height: HEIGHT, indexValues, sclValues };
}

describe("detectStressZones", () => {
  it("splits a >4ac contiguous stressed region into >= 3 zones, each <= 4ac (§6 item 4)", () => {
    const raster = makeRasterWithStressBlock(4, 98, 98); // ~12.2 ac block
    const zones = detectStressZones({ raster, bbox: BBOX, bufferedInterior: fullBboxPolygon(BBOX) });

    expect(zones.length).toBeGreaterThanOrEqual(3);
    for (const zone of zones) {
      const areaM2 = turfArea(turfPolygon(zone.geometry.coordinates));
      expect(areaM2).toBeLessThanOrEqual(MAX_ZONE_M2 * 1.01);
    }
  });

  it("drops a candidate region under the 0.5 ac minimum", () => {
    const raster = makeRasterWithStressBlock(1, 100, 100); // ~0.3 ac — under the floor
    const zones = detectStressZones({ raster, bbox: BBOX, bufferedInterior: fullBboxPolygon(BBOX) });
    expect(zones).toHaveLength(0);
  });

  it("keeps a region between 0.5 and 4 ac as a single zone", () => {
    const raster = makeRasterWithStressBlock(2, 100, 100); // ~3.05 ac
    const zones = detectStressZones({ raster, bbox: BBOX, bufferedInterior: fullBboxPolygon(BBOX) });
    expect(zones).toHaveLength(1);
    const areaM2 = turfArea(turfPolygon(zones[0]!.geometry.coordinates));
    expect(areaM2).toBeGreaterThanOrEqual(MIN_ZONE_M2 * 0.99);
    expect(areaM2).toBeLessThanOrEqual(MAX_ZONE_M2);
  });

  it("assigns high severity when the zone's mean index value is well below the field median", () => {
    const raster = makeRasterWithStressBlock(2, 100, 100);
    const zones = detectStressZones({ raster, bbox: BBOX, bufferedInterior: fullBboxPolygon(BBOX) });
    expect(zones[0]!.severity).toBe("high");
    expect(zones[0]!.indexValue).toBeCloseTo(0.15, 1);
  });

  it("every zone's coordinates fall within the source bbox — the y-flip regression guard (§6 item 3 proxy)", () => {
    const raster = makeRasterWithStressBlock(2, 100, 100);
    const zones = detectStressZones({ raster, bbox: BBOX, bufferedInterior: fullBboxPolygon(BBOX) });
    for (const zone of zones) {
      for (const ring of zone.geometry.coordinates) {
        for (const [lon, lat] of ring) {
          expect(lon).toBeGreaterThanOrEqual(BBOX[0]);
          expect(lon).toBeLessThanOrEqual(BBOX[2]);
          expect(lat).toBeGreaterThanOrEqual(BBOX[1]);
          expect(lat).toBeLessThanOrEqual(BBOX[3]);
        }
      }
    }
  });
});
