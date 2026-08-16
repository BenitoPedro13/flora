import { z } from "zod";
import { stressClassificationSchema, stressSeveritySchema } from "./enums.js";
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
