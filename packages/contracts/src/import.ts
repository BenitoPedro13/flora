import { z } from "zod";
import { multiPolygonSchema } from "./geojson.js";

/**
 * GeoJSON-only import (§2.1 of TASK-fields — KML/Shapefile split into
 * `TASK-fields-import`). Preview-then-commit: nothing is written until
 * `commit` (architecture §11.5).
 */
export const importFeatureCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      type: z.literal("Feature"),
      properties: z.record(z.string(), z.unknown()).nullable().optional(),
      geometry: z.object({ type: z.string(), coordinates: z.unknown() }),
    }),
  ),
});
export type ImportFeatureCollection = z.infer<typeof importFeatureCollectionSchema>;

export const importPreviewRowSchema = z.object({
  index: z.number().int().nonnegative(),
  name: z.string(),
  boundary: multiPolygonSchema.nullable(),
  areaM2: z.number().nonnegative().nullable(),
  valid: z.boolean(),
  reason: z.string().nullable(),
});
export type ImportPreviewRow = z.infer<typeof importPreviewRowSchema>;

export const importPreviewSchema = z.object({
  rows: z.array(importPreviewRowSchema),
});
export type ImportPreview = z.infer<typeof importPreviewSchema>;

export const importCommitSchema = z.object({
  farmId: z.uuid(),
  rows: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        boundary: multiPolygonSchema,
      }),
    )
    .min(1),
});
export type ImportCommit = z.infer<typeof importCommitSchema>;

export const importCommitResultSchema = z.object({ created: z.number().int().nonnegative() });
export type ImportCommitResult = z.infer<typeof importCommitResultSchema>;
