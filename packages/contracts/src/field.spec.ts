import { describe, expect, it } from "vitest";
import { createFieldSchema, fieldSchema, listFieldsQuerySchema } from "./field.js";
import { multiPolygonSchema } from "./geojson.js";

const SQUARE = {
  type: "MultiPolygon" as const,
  coordinates: [
    [
      [
        [-93.62, 42.03],
        [-93.615, 42.03],
        [-93.615, 42.034],
        [-93.62, 42.034],
        [-93.62, 42.03],
      ],
    ],
  ],
};

describe("createFieldSchema", () => {
  it("accepts a minimal field with no crop cycle", () => {
    const result = createFieldSchema.safeParse({
      farmId: "9c858f6c-2e2f-4a1a-9a8c-9f6c2e2f4a1a",
      name: "Field 1",
      boundary: SQUARE,
    });
    expect(result.success).toBe(true);
  });

  it("does not declare areaM2 or centroid — a client cannot submit them (invariant 3)", () => {
    const shape = createFieldSchema.shape;
    expect(shape).not.toHaveProperty("areaM2");
    expect(shape).not.toHaveProperty("centroid");
  });
});

describe("fieldSchema", () => {
  it("rejects a non-positive areaM2", () => {
    const invalid = { areaM2: 0 };
    expect(fieldSchema.pick({ areaM2: true }).safeParse(invalid).success).toBe(false);
  });
});

describe("multiPolygonSchema vertex ceiling", () => {
  it("accepts a normal boundary", () => {
    expect(multiPolygonSchema.safeParse(SQUARE).success).toBe(true);
  });

  it("rejects a geometry with more than 10,000 positions", () => {
    const hugeRing = Array.from({ length: 10_001 }, (_, i) => [i / 10_001, i / 10_001] as [number, number]);
    hugeRing.push(hugeRing[0]!);
    const huge = { type: "MultiPolygon" as const, coordinates: [[hugeRing]] };
    expect(multiPolygonSchema.safeParse(huge).success).toBe(false);
  });
});

describe("listFieldsQuerySchema", () => {
  it("defaults sort to position and limit to 24", () => {
    const parsed = listFieldsQuerySchema.parse({});
    expect(parsed.sort).toBe("position");
    expect(parsed.limit).toBe(24);
  });

  it("coerces a string limit and clamps to the [1, 100] range in zod", () => {
    expect(listFieldsQuerySchema.parse({ limit: "50" }).limit).toBe(50);
    expect(listFieldsQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(listFieldsQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });
});
