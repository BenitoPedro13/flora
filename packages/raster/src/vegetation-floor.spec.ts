import { describe, expect, it } from "vitest";
import { indexHasVegetationFloor } from "./vegetation-floor.js";

describe("indexHasVegetationFloor", () => {
  it("applies only to genuine canopy-vigor indices", () => {
    for (const index of ["ndvi", "ndre", "evi", "msavi"] as const) {
      expect(indexHasVegetationFloor(index)).toBe(true);
    }
  });

  it("excludes NDMI — found live: a dry field's low readings are real moisture data, not noise", () => {
    expect(indexHasVegetationFloor("ndmi")).toBe(false);
  });

  it("excludes every other non-canopy index", () => {
    for (const index of ["ndwi", "reci", "mcari", "pri_proxy", "vsdi"] as const) {
      expect(indexHasVegetationFloor(index)).toBe(false);
    }
  });

  it("defaults to true (NDVI's own behaviour) when no index is given", () => {
    expect(indexHasVegetationFloor(undefined)).toBe(true);
  });
});
