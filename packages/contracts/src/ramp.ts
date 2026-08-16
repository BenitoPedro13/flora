import type { ObservationIndex } from "./enums.js";
import type { ObservationStats } from "./observation.js";

/**
 * Per-index colour ramp registry (`TASK-spectral-indices` §2.3) — shared by
 * the worker (paints the PNG) and the web app (draws the legend under it),
 * so the two can never compute a different domain for the same observation
 * (`TASK-crop-stress` §3.1). `packages/raster/src/ramp.ts` imports these
 * rather than declaring them; it owns the pixel-encoding logic that consumes
 * them.
 */

/** Red → yellow → green, low end first — Tailwind's red-500/yellow-500/green-500. The "higher is healthier" default. */
export const NDVI_RAMP_STOPS = ["#EF4444", "#EAB308", "#22C55E"] as const;

/**
 * Amber → slate → sky, low end first. NDWI's meaning inverts the health
 * ramp's convention (high = water, not vigor — `TASK-spectral-indices` §2.3):
 * painting it red→yellow→green would read a flooded field as thriving. Dry
 * land at the low end, open water at the high end, a neutral midpoint
 * between.
 */
export const NDWI_RAMP_STOPS = ["#B45309", "#CBD5E1", "#0EA5E9"] as const;

export interface IndexRampConfig {
  stops: readonly [string, string, string];
  /**
   * `"relative"` = that observation's own p10→p90 (falling back to min→max
   * on collapse — see `rampDomain`). A fixed `[min, max]` tuple pins both
   * ends regardless of the observation instead. Every index shipped by
   * `TASK-spectral-indices` uses `"relative"` — RECI and MCARI are unbounded
   * and not sign-symmetric (§1.4), so a fixed domain isn't meaningful for
   * them, and the fixed-domain "plain NDVI" variant the reference menu also
   * lists needs a client-side colour-mapped raster this task doesn't build
   * (§7 decision 1's recorded deviation, §10) — so no index here exercises
   * the fixed-tuple branch yet. It's implemented and tested against future
   * use, not dead code.
   */
  domain: "relative" | readonly [number, number];
  /**
   * Whether a higher value reads as healthier. False only for NDWI — high
   * means water, not vigour — so its legend must not imply "green is good".
   */
  higherIsBetter: boolean;
}

/**
 * One entry per `ScalarIndex` (`packages/contracts/src/enums.ts`). All ten
 * use the relative domain; NDWI is the only one on the water ramp with
 * `higherIsBetter: false`. `true_color` has no scalar value and is
 * deliberately absent — a menu item, not a threshold-able number (§2.2).
 */
export const INDEX_RAMPS: Record<
  Exclude<ObservationIndex, "true_color">,
  IndexRampConfig
> = {
  ndvi: { stops: NDVI_RAMP_STOPS, domain: "relative", higherIsBetter: true },
  ndre: { stops: NDVI_RAMP_STOPS, domain: "relative", higherIsBetter: true },
  ndmi: { stops: NDVI_RAMP_STOPS, domain: "relative", higherIsBetter: true },
  ndwi: { stops: NDWI_RAMP_STOPS, domain: "relative", higherIsBetter: false },
  evi: { stops: NDVI_RAMP_STOPS, domain: "relative", higherIsBetter: true },
  msavi: { stops: NDVI_RAMP_STOPS, domain: "relative", higherIsBetter: true },
  reci: { stops: NDVI_RAMP_STOPS, domain: "relative", higherIsBetter: true },
  mcari: { stops: NDVI_RAMP_STOPS, domain: "relative", higherIsBetter: true },
  pri_proxy: { stops: NDVI_RAMP_STOPS, domain: "relative", higherIsBetter: true },
  vsdi: { stops: NDVI_RAMP_STOPS, domain: "relative", higherIsBetter: true },
};

function rampConfigFor(index: ObservationIndex | undefined): IndexRampConfig {
  if (index === undefined || index === "true_color") {
    return INDEX_RAMPS.ndvi;
  }
  return INDEX_RAMPS[index];
}

/**
 * `p10` → `p90` of that field on that date, falling back to `min` → `max`
 * when the percentile domain collapses (`p10 === p90`, which happens
 * whenever the stressed population is under `detect.ts`'s ~10% threshold —
 * `TASK-satellite-pipeline` §10's flat-ramp bug was this fallback missing).
 * `index` defaults to NDVI's config (every shipped index is `"relative"`
 * today, so the default is behaviourally a no-op — kept so pre-existing
 * callers that never passed one still compile and behave identically).
 */
export function rampDomain(stats: ObservationStats, index?: ObservationIndex): [number, number] {
  const config = rampConfigFor(index);
  if (config.domain !== "relative") {
    return [config.domain[0], config.domain[1]];
  }
  const domain = stats.p90 - stats.p10;
  return domain > 0 ? [stats.p10, stats.p90] : [stats.min, stats.max];
}

/** The stops for `index`'s ramp — NDVI's for every index but NDWI (§2.3). */
export function rampStops(index?: ObservationIndex): readonly [string, string, string] {
  return rampConfigFor(index).stops;
}

/** Whether `index`'s ramp reads "higher is healthier" — false only for NDWI. */
export function rampHigherIsBetter(index?: ObservationIndex): boolean {
  return rampConfigFor(index).higherIsBetter;
}

function formatRampLabel(value: number): string {
  return value.toFixed(2).replace(/^(-?)0\./, "$1.");
}

/**
 * Six evenly spaced labels top (domain max) to bottom (domain min) —
 * `18:6374`–`16:6379`. Formatted without a leading zero, matching the
 * artboard's `.78 .71 .63 .56 .48 .41`.
 */
export function rampLegendLabels(stats: ObservationStats, index?: ObservationIndex, count = 6): string[] {
  const [lo, hi] = rampDomain(stats, index);
  const step = (hi - lo) / (count - 1);
  return Array.from({ length: count }, (_, i) => formatRampLabel(hi - i * step));
}
