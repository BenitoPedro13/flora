import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { renderRasterPng } from "./ramp.js";
import type { DecodedRaster } from "./raster.js";

describe("renderRasterPng", () => {
  it("sets alpha 0 for nodata and sub-floor pixels, opaque for the rest, and produces a valid PNG of the right size", async () => {
    const width = 2;
    const height = 1;
    const raster: DecodedRaster = {
      width,
      height,
      indexValues: Float32Array.from([NaN, 0.5]),
      sclValues: new Uint8Array(2).fill(4),
    };
    const png = await renderRasterPng(raster, { min: 0.4, max: 0.6, mean: 0.5, stddev: 0.05, p10: 0.4, p90: 0.6 });

    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(width);
    expect(info.height).toBe(height);
    expect(data[3]).toBe(0); // nodata pixel, transparent
    expect(data[7]).toBe(255); // valid pixel, opaque
  });

  it("falls back to min/max when p10 === p90 (a small stressed minority collapses the percentile domain) instead of painting everything one flat colour", async () => {
    const width = 2;
    const height = 1;
    const raster: DecodedRaster = {
      width,
      height,
      indexValues: Float32Array.from([0.2, 0.6]),
      sclValues: new Uint8Array(2).fill(4),
    };
    // A degenerate stats object exactly like a field whose stressed pixels
    // are under detect.ts's ~10% threshold: p10 === p90 === the background.
    const png = await renderRasterPng(raster, { min: 0.2, max: 0.6, mean: 0.5, stddev: 0.1, p10: 0.6, p90: 0.6 });

    const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixel0 = [data[0], data[1], data[2]];
    const pixel1 = [data[4], data[5], data[6]];
    expect(pixel0).not.toEqual(pixel1);
  });
});
