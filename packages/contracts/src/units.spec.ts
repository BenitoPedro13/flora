import { describe, expect, it } from "vitest";
import {
  formatAcres,
  formatTonnes,
  kilogramsToTonnes,
  KILOGRAMS_PER_TONNE,
  squareMetresToAcres,
  SQUARE_METRES_PER_ACRE,
} from "./units.js";

describe("units", () => {
  it("SQUARE_METRES_PER_ACRE is exact", () => {
    expect(SQUARE_METRES_PER_ACRE).toBe(4840 * 0.9144 ** 2);
  });

  it("a 1-acre polygon's ST_Area in m² formats to 1.0 ac", () => {
    expect(formatAcres(SQUARE_METRES_PER_ACRE)).toBe("1.0 ac");
  });

  it("formats the design's stress total", () => {
    expect(formatAcres(97_530)).toBe("24.1 ac");
  });

  it("formats the design's field-card quantity", () => {
    expect(formatTonnes(1_900)).toBe("1.9 T");
  });

  it("converts round numbers exactly", () => {
    expect(squareMetresToAcres(SQUARE_METRES_PER_ACRE)).toBe(1);
    expect(kilogramsToTonnes(KILOGRAMS_PER_TONNE)).toBe(1);
  });
});
