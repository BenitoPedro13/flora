import type { ObservationIndex } from "@flora/contracts";

/**
 * One evalscript per `ObservationIndex`, plus the SCL band, in every request
 * (`TASK-satellite-pipeline` §2.2). `//VERSION=3` and the `setup()`/
 * `evaluatePixel(samples)` signature confirmed against Sentinel Hub's
 * evalscript v3 docs. Two named outputs — `index` (FLOAT32) and `scl`
 * (UINT8) — declared in `setup()`'s `output` array; `evaluatePixel` returns
 * one key per output id, both from the same input sample set, one request,
 * one PU charge.
 */

const INDEX_FORMULAS: Record<ObservationIndex, string> = {
  ndvi: "(s.B08 - s.B04) / (s.B08 + s.B04)",
  ndre: "(s.B08 - s.B05) / (s.B08 + s.B05)",
  // McFeeters' NDWI (green/NIR) — the surface-water formulation, not the
  // SWIR-based vegetation-moisture variant (architecture doesn't
  // distinguish; this is the more common default for "ndwi" by name).
  ndwi: "(s.B03 - s.B08) / (s.B03 + s.B08)",
  evi: "2.5 * (s.B08 - s.B04) / (s.B08 + 6 * s.B04 - 7.5 * s.B02 + 1)",
  // Not a real single-band "index" — true_color is an RGB composite with no
  // natural scalar. Mean reflectance as a placeholder brightness value: not
  // scheduled (architecture §5.5 excludes it from the daily refresh) and no
  // code path in this task calls it. A real true-color pipeline (a 3-band
  // PNG, no stats/detection) is out of scope here, not invented.
  true_color: "(s.B04 + s.B03 + s.B02) / 3",
};

export function evalscriptFor(index: ObservationIndex): string {
  const formula = INDEX_FORMULAS[index];
  return `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02", "B03", "B04", "B05", "B08", "SCL"] }],
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
