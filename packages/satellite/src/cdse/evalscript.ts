import type { ScalarIndex } from "@flora/contracts";
import { scalarIndexValues } from "@flora/contracts";

/**
 * `TASK-spectral-indices` §2.1: what was "one evalscript per index" is now
 * one evalscript that can emit *every* scheduled index in a single Process
 * call — `evalscriptForAll` — because CDSE's own `x-processingunits-spent`
 * header proved output count is free (§1.3: an 11-output request costs
 * exactly what a 2-output request with the same input bands costs, to the
 * last decimal). `evalscriptFor` (single-index) is kept for the on-demand
 * "just this one layer" path. `evalscriptForTrueColor` is its own function,
 * not a member of the scalar-index set at all — a 3-band RGB composite has
 * no scalar formula and isn't part of the bulk call (§1.4, §2.5).
 *
 * `//VERSION=3` and the `setup()`/`evaluatePixel(samples)` signature
 * confirmed against Sentinel Hub's evalscript v3 docs (unchanged from
 * `TASK-satellite-pipeline` §2.2). `Math.sqrt`/`Math.pow` (MSAVI2, below)
 * compile under evalscript V3 — run against the live account while planning
 * this task (§2.1).
 */

/**
 * One formula per `ScalarIndex`, all reflectance-ratio arithmetic on the
 * same evalscript V3 float sample set `evalscriptFor`'s NDVI/EVI formulas
 * already assumed reflectance (0..1), not raw DN — Sentinel Hub's default
 * evalscript V3 sample units are reflectance floats unless `units: "DN"` is
 * set, and this evalscript never sets it. Sources for the six new formulas
 * (§1.4, §7 decisions 4-5):
 *
 * - `ndmi`: McFeeters-style NDVI-shaped moisture ratio on NIR/SWIR (B08/B11).
 * - `msavi`: MSAVI2 (Qi et al. 1994), the self-adjusting form that needs no
 *   soil-line calibration factor.
 * - `reci`: red-edge chlorophyll index (Gitelson et al.), NIR/red-edge ratio
 *   minus one.
 * - `mcari`: Modified Chlorophyll Absorption Ratio Index (Daughtry et al.
 *   2000), red-edge/red/green.
 * - `pri_proxy`: true PRI is `(R531-R570)/(R531+R570)` and Sentinel-2 has
 *   neither band. Blue/green substitution (B02≈490nm for 531nm, B03≈560nm
 *   for 570nm) — published use in CO₂-flux work adapted to Sentinel-2 and
 *   PlanetScope, with authors explicitly noting the trade-off against
 *   hyperspectral (§7 decision 4). Never surfaced to a user as bare "PRI".
 * - `vsdi`: Zhang et al. 2013, `1 - [(SWIR-Blue) + (Red-Blue)]` on
 *   B11/B04/B02 (§7 decision 5).
 */
const SCALAR_INDEX_FORMULAS: Record<ScalarIndex, string> = {
  ndvi: "(s.B08 - s.B04) / (s.B08 + s.B04)",
  ndre: "(s.B08 - s.B05) / (s.B08 + s.B05)",
  // McFeeters' NDWI (green/NIR) — the surface-water formulation, not the
  // SWIR-based vegetation-moisture variant (architecture doesn't
  // distinguish; this is the more common default for "ndwi" by name).
  ndwi: "(s.B03 - s.B08) / (s.B03 + s.B08)",
  evi: "2.5 * (s.B08 - s.B04) / (s.B08 + 6 * s.B04 - 7.5 * s.B02 + 1)",
  ndmi: "(s.B08 - s.B11) / (s.B08 + s.B11)",
  msavi: "(2 * s.B08 + 1 - Math.sqrt(Math.pow(2 * s.B08 + 1, 2) - 8 * (s.B08 - s.B04))) / 2",
  reci: "(s.B08 / s.B05) - 1",
  mcari: "((s.B05 - s.B04) - 0.2 * (s.B05 - s.B03)) * (s.B05 / s.B04)",
  pri_proxy: "(s.B02 - s.B03) / (s.B02 + s.B03)",
  vsdi: "1 - ((s.B11 - s.B02) + (s.B04 - s.B02))",
};

function formulaFor(index: ScalarIndex): string {
  return SCALAR_INDEX_FORMULAS[index];
}

/**
 * `B11` is the only band this task adds to the input list — 20m SWIR, needed
 * by `ndmi` and `vsdi`. **Not `B12`** (§7 decision 7): resolving `vsdi`
 * settled that its SWIR term is 1565-1655nm = B11, not B12's 2190nm, and
 * nothing else on the list needs it — adding it anyway would push NFR-6's PU
 * budget from a passing 56% to an alerting 64% (§1.3) for zero features.
 */
const EVALSCRIPT_INPUT_BANDS = ["B02", "B03", "B04", "B05", "B08", "B11", "SCL"];
/** The single-index path's input list stays exactly what it was — no B11 unless `index` itself needs it. */
function inputBandsFor(index: ScalarIndex): string[] {
  const needsB11 = index === "ndmi" || index === "vsdi";
  return needsB11
    ? ["B02", "B03", "B04", "B05", "B08", "B11", "SCL"]
    : ["B02", "B03", "B04", "B05", "B08", "SCL"];
}

/** Single-index request — the on-demand/manual-refresh-of-one-layer path (§2.1). */
export function evalscriptFor(index: ScalarIndex): string {
  const formula = formulaFor(index);
  return `//VERSION=3
function setup() {
  return {
    input: [{ bands: ${JSON.stringify(inputBandsFor(index))} }],
    output: [
      { id: "index", bands: 1, sampleType: "FLOAT32" },
      { id: "scl", bands: 1, sampleType: "UINT8" }
    ]
  };
}

function evaluatePixel(s) {
  let indexValue = ${formula};
  return {
    index: [indexValue],
    scl: [s.SCL]
  };
}
`;
}

/**
 * True-colour RGB composite — a real 3-band branch (§1.4's "needs a real
 * 3-band branch", built as a `TASK-spectral-indices` follow-on the same day,
 * 2026-08-16), not the mean-brightness placeholder this function replaced.
 * `2.5 * B04/B03/B02`, clamped to 1, is Sentinel Hub's own canonical
 * "true color" custom script for Sentinel-2 L2A — the standard gain-stretch
 * every Sentinel Hub true-colour tutorial and example repository ships, not
 * a value picked here. One 3-band FLOAT32 output (not UINT8): every other
 * output in this evalscript file is FLOAT32, and scaling reflectance to
 * displayable bytes is `packages/raster/src/true-color.ts`'s job, not this
 * request's — keeping that conversion in one place already trusted with
 * pixel math, not duplicated into an assumption about how CDSE's own UINT8
 * output scaling behaves.
 *
 * **`scl` is requested even though true-colour has no stats/detection
 * built on it** — found live, same day: the RGB formula has no division, so
 * outside the clip geometry it evaluates to a perfectly finite `(0,0,0)`
 * (black) instead of `NaN`, the identical bug VSDI hit (`raster.ts`'s
 * `decodeGeoTiff` doc comment). SCL class 0 is the only reliable nodata
 * signal here, exactly as for every scalar index.
 */
export function evalscriptForTrueColor(): string {
  return `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02", "B03", "B04", "SCL"] }],
    output: [
      { id: "true_color", bands: 3, sampleType: "FLOAT32" },
      { id: "scl", bands: 1, sampleType: "UINT8" }
    ]
  };
}

function evaluatePixel(s) {
  return {
    true_color: [
      Math.min(1, 2.5 * s.B04),
      Math.min(1, 2.5 * s.B03),
      Math.min(1, 2.5 * s.B02)
    ],
    scl: [s.SCL]
  };
}
`;
}

/**
 * One request, every scalar index (§2.1, §7 decision 6: all ten, daily).
 * `scalarIndexValues` order is the output order — `process.ts` extracts TAR
 * members by name, not position, so this order isn't itself load-bearing,
 * only stable enough to read back against.
 */
export function evalscriptForAll(indices: readonly ScalarIndex[] = scalarIndexValues): string {
  const outputs = indices
    .map((index) => `      { id: ${JSON.stringify(index)}, bands: 1, sampleType: "FLOAT32" }`)
    .join(",\n");
  const assignments = indices
    .map((index) => `    ${JSON.stringify(index)}: [${formulaFor(index)}]`)
    .join(",\n");

  return `//VERSION=3
function setup() {
  return {
    input: [{ bands: ${JSON.stringify(EVALSCRIPT_INPUT_BANDS)} }],
    output: [
${outputs},
      { id: "scl", bands: 1, sampleType: "UINT8" }
    ]
  };
}

function evaluatePixel(s) {
  return {
${assignments},
    scl: [s.SCL]
  };
}
`;
}
