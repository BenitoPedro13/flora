import type { ObservationStats } from "./observation.js";

/**
 * The relative NDVI colour ramp's domain and stops — shared by the worker
 * (paints the PNG) and the web app (draws the legend under it), so the two
 * can never compute a different domain for the same observation
 * (TASK-crop-stress §3.1). `packages/raster/src/ramp.ts` imports both of
 * these rather than declaring them; it owns the pixel-encoding logic that
 * consumes them.
 */

/** Red → yellow → green, low end first — Tailwind's red-500/yellow-500/green-500. */
export const NDVI_RAMP_STOPS = ["#EF4444", "#EAB308", "#22C55E"] as const;

/**
 * `p10` → `p90` of that field on that date, falling back to `min` → `max`
 * when the percentile domain collapses (`p10 === p90`, which happens
 * whenever the stressed population is under `detect.ts`'s ~10% threshold —
 * `TASK-satellite-pipeline` §10's flat-ramp bug was this fallback missing).
 */
export function rampDomain(stats: ObservationStats): [number, number] {
  const domain = stats.p90 - stats.p10;
  return domain > 0 ? [stats.p10, stats.p90] : [stats.min, stats.max];
}

function formatRampLabel(value: number): string {
  return value.toFixed(2).replace(/^(-?)0\./, "$1.");
}

/**
 * Six evenly spaced labels top (domain max) to bottom (domain min) —
 * `18:6374`–`16:6379`. Formatted without a leading zero, matching the
 * artboard's `.78 .71 .63 .56 .48 .41`.
 */
export function rampLegendLabels(stats: ObservationStats, count = 6): string[] {
  const [lo, hi] = rampDomain(stats);
  const step = (hi - lo) / (count - 1);
  return Array.from({ length: count }, (_, i) => formatRampLabel(hi - i * step));
}
