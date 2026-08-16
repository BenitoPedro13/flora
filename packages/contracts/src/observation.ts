import { z } from "zod";

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
