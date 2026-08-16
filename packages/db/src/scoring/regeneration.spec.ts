import { describe, expect, it } from "vitest";
import {
  computeRegenerationScore,
  computeSoilCoverDays,
  fractionalCover,
  NDVI_SOIL,
  NDVI_VEG,
  REGENERATION_FORMULA_VERSION,
  regenerationClassFor,
  shannonEvennessScore,
} from "./regeneration.js";

describe("regenerationClassFor — AAFC's five 20-point bands", () => {
  it.each([
    [0, "at_risk"],
    [19.9, "at_risk"],
    [20, "poor"],
    [39.9, "poor"],
    [40, "moderate"],
    [59.9, "moderate"],
    [60, "good"],
    [79.9, "good"],
    [80, "desired"],
    [95, "desired"],
    [100, "desired"],
  ] as const)("%s -> %s", (score, expected) => {
    expect(regenerationClassFor(score)).toBe(expected);
  });
});

describe("fractionalCover — dimidiate pixel model, linear form (Gutman & Ignatov 1998)", () => {
  it("clamps to 0 below the soil endpoint", () => {
    expect(fractionalCover(NDVI_SOIL - 0.1)).toBe(0);
  });

  it("clamps to 1 above the vegetation endpoint", () => {
    expect(fractionalCover(NDVI_VEG + 0.1)).toBe(1);
  });

  it("is linear, not squared — the midpoint is exactly 0.5", () => {
    const midpoint = (NDVI_SOIL + NDVI_VEG) / 2;
    expect(fractionalCover(midpoint)).toBeCloseTo(0.5, 10);
  });
});

describe("computeSoilCoverDays (§6 item 6a)", () => {
  it("a field covered at fc=1.0 for exactly half the trailing year scores 50", () => {
    const asOf = "2026-08-16";
    // windowStart = asOf - 365 days, exactly (no leap day crossed).
    const windowStart = "2025-08-16T00:00:00Z";
    const midpoint = "2026-02-14T12:00:00Z"; // windowStart + 182.5 days
    const series = [
      { date: windowStart, ndvi: NDVI_VEG },
      { date: midpoint, ndvi: NDVI_VEG },
    ];
    expect(computeSoilCoverDays(series, asOf)).toBeCloseTo(50, 6);
  });

  it("returns null with fewer than two observations in the window — not enough data, not zero", () => {
    expect(computeSoilCoverDays([{ date: "2026-08-01", ndvi: NDVI_VEG }], "2026-08-16")).toBeNull();
    expect(computeSoilCoverDays([], "2026-08-16")).toBeNull();
  });

  it("ignores observations outside the trailing 365-day window", () => {
    const asOf = "2026-08-16";
    const series = [
      { date: "2020-01-01", ndvi: NDVI_VEG }, // far outside the window
      { date: "2026-08-10", ndvi: NDVI_SOIL }, // only one point inside the window
    ];
    expect(computeSoilCoverDays(series, asOf)).toBeNull();
  });
});

describe("shannonEvennessScore (§6 item 6a)", () => {
  it("a single-crop farm scores 0 — no rotation diversity, not a divide-by-zero", () => {
    expect(shannonEvennessScore([100])).toBe(0);
  });

  it("two equal-area crops score 100 (H'/ln(2) = 1)", () => {
    expect(shannonEvennessScore([50, 50])).toBeCloseTo(100, 10);
  });

  it("returns null for no crop cycles at all — not enough data", () => {
    expect(shannonEvennessScore([])).toBeNull();
  });

  it("uneven areas score between 0 and 100", () => {
    const score = shannonEvennessScore([90, 10]);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });
});

describe("computeRegenerationScore", () => {
  it("weights soil cover 0.50, crop diversity 0.25, vegetation health 0.25 when all three are present", () => {
    const result = computeRegenerationScore([
      { key: "soilCover", value: 100 },
      { key: "cropDiversity", value: 0 },
      { key: "vegetationHealth", value: 0 },
    ]);
    expect(result.score).toBeCloseTo(50, 10);
    expect(result.formulaVersion).toBe(REGENERATION_FORMULA_VERSION);
    expect(result.components.every((c) => c.present)).toBe(true);
  });

  it("renormalises remaining weights when a component is missing, instead of scoring it 0", () => {
    // vegetationHealth missing: soilCover (0.50) and cropDiversity (0.25)
    // renormalise to 2/3 and 1/3 of the total.
    const result = computeRegenerationScore([
      { key: "soilCover", value: 90 },
      { key: "cropDiversity", value: 60 },
      { key: "vegetationHealth", value: null },
    ]);
    const expected = 90 * (0.5 / 0.75) + 60 * (0.25 / 0.75);
    expect(result.score).toBeCloseTo(expected, 10);
    expect(result.components.find((c) => c.key === "vegetationHealth")?.present).toBe(false);
  });

  it("scores 0 and lands at_risk when every component is missing — the conservative, honest default", () => {
    const result = computeRegenerationScore([
      { key: "soilCover", value: null },
      { key: "cropDiversity", value: null },
      { key: "vegetationHealth", value: null },
    ]);
    expect(result.score).toBe(0);
    expect(result.class).toBe("at_risk");
  });

  it("clamps into 0–100 and assigns the AAFC class from the computed score", () => {
    const result = computeRegenerationScore([
      { key: "soilCover", value: 95 },
      { key: "cropDiversity", value: 95 },
      { key: "vegetationHealth", value: 95 },
    ]);
    expect(result.score).toBeCloseTo(95, 10);
    expect(result.class).toBe("desired");
  });
});
