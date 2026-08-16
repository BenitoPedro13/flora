import { z } from "zod";
import { observationIndexSchema } from "./enums.js";

/**
 * The JSONB payload shapes stored on `observations` (architecture §5.3).
 * JSONB rather than columns so a new statistic doesn't need a migration —
 * but that's not licence to store an unvalidated shape, so both round-trip
 * through these schemas on write.
 */

export const observationStatsSchema = z.object({
  min: z.number(),
  max: z.number(),
  mean: z.number(),
  stddev: z.number(),
  p10: z.number(),
  p90: z.number(),
});
export type ObservationStats = z.infer<typeof observationStatsSchema>;

/** [west, south, east, north] — the raster's geographic extent (§9.5). */
export const bboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export type BBox = z.infer<typeof bboxSchema>;

/**
 * `GET /fields/:id/observations` response row (TASK-satellite-pipeline §2.6).
 * `rasterUrl` is composed from the stored R2 key at read time and is never
 * itself persisted (invariant 2) — `apps/api/src/observations/raster-url.ts`
 * is the one place that concatenation happens.
 */
export const observationSchema = z.object({
  fieldId: z.uuid(),
  capturedOn: z.iso.date(),
  index: observationIndexSchema,
  stats: observationStatsSchema,
  bbox: bboxSchema,
  rasterUrl: z.url(),
  sceneId: z.string(),
});
export type Observation = z.infer<typeof observationSchema>;

/** The Crop Stress date picker's feed — `captured_on` only, no stats, no key. */
export const observationDatesSchema = z.array(z.iso.date());
export type ObservationDates = z.infer<typeof observationDatesSchema>;

export const listObservationsQuerySchema = z.object({
  index: observationIndexSchema.default("ndvi"),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type ListObservationsQuery = z.infer<typeof listObservationsQuerySchema>;

export const listObservationDatesQuerySchema = z.object({
  index: observationIndexSchema.default("ndvi"),
});
export type ListObservationDatesQuery = z.infer<typeof listObservationDatesQuerySchema>;

/**
 * `POST /fields/:id/observations/refresh`'s response. **202**, not 200 — the
 * job runs in the worker, never on this request (invariant 1). `jobId` is
 * BullMQ's job id, opaque to the caller; the screen task polls with it.
 */
export const refreshAcceptedSchema = z.object({ jobId: z.string() });
export type RefreshAccepted = z.infer<typeof refreshAcceptedSchema>;
