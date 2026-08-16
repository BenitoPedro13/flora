import { describe, expect, it } from "vitest";
import { stressClassificationValues } from "./enums.js";
import { shortZoneId, stressClassificationLabel } from "./stress-zone.js";

describe("stressClassificationLabel", () => {
  it("has a label for every classification value", () => {
    for (const value of stressClassificationValues) {
      expect(typeof stressClassificationLabel(value)).toBe("string");
      expect(stressClassificationLabel(value).length).toBeGreaterThan(0);
    }
  });

  it("title-cases the snake_case value", () => {
    expect(stressClassificationLabel("soil_issue")).toBe("Soil Issue");
    expect(stressClassificationLabel("low_vigor")).toBe("Low Vigor");
  });
});

describe("shortZoneId", () => {
  it("uppercases the uuid's first 8 hex chars as two dash-joined groups", () => {
    expect(shortZoneId("42bb37ac-1234-4abc-9def-0123456789ab")).toBe("42BB-37AC");
  });
});
