import type {
  RegenerationClass,
  RegenerationComponentInput,
  RegenerationComponentResult,
  RegenerationScore,
} from "@flora/contracts";

/**
 * TASK-home-dashboard §2.4 — architecture §17 Q2, resolved against
 * published agri-environmental indicators instead of an invented composite.
 * Lives in `packages/db`, not `apps/worker` (deviating from architecture
 * §5.4, corrected by §2.15): the API recomputes on a rollup miss (§2.8), so
 * two callers need this function — the same situation `packages/raster`'s
 * `detect.ts` already resolved for the worker/seed pair.
 *
 * A version bump here must accompany a bump of `REGENERATION_FORMULA_VERSION`
 * so a formula change is visible in stored `farm_scores` rows, not just git.
 */
export const REGENERATION_FORMULA_VERSION = "v1";

/**
 * Only the weights are Flora's own (§2.4) — soil cover is the one principle
 * every regenerative framework agrees on, and the component with the most
 * data behind it.
 */
const REGENERATION_WEIGHTS: Record<RegenerationComponentInput["key"], number> = {
  soilCover: 0.5,
  cropDiversity: 0.25,
  vegetationHealth: 0.25,
};

/** AAFC's own five-class performance-index rating, 0–100 in 20-point bands. */
export function regenerationClassFor(score: number): RegenerationClass {
  if (score < 20) return "at_risk";
  if (score < 40) return "poor";
  if (score < 60) return "moderate";
  if (score < 80) return "good";
  return "desired";
}

/**
 * Missing components (`value: null`) do not become zeros — the remaining
 * weights renormalise so a thin-data farm isn't punished for gaps in
 * observation, not for actual performance (§2.4's honesty rule). A farm with
 * every component missing scores 0 and is labelled `at_risk`, which is the
 * conservative, honest default when there is truly nothing to go on.
 */
export function computeRegenerationScore(components: RegenerationComponentInput[]): RegenerationScore {
  const results: RegenerationComponentResult[] = components.map((c) => ({
    key: c.key,
    weight: REGENERATION_WEIGHTS[c.key],
    value: c.value,
    present: c.value !== null,
  }));

  const presentWeightTotal = results.filter((r) => r.present).reduce((sum, r) => sum + r.weight, 0);

  const score =
    presentWeightTotal === 0
      ? 0
      : results
          .filter((r) => r.present)
          .reduce((sum, r) => sum + (r.value as number) * (r.weight / presentWeightTotal), 0);

  const clamped = Math.min(100, Math.max(0, score));

  return {
    score: clamped,
    class: regenerationClassFor(clamped),
    components: results,
    formulaVersion: REGENERATION_FORMULA_VERSION,
  };
}

/**
 * The dimidiate pixel model (Gutman & Ignatov 1998, linear form — §7
 * decision 3). Carlson & Ripley (1997) square the same ratio; rejected
 * because it drives a partly-covered real field toward 0, which would make a
 * genuinely regenerative farm read "At risk".
 *
 * [VERIFY: NDVI_SOIL/NDVI_VEG are the conventional dimidiate-model endpoints,
 * not per-crop or per-sensor calibrations. Confirm against a Sentinel-2
 * source before shipping — architecture §5.4.]
 */
export const NDVI_SOIL = 0.15;
export const NDVI_VEG = 0.85;

export function fractionalCover(ndvi: number): number {
  return Math.min(1, Math.max(0, (ndvi - NDVI_SOIL) / (NDVI_VEG - NDVI_SOIL)));
}

const SOIL_COVER_WINDOW_DAYS = 365;

/**
 * AAFC's Soil Cover Days, canopy-cover subset only (§2.4's stated
 * limitation — no residue, no snow): trapezoid integration of fractional
 * cover between consecutive farm-level mean-NDVI observations in the
 * trailing 365 days, as `days / 365 × 100`. Fewer than two points in the
 * window is "not enough data", not "0" — `rollups.ts` reads this `null` as
 * the component to renormalise away, never as a real zero.
 */
export function computeSoilCoverDays(series: Array<{ date: string; ndvi: number }>, asOf: string): number | null {
  const windowStart = new Date(asOf);
  windowStart.setUTCDate(windowStart.getUTCDate() - SOIL_COVER_WINDOW_DAYS);

  const inWindow = series
    .filter((p) => new Date(p.date) >= windowStart && new Date(p.date) <= new Date(asOf))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (inWindow.length < 2) {
    return null;
  }

  let scdDays = 0;
  for (let i = 1; i < inWindow.length; i++) {
    const prev = inWindow[i - 1]!;
    const curr = inWindow[i]!;
    const spanDays = (new Date(curr.date).getTime() - new Date(prev.date).getTime()) / (1000 * 60 * 60 * 24);
    const avgFc = (fractionalCover(prev.ndvi) + fractionalCover(curr.ndvi)) / 2;
    scdDays += avgFc * spanDays;
  }

  return Math.min(100, (scdDays / SOIL_COVER_WINDOW_DAYS) * 100);
}

/**
 * Normalised Shannon evenness (§2.4): `H' = -Σ pᵢ ln pᵢ`, `score = H' / ln(S)
 * × 100`. A single crop (`S = 1`) scores 0 honestly rather than dividing by
 * `ln(1) = 0` — no rotation diversity is exactly what that farm has. An
 * empty input (no cycles at all in the window) is "not enough data" (`null`),
 * distinct from the single-crop "0".
 */
export function shannonEvennessScore(areaWeightsByCrop: number[]): number | null {
  const positive = areaWeightsByCrop.filter((w) => w > 0);
  if (positive.length === 0) {
    return null;
  }
  if (positive.length === 1) {
    return 0;
  }
  const total = positive.reduce((sum, w) => sum + w, 0);
  const shannonH = -positive.reduce((sum, w) => {
    const p = w / total;
    return sum + p * Math.log(p);
  }, 0);
  return Math.min(100, (shannonH / Math.log(positive.length)) * 100);
}
