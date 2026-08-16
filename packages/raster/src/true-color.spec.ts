import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { renderTrueColorPng } from "./true-color.js";

describe("renderTrueColorPng", () => {
  it("maps [0,1] float bands to RGB bytes and sets alpha 0 only where any band is nodata", async () => {
    const width = 2;
    const height = 1;
    const raster = {
      width,
      height,
      r: Float32Array.from([NaN, 1]),
      g: Float32Array.from([NaN, 0.5]),
      b: Float32Array.from([NaN, 0]),
    };
    const png = await renderTrueColorPng(raster);

    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(width);
    expect(info.height).toBe(height);
    expect(data[3]).toBe(0); // nodata pixel, transparent
    expect([data[4], data[5], data[6], data[7]]).toEqual([255, 128, 0, 255]);
  });

  it("clamps out-of-range values instead of wrapping or throwing", async () => {
    const raster = {
      width: 1,
      height: 1,
      r: Float32Array.from([1.4]),
      g: Float32Array.from([-0.2]),
      b: Float32Array.from([0.5]),
    };
    const png = await renderTrueColorPng(raster);
    const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([255, 0, 128]);
  });
});

// `decodeTrueColorGeoTiff`'s SCL-based masking is deliberately not re-tested
// here via a real multi-band GeoTIFF encode round trip — geotiff.js's writer
// (test-only tooling, not production code, which only ever *decodes* real
// CDSE-provided multi-band TIFFs) silently drops values on a 3-band FLOAT32
// write. The masking logic itself is byte-for-byte the same pattern as
// `raster.ts`'s `decodeGeoTiff`, covered there by a real round trip
// (`golden.spec.ts`), and confirmed live against the real bug this fixes.
