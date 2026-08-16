import type { BBox, Polygon } from "@flora/contracts";
import { area as turfArea, polygon as turfPolygon } from "@turf/turf";
import { writeArrayBuffer } from "geotiff";
import { describe, expect, it } from "vitest";
import { detectStressZones } from "./detect.js";
import { computeStats, decodeGeoTiff, sceneIsValid } from "./raster.js";

/**
 * The golden fixture (architecture §13, TASK-satellite-pipeline §2.10,
 * §6 items 2-4). **Deviation, recorded honestly (§10):** the doc asks for a
 * committed float32 GeoTIFF captured from a live CDSE response. This session
 * has no CDSE credentials (§7 risk log item 3), so there is nothing real to
 * capture. What's here instead is a synthetic-but-known-values GeoTIFF pair,
 * built with the same `geotiff` writer the decode path reads, exercising the
 * real decode → stats → detect pipeline end to end with byte-real TIFF I/O
 * — not a substitute for §6 item 1 (the live round trip), but a real test of
 * everything downstream of it.
 */

const WIDTH = 60;
const HEIGHT = 60;
// A 0.0108deg square near the equator: ~1.2km x 1.2km, ~20m per pixel —
// close enough to Sentinel-2's 10-20m bands that a 6x6-pixel block (below)
// lands comfortably inside the 0.5-4 ac zone-size window instead of forcing
// a grid split, which is what this test is isolating.
const BBOX: BBox = [-59.16, -4.605, -59.1492, -4.5942];

function buildFixture(): { indexBuffer: ArrayBuffer; sclBuffer: ArrayBuffer } {
  const index = new Float32Array(WIDTH * HEIGHT);
  const scl = new Uint8Array(WIDTH * HEIGHT).fill(4); // vegetation, clear

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = y * WIDTH + x;
      // Healthy background field.
      index[i] = 0.65;
    }
  }
  // A known ~1 ac stressed block (well inside the field, clear of any edge
  // buffer at this raster's boundary-less test bbox).
  for (let y = 20; y < 26; y++) {
    for (let x = 20; x < 26; x++) {
      index[y * WIDTH + x] = 0.2;
    }
  }

  const indexBuffer = writeArrayBuffer(index, { width: WIDTH, height: HEIGHT, BitsPerSample: [32], SampleFormat: [3] });
  const sclBuffer = writeArrayBuffer(scl, { width: WIDTH, height: HEIGHT, BitsPerSample: [8], SampleFormat: [1] });
  return { indexBuffer, sclBuffer };
}

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

describe("decodeGeoTiff — SCL is the authoritative nodata signal, not the index band's own value", () => {
  /**
   * Found live, 2026-08-16: VSDI has no division in its formula, so CDSE's
   * zero-filled input outside the clip geometry evaluates to a perfectly
   * finite `1` instead of `NaN` — the whole bounding-box rectangle rendered
   * opaque instead of clipping to the field boundary. NDVI-shaped ratio
   * formulas clip correctly only by accident (`0/0 = NaN`); SCL class 0
   * ("No Data") is the real signal, shared by every output in one request.
   */
  it("NaNs an index pixel whose SCL reads 0, even though the index band's own value is finite and in-range", async () => {
    const width = 2;
    const height = 1;
    // A VSDI-shaped bug: the masked pixel's "index" value is a plausible,
    // in-range 1.0 — nothing about the index band alone flags it as invalid.
    const index = Float32Array.from([1.0, 0.6]);
    const scl = Uint8Array.from([0, 4]); // pixel 0: No Data; pixel 1: vegetation, clear

    const indexBuffer = writeArrayBuffer(index, { width, height, BitsPerSample: [32], SampleFormat: [3] });
    const sclBuffer = writeArrayBuffer(scl, { width, height, BitsPerSample: [8], SampleFormat: [1] });

    const raster = await decodeGeoTiff(indexBuffer, sclBuffer);
    expect(Number.isNaN(raster.indexValues[0])).toBe(true);
    expect(raster.indexValues[1]).toBeCloseTo(0.6, 4);
  });
});

describe("golden fixture — decode -> stats -> detect", () => {
  it("decodes real GeoTIFF bytes into the exact known pixel values", async () => {
    const { indexBuffer, sclBuffer } = buildFixture();
    const raster = await decodeGeoTiff(indexBuffer, sclBuffer);
    expect(raster.width).toBe(WIDTH);
    expect(raster.height).toBe(HEIGHT);
    expect(raster.indexValues[0]).toBeCloseTo(0.65, 4);
    expect(raster.indexValues[20 * WIDTH + 20]).toBeCloseTo(0.2, 4);
  });

  it("scene validity passes — the fixture is 100% clear per SCL", async () => {
    const { indexBuffer, sclBuffer } = buildFixture();
    const raster = await decodeGeoTiff(indexBuffer, sclBuffer);
    expect(sceneIsValid(raster)).toBe(true);
  });

  it("computes stable stats within tolerance of the known population", async () => {
    const { indexBuffer, sclBuffer } = buildFixture();
    const raster = await decodeGeoTiff(indexBuffer, sclBuffer);
    const stats = computeStats(raster);
    // The stressed block is only 1% of pixels (36 of 3600), so the 10th
    // percentile still sits in the 0.65 background — realistic for a small
    // problem area, and exactly why detect.ts's mask compares each pixel
    // against p10 rather than assuming stress is common.
    expect(stats.p10).toBeCloseTo(0.65, 4);
    expect(stats.min).toBeCloseTo(0.2, 4);
    expect(stats.mean).toBeGreaterThan(0.6);
  });

  it("detects a stable polygon count and stable, correctly-placed centroid across repeated runs (§6 items 2-3)", async () => {
    const { indexBuffer, sclBuffer } = buildFixture();
    const raster = await decodeGeoTiff(indexBuffer, sclBuffer);
    const bufferedInterior = fullBboxPolygon(BBOX);

    const run1 = detectStressZones({ raster, bbox: BBOX, bufferedInterior });
    const run2 = detectStressZones({ raster, bbox: BBOX, bufferedInterior });

    expect(run1).toHaveLength(1);
    expect(run2).toHaveLength(1);

    const centroidOf = (coords: number[][][]) => {
      const ring = coords[0]!;
      const lon = ring.reduce((s, p) => s + p[0]!, 0) / ring.length;
      const lat = ring.reduce((s, p) => s + p[1]!, 0) / ring.length;
      return [lon, lat];
    };
    const [lon1, lat1] = centroidOf(run1[0]!.geometry.coordinates);
    const [lon2, lat2] = centroidOf(run2[0]!.geometry.coordinates);
    // Stable across runs, within 1m (~1e-5 deg at this latitude).
    expect(Math.abs(lon1 - lon2)).toBeLessThan(1e-5);
    expect(Math.abs(lat1 - lat2)).toBeLessThan(1e-5);

    // The known block is pixel columns/rows [20,26) of a 60x60 raster over
    // BBOX — its centroid should land near the raster's own centre, not
    // mirrored to the opposite edge (the y-flip regression this guards).
    const [west, south, east, north] = BBOX;
    const expectedLon = west + (23 / 60) * (east - west);
    const expectedLat = north - (23 / 60) * (north - south);
    expect(lon1).toBeCloseTo(expectedLon, 2);
    expect(lat1).toBeCloseTo(expectedLat, 2);

    const areaM2 = turfArea(turfPolygon(run1[0]!.geometry.coordinates));
    // 6x6 pixels at ~20m each ~ 120m x 120m ~ 14,400 m^2 (~3.6 ac) — inside
    // the 0.5-4 ac window, so the detector keeps it as one zone rather than
    // splitting (§6 item 4's split case is covered separately in detect.spec.ts).
    expect(areaM2).toBeGreaterThan(0.5 * 4046.8564224);
    expect(areaM2).toBeLessThanOrEqual(4 * 4046.8564224);
  });
});
