import { describe, expect, it } from "vitest";
import { computeStats, sceneIsValid, type DecodedRaster } from "./raster.js";

function makeRaster(width: number, height: number, values: number[], sclClass = 4): DecodedRaster {
  return {
    width,
    height,
    indexValues: Float32Array.from(values),
    sclValues: Uint8Array.from(values.map(() => sclClass)),
  };
}

describe("computeStats", () => {
  it("excludes nodata (NaN) and non-vegetation-floor pixels from every statistic", () => {
    // 0.05 is below the 0.10 floor and must not drag min/p10 down.
    const raster = makeRaster(3, 1, [NaN, 0.05, 0.2]);
    const stats = computeStats(raster);
    expect(stats.min).toBeCloseTo(0.2, 5);
    expect(stats.max).toBeCloseTo(0.2, 5);
    expect(stats.mean).toBeCloseTo(0.2, 5);
  });

  it("computes p10/p90 by linear interpolation over the floor-filtered population", () => {
    const values = Array.from({ length: 11 }, (_, i) => 0.1 + i * 0.08); // 0.10 .. 0.90
    const raster = makeRaster(11, 1, values);
    const stats = computeStats(raster);
    expect(stats.p10).toBeCloseTo(0.18, 5);
    expect(stats.p90).toBeCloseTo(0.82, 4);
  });
});

describe("sceneIsValid", () => {
  it("passes when >= 70% of in-field pixels are clear per SCL", () => {
    // 8 clear (class 4), 2 cloud (class 9) => 80% clear.
    const values = Array(10).fill(0.5);
    const raster = makeRaster(10, 1, values, 4);
    for (let i = 0; i < 2; i++) {
      raster.sclValues[i] = 9;
    }
    expect(sceneIsValid(raster)).toBe(true);
  });

  it("fails when clear fraction is under 70%", () => {
    const values = Array(10).fill(0.5);
    const raster = makeRaster(10, 1, values, 9); // all cloud
    expect(sceneIsValid(raster)).toBe(false);
  });

  it("ignores nodata pixels when computing the clear fraction", () => {
    const raster = makeRaster(2, 1, [NaN, 0.5], 4);
    expect(sceneIsValid(raster)).toBe(true);
  });
});
