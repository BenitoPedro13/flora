import { rampDomain, rampStops, type ObservationIndex, type ObservationStats } from "@flora/contracts";
import sharp from "sharp";
import type { DecodedRaster } from "./raster.js";
import { indexHasVegetationFloor, NON_VEGETATION_FLOOR } from "./vegetation-floor.js";

/**
 * Stats + pixels → RGBA → PNG (architecture §7.2 step 3b, design-spec §5.3).
 * The ramp is relative by default (`p10` → `p90` of that field on that date)
 * — the screen task's absolute mode relabels this same PNG's legend, it does
 * not re-render (TASK-satellite-pipeline §2.8). Stops and domain come from
 * `@flora/contracts`'s per-index registry (`TASK-spectral-indices` §2.3) so
 * the legend under this PNG is built from the exact same stops and domain
 * that painted it. Exact hex stops are a documented default, not verified
 * against the Figma — design-spec D19.
 */

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function rampColorFn(stops: readonly [string, string, string]): (t: number) => [number, number, number] {
  const [red, yellow, green] = stops.map(hexToRgb) as [
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
  return (t: number) => {
    const clamped = Math.max(0, Math.min(1, t));
    const [c0, c1] = clamped < 0.5 ? [red, yellow] : [yellow, green];
    const localT = clamped < 0.5 ? clamped / 0.5 : (clamped - 0.5) / 0.5;
    return [
      Math.round(lerp(c0[0], c1[0], localT)),
      Math.round(lerp(c0[1], c1[1], localT)),
      Math.round(lerp(c0[2], c1[2], localT)),
    ];
  };
}

/**
 * Pixels outside the boundary (`NaN`, from the Process API's clip) get alpha
 * 0 always. The 0.10 non-vegetation floor additionally zeroes alpha, but
 * only for the NDVI-shaped ratio indices it was designed for
 * (`vegetation-floor.ts`) — applying "below 0.10 is bare soil" to NDWI would
 * hide the water a wetness layer exists to show, and RECI/MCARI don't share
 * NDVI's 0..1 scale at all. `index` defaults to NDVI's own shape so every
 * pre-existing caller (no index passed) renders bit-for-bit as before
 * (`packages/raster/src/ramp.spec.ts`).
 */
export async function renderRasterPng(
  raster: DecodedRaster,
  stats: ObservationStats,
  index?: ObservationIndex,
): Promise<Buffer> {
  const { width, height, indexValues } = raster;
  const rgba = new Uint8Array(width * height * 4);

  const [lo, hi] = rampDomain(stats, index);
  const span = hi - lo;
  const rampColor = rampColorFn(rampStops(index));
  const applyFloor = indexHasVegetationFloor(index);

  for (let i = 0; i < indexValues.length; i++) {
    const v = indexValues[i]!;
    const offset = i * 4;
    if (Number.isNaN(v) || (applyFloor && v < NON_VEGETATION_FLOOR)) {
      rgba[offset + 3] = 0;
      continue;
    }
    const t = span > 0 ? (v - lo) / span : 0.5;
    const [r, g, b] = rampColor(t);
    rgba[offset] = r;
    rgba[offset + 1] = g;
    rgba[offset + 2] = b;
    rgba[offset + 3] = 255;
  }

  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
