import { scalarIndexValues, type ScalarIndex } from "@flora/contracts";
import { describe, expect, it } from "vitest";
import { evalscriptFor, evalscriptForAll, evalscriptForTrueColor } from "./evalscript.js";

/**
 * Golden-value coverage per formula (`CLAUDE.md`'s Tests section,
 * `TASK-spectral-indices` §2.7) — not a full GeoTIFF round trip (that's
 * `packages/raster/src/golden.spec.ts`'s job for the decode→stats→detect
 * path, unchanged by this task), but exact algebra on hand-picked
 * reflectance values, run against the *exact string* this evalscript emits
 * so a sign or operator typo fails here, not silently in production.
 */

function extractFormula(script: string, outputId: string): string {
  const match = script.match(new RegExp(`"${outputId}":\\s*\\[(.+?)\\]`));
  if (!match) {
    throw new Error(`No "${outputId}" assignment found in generated evalscript`);
  }
  return match[1]!;
}

function evalFormula(formula: string, bands: Record<string, number>): number {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- evaluating the exact evalscript-formula string against known band values, not arbitrary input
  return new Function("s", `return ${formula};`)(bands) as number;
}

interface Case {
  index: ScalarIndex;
  bands: Record<string, number>;
  expected: number;
}

const CASES: Case[] = [
  { index: "ndvi", bands: { B08: 0.5, B04: 0.2 }, expected: 0.3 / 0.7 },
  { index: "ndre", bands: { B08: 0.5, B05: 0.3 }, expected: 0.25 },
  { index: "ndwi", bands: { B03: 0.3, B08: 0.5 }, expected: -0.25 },
  { index: "evi", bands: { B08: 0.5, B04: 0.2, B02: 0.1 }, expected: (2.5 * 0.3) / 1.95 },
  { index: "ndmi", bands: { B08: 0.5, B11: 0.3 }, expected: 0.25 },
  { index: "msavi", bands: { B08: 0.6, B04: 0.2 }, expected: (2.2 - Math.sqrt(2.2 ** 2 - 8 * 0.4)) / 2 },
  { index: "reci", bands: { B08: 0.6, B05: 0.3 }, expected: 1 },
  { index: "mcari", bands: { B05: 0.3, B04: 0.2, B03: 0.25 }, expected: 0.135 },
  { index: "pri_proxy", bands: { B02: 0.1, B03: 0.15 }, expected: -0.2 },
  { index: "vsdi", bands: { B11: 0.3, B02: 0.1, B04: 0.2 }, expected: 0.7 },
];

describe("evalscriptForAll — per-index formula golden values", () => {
  const script = evalscriptForAll(scalarIndexValues);

  it.each(CASES)("$index matches its hand-computed value", ({ index, bands, expected }) => {
    const formula = extractFormula(script, index);
    expect(evalFormula(formula, bands)).toBeCloseTo(expected, 6);
  });

  it("declares one FLOAT32 output per scalar index plus scl", () => {
    for (const index of scalarIndexValues) {
      expect(script).toContain(`"${index}"`);
    }
    expect(script).toContain('{ id: "scl", bands: 1, sampleType: "UINT8" }');
  });

  it("adds B11 to the input band list and nothing else beyond the pre-existing set (§7 decision 7: no B12)", () => {
    expect(script).toContain('input: [{ bands: ["B02","B03","B04","B05","B08","B11","SCL"] }]');
    expect(script).not.toContain("B12");
  });
});

describe("evalscriptFor — single-index path (§2.1, §2.5)", () => {
  it("matches evalscriptForAll's formula for the same index", () => {
    for (const index of scalarIndexValues) {
      const single = evalscriptFor(index);
      const singleFormula = single.match(/let indexValue = (.+?);/)?.[1];
      const allFormula = extractFormula(evalscriptForAll(scalarIndexValues), index);
      expect(singleFormula).toBe(allFormula);
    }
  });

  it("only requests B11 for indices that need it, not for every index", () => {
    expect(evalscriptFor("ndvi")).toContain('bands: ["B02","B03","B04","B05","B08","SCL"]');
    expect(evalscriptFor("ndmi")).toContain('bands: ["B02","B03","B04","B05","B08","B11","SCL"]');
    expect(evalscriptFor("vsdi")).toContain('bands: ["B02","B03","B04","B05","B08","B11","SCL"]');
  });
});

describe("evalscriptForTrueColor — the on-demand 3-band RGB path (§2.5, built as a same-day follow-on)", () => {
  it("requests B02/B03/B04/SCL and both a 3-band FLOAT32 output and scl", () => {
    // scl is requested even for true-colour: found live, the RGB formula has no division, so it
    // can't fall back on 0/0 = NaN to signal "outside the clip geometry" the way every scalar
    // index does (raster.ts's decodeGeoTiff doc comment has the full story).
    const script = evalscriptForTrueColor();
    expect(script).toContain('input: [{ bands: ["B02", "B03", "B04", "SCL"] }]');
    expect(script).toContain('{ id: "true_color", bands: 3, sampleType: "FLOAT32" }');
    expect(script).toContain('{ id: "scl", bands: 1, sampleType: "UINT8" }');
  });

  it("applies Sentinel Hub's canonical 2.5x true-colour gain, clamped to 1, and passes SCL through", () => {
    const script = evalscriptForTrueColor();
    const evaluate = new Function(
      "s",
      `${script.slice(script.indexOf("function evaluatePixel"))}\nreturn evaluatePixel(s);`,
      // eslint-disable-next-line @typescript-eslint/no-implied-eval -- evaluating the exact evalscript-emitted function against known band values
    );
    expect(evaluate({ B02: 0.1, B03: 0.2, B04: 0.3, SCL: 4 })).toEqual({ true_color: [0.75, 0.5, 0.25], scl: [4] });
    // A bright pixel clamps at 1 rather than overflowing past white.
    expect(evaluate({ B02: 0.9, B03: 0.9, B04: 0.9, SCL: 4 })).toEqual({ true_color: [1, 1, 1], scl: [4] });
  });
});
