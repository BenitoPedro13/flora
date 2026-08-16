import type { BBox } from "@flora/contracts";
import { describe, expect, it } from "vitest";
import type { DecodedRaster } from "./raster.js";
import { contourMask, lonLatToPixel, meanValueInPolygon, pixelToLonLat } from "./vectorise.js";

const BBOX: BBox = [-59.14, -4.59, -59.12, -4.57]; // [west, south, east, north]

describe("pixelToLonLat / lonLatToPixel — the y-flip risk (§6 item 3)", () => {
  it("row 0 (north edge, geotiff's top-to-bottom convention) maps to the bbox's north latitude, not south", () => {
    const [, topLat] = pixelToLonLat(BBOX, 100, 100, 0, 0);
    const [, bottomLat] = pixelToLonLat(BBOX, 100, 100, 0, 100);
    expect(topLat).toBeCloseTo(BBOX[3], 5); // north
    expect(bottomLat).toBeCloseTo(BBOX[1], 5); // south
    expect(topLat).toBeGreaterThan(bottomLat);
  });

  it("column 0 maps to the bbox's west longitude", () => {
    const [leftLon] = pixelToLonLat(BBOX, 100, 100, 0, 50);
    const [rightLon] = pixelToLonLat(BBOX, 100, 100, 100, 50);
    expect(leftLon).toBeCloseTo(BBOX[0], 5);
    expect(rightLon).toBeCloseTo(BBOX[2], 5);
  });

  it("round-trips through lonLatToPixel", () => {
    const [lon, lat] = pixelToLonLat(BBOX, 100, 100, 37, 62);
    const [x, y] = lonLatToPixel(BBOX, 100, 100, lon, lat);
    expect(x).toBeCloseTo(37, 5);
    expect(y).toBeCloseTo(62, 5);
  });
});

describe("contourMask", () => {
  it("isolates a single square block of 1s as one polygon", () => {
    const width = 10;
    const height = 10;
    const mask = new Uint8Array(width * height);
    for (let y = 2; y < 5; y++) {
      for (let x = 2; x < 5; x++) {
        mask[y * width + x] = 1;
      }
    }
    const polygons = contourMask(mask, width, height);
    expect(polygons).toHaveLength(1);
  });

  it("returns two separate polygons for two disjoint blocks", () => {
    const width = 20;
    const height = 10;
    const mask = new Uint8Array(width * height);
    for (let y = 2; y < 5; y++) {
      for (let x = 2; x < 5; x++) mask[y * width + x] = 1;
      for (let x = 14; x < 17; x++) mask[y * width + x] = 1;
    }
    const polygons = contourMask(mask, width, height);
    expect(polygons).toHaveLength(2);
  });
});

describe("meanValueInPolygon", () => {
  it("averages only the raster pixels whose center falls inside the polygon", () => {
    const width = 4;
    const height = 4;
    const raster: DecodedRaster = {
      width,
      height,
      indexValues: Float32Array.from(Array(width * height).fill(0.5)),
      sclValues: new Uint8Array(width * height),
    };
    // Overwrite a known 2x2 block with 0.9.
    for (let y = 1; y < 3; y++) {
      for (let x = 1; x < 3; x++) {
        raster.indexValues[y * width + x] = 0.9;
      }
    }
    const poly = {
      coordinates: [
        [
          [1, 1],
          [3, 1],
          [3, 3],
          [1, 3],
          [1, 1],
        ],
      ],
    };
    expect(meanValueInPolygon(raster, poly)).toBeCloseTo(0.9, 5);
  });
});
