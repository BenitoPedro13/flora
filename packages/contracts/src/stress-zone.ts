import { z } from "zod";
import { stressClassificationSchema, stressSeveritySchema } from "./enums.js";
import type { StressClassification } from "./enums.js";
import { polygonSchema } from "./geojson.js";

/**
 * `stress_zones` API shape (TASK-satellite-pipeline §2.6, architecture §7.5).
 * `areaM2` is derived via `ST_Area` at read time, never stored (invariant 3,
 * same rule as `fields.areaM2`). `isNew` is computed as
 * `detected_on > current_date - 7`, not persisted.
 */
export const stressZoneSchema = z.object({
  id: z.uuid(),
  fieldId: z.uuid(),
  geometry: polygonSchema,
  areaM2: z.number().positive(),
  detectedOn: z.iso.date(),
  windowStart: z.iso.date(),
  windowEnd: z.iso.date(),
  classification: stressClassificationSchema,
  severity: stressSeveritySchema,
  indexValue: z.number(),
  isNew: z.boolean(),
  mutedAt: z.iso.datetime().nullable(),
});
export type StressZone = z.infer<typeof stressZoneSchema>;

export const stressZoneSortValues = ["priority", "newest", "area"] as const;
export const stressZoneSortSchema = z.enum(stressZoneSortValues);
export type StressZoneSort = z.infer<typeof stressZoneSortSchema>;

export const listStressZonesQuerySchema = z.object({
  sort: stressZoneSortSchema.default("priority"),
});
export type ListStressZonesQuery = z.infer<typeof listStressZonesQuerySchema>;

/** `PATCH /stress-zones/:id` — at least one of `classification` or `muted` must be present. */
export const updateStressZoneSchema = z
  .object({
    classification: stressClassificationSchema.optional(),
    muted: z.boolean().optional(),
  })
  .refine((v) => v.classification !== undefined || v.muted !== undefined, {
    message: "At least one of classification or muted must be provided",
  });
export type UpdateStressZone = z.infer<typeof updateStressZoneSchema>;

/**
 * The Crop Stress list's group heading (`18:7051`) and a row's classification
 * dropdown read the same value, so they're built from one map — a
 * `satisfies Record<...>` makes a new enum value a build failure, not a
 * silent runtime gap (TASK-crop-stress §2.14).
 */
const STRESS_CLASSIFICATION_LABELS = {
  soil_issue: "Soil Issue",
  low_vigor: "Low Vigor",
  pest: "Pest",
  water_stress: "Water Stress",
  unclassified: "Unclassified",
} satisfies Record<StressClassification, string>;

export function stressClassificationLabel(c: StressClassification): string {
  return STRESS_CLASSIFICATION_LABELS[c];
}

/** `16:6316` — the popover's short id, e.g. `"42BB-37AC"` from a uuid's first 8 hex chars. */
export function shortZoneId(id: string): string {
  return `${id.slice(0, 4).toUpperCase()}-${id.slice(4, 8).toUpperCase()}`;
}
