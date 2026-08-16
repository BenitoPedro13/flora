import { describe, expect, it } from "vitest";
import type { ObservationStats } from "./observation.js";
import { NDVI_RAMP_STOPS, rampDomain, rampLegendLabels } from "./ramp.js";

const STATS: ObservationStats = { min: 0.2, max: 0.8, mean: 0.5, stddev: 0.15, p10: 0.41, p90: 0.78 };

describe("rampDomain", () => {
  it("uses p10/p90 when they differ", () => {
    expect(rampDomain(STATS)).toEqual([0.41, 0.78]);
  });

  it("falls back to min/max when p10 === p90 (a small stressed minority collapses the percentile domain)", () => {
    const degenerate: ObservationStats = { min: 0.2, max: 0.6, mean: 0.5, stddev: 0.1, p10: 0.6, p90: 0.6 };
    expect(rampDomain(degenerate)).toEqual([0.2, 0.6]);
  });
});

describe("rampLegendLabels", () => {
  it("returns six labels, top = domain max, formatted without a leading zero", () => {
    expect(rampLegendLabels(STATS)).toEqual([".78", ".71", ".63", ".56", ".48", ".41"]);
  });

  it("respects a custom count, keeping top and bottom at the domain's max and min", () => {
    const labels = rampLegendLabels(STATS, 3);
    expect(labels).toHaveLength(3);
    expect(labels[0]).toBe(".78");
    expect(labels[2]).toBe(".41");
  });
});

describe("NDVI_RAMP_STOPS", () => {
  it("is three hex colours, low to high", () => {
    expect(NDVI_RAMP_STOPS).toHaveLength(3);
    for (const stop of NDVI_RAMP_STOPS) {
      expect(stop).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
