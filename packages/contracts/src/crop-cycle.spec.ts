import { describe, expect, it } from "vitest";
import { createCropCycleSchema } from "./crop-cycle.js";

describe("createCropCycleSchema", () => {
  const base = {
    cropId: "9c858f6c-2e2f-4a1a-9a8c-9f6c2e2f4a1a",
    plantedOn: "2026-01-01",
    expectedHarvestOn: "2026-06-01",
    status: "planned" as const,
    quantityKg: null,
  };

  it("accepts a valid cycle", () => {
    expect(createCropCycleSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an expected harvest date before the planted date", () => {
    const result = createCropCycleSchema.safeParse({
      ...base,
      expectedHarvestOn: "2025-12-31",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.path).toEqual(["expectedHarvestOn"]);
    }
  });

  it("accepts an expected harvest date equal to the planted date", () => {
    expect(createCropCycleSchema.safeParse({ ...base, expectedHarvestOn: base.plantedOn }).success).toBe(true);
  });
});
