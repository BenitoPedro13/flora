import { NDVI_RAMP_STOPS, rampDomain, type ObservationStats } from "@flora/contracts";
import sharp from "sharp";
import type { DecodedRaster } from "./raster.js";

/**
 * Stats + pixels → RGBA → PNG (architecture §7.2 step 3b, design-spec §5.3).
 * The ramp is relative by default (`p10` → `p90` of that field on that date)
 * — the screen task's absolute mode relabels this same PNG's legend, it does
 * not re-render (TASK-satellite-pipeline §2.8). `NDVI_RAMP_STOPS` and
 * `rampDomain` live in `@flora/contracts` (TASK-crop-stress §2.3, invariant 7
 * as amended) so the legend under this PNG is built from the exact same
 * stops and domain that painted it. Exact hex stops are a documented
 * default, not verified against the Figma — design-spec D19.
 */

const NON_VEGETATION_FLOOR = 0.1;

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const [RED, YELLOW, GREEN] = NDVI_RAMP_STOPS.map(hexToRgb) as [
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function rampColor(t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  const [c0, c1] = clamped < 0.5 ? [RED, YELLOW] : [YELLOW, GREEN];
  const localT = clamped < 0.5 ? clamped / 0.5 : (clamped - 0.5) / 0.5;
  return [
    Math.round(lerp(c0[0], c1[0], localT)),
    Math.round(lerp(c0[1], c1[1], localT)),
    Math.round(lerp(c0[2], c1[2], localT)),
  ];
}

/**
 * Pixels outside the boundary (`NaN`, from the Process API's clip) and below
 * the 0.10 non-vegetation floor get `alpha 0` — the clipped-to-boundary look
 * `1:35172`'s map shows.
 */
export async function renderRasterPng(raster: DecodedRaster, stats: ObservationStats): Promise<Buffer> {
  const { width, height, indexValues } = raster;
  const rgba = new Uint8Array(width * height * 4);

  // rampDomain falls back to min/max when p10 === p90 — the degenerate case
  // where the stressed population is under detect.ts's ~10% threshold and
  // the percentile domain collapses to a single value even though real
  // variation exists. detect.ts is unaffected; it always compares against
  // p10 directly, never this domain.
  const [lo, hi] = rampDomain(stats);
  const span = hi - lo;

  for (let i = 0; i < indexValues.length; i++) {
    const v = indexValues[i]!;
    const offset = i * 4;
    if (Number.isNaN(v) || v < NON_VEGETATION_FLOOR) {
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
