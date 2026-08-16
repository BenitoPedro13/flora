import type { ObservationStats } from "@flora/contracts";
import sharp from "sharp";
import type { DecodedRaster } from "./raster.js";

/**
 * Stats + pixels → RGBA → PNG (architecture §7.2 step 3b, design-spec §5.3).
 * The ramp is relative by default (`p10` → `p90` of that field on that date)
 * — the screen task's absolute mode relabels this same PNG's legend, it does
 * not re-render (TASK-satellite-pipeline §2.8). Exact hex stops are a
 * documented default, not verified against the Figma — design-spec D19.
 */

const NON_VEGETATION_FLOOR = 0.1;

const RED: [number, number, number] = [239, 68, 68]; // low end of the relative domain
const YELLOW: [number, number, number] = [234, 179, 8]; // midpoint
const GREEN: [number, number, number] = [34, 197, 94]; // high end

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
  const domain = stats.p90 - stats.p10;

  for (let i = 0; i < indexValues.length; i++) {
    const v = indexValues[i]!;
    const offset = i * 4;
    if (Number.isNaN(v) || v < NON_VEGETATION_FLOOR) {
      rgba[offset + 3] = 0;
      continue;
    }
    const t = domain > 0 ? (v - stats.p10) / domain : 0.5;
    const [r, g, b] = rampColor(t);
    rgba[offset] = r;
    rgba[offset + 1] = g;
    rgba[offset + 2] = b;
    rgba[offset + 3] = 255;
  }

  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
