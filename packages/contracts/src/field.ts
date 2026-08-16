import { z } from "zod";
import { createCropCycleSchema, cropCycleSchema } from "./crop-cycle.js";
import { taskActivitySchema } from "./enums.js";
import { multiPolygonSchema, pointSchema } from "./geojson.js";
import { cursorSchema } from "./pagination.js";

/** Architecture §8.2's corrected shape: `areaM2` and `centroid` are always derived server-side, never accepted on write (invariant 3). */
export const fieldSchema = z.object({
  id: z.uuid(),
  farmId: z.uuid(),
  name: z.string().min(1).max(120),
  boundary: multiPolygonSchema,
  areaM2: z.number().positive(),
  centroid: pointSchema,
  position: z.number(),
  lastRefreshSucceededAt: z.iso.datetime().nullable(),
  lastRefreshError: z.string().nullable(),
});
export type Field = z.infer<typeof fieldSchema>;

/**
 * What the list panel and the field card render. No `boundary` — the map
 * gets geometry from `/fields/geojson` (§2.4), so the list stays light.
 */
export const fieldSummarySchema = fieldSchema.omit({ boundary: true }).extend({
  cropCycle: cropCycleSchema.nullable(),
  activities: z.array(taskActivitySchema),
});
export type FieldSummary = z.infer<typeof fieldSummarySchema>;

export const createFieldSchema = z.object({
  farmId: z.uuid(),
  name: z.string().min(1).max(120),
  boundary: multiPolygonSchema,
  cropCycle: createCropCycleSchema.optional(),
});
export type CreateField = z.infer<typeof createFieldSchema>;

export const updateFieldSchema = createFieldSchema.partial().omit({ farmId: true });
export type UpdateField = z.infer<typeof updateFieldSchema>;

export const fieldSortValues = ["position", "name", "-name", "newest"] as const;
export const fieldSortSchema = z.enum(fieldSortValues);
export type FieldSort = z.infer<typeof fieldSortSchema>;

export const listFieldsQuerySchema = z.object({
  farmId: z.uuid().optional(),
  q: z.string().max(120).optional(),
  cropId: z.uuid().optional(),
  sort: fieldSortSchema.default("position"),
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});
export type ListFieldsQuery = z.infer<typeof listFieldsQuerySchema>;

/** `/fields/geojson` — the map's own endpoint (§2.4); independent of the list's paging. */
export const fieldGeojsonQuerySchema = z.object({
  farmId: z.uuid().optional(),
  bbox: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined) return undefined;
      const parts = v.split(",").map(Number);
      if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
        ctx.addIssue({ code: "custom", message: "bbox must be 'west,south,east,north'" });
        return z.NEVER;
      }
      return parts as [number, number, number, number];
    }),
});
export type FieldGeojsonQuery = z.infer<typeof fieldGeojsonQuerySchema>;

export const fieldFeaturePropertiesSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  centroid: pointSchema,
  areaM2: z.number().positive(),
});

export const fieldFeatureSchema = z.object({
  type: z.literal("Feature"),
  geometry: multiPolygonSchema,
  properties: fieldFeaturePropertiesSchema,
});

export const fieldFeatureCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(fieldFeatureSchema),
});
export type FieldFeatureCollection = z.infer<typeof fieldFeatureCollectionSchema>;
