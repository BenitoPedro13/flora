import { z } from "zod";
import { cropCycleStatusSchema } from "./enums.js";

/**
 * `growthPct` is derived in SQL from `plantedOn`/`expectedHarvestOn` against
 * the farm's local date (architecture §17 Q10, resolved *derived* — see
 * `packages/db/src/queries/fields.ts`) — never stored, never accepted on write.
 */
export const cropCycleSchema = z.object({
  id: z.uuid(),
  cropId: z.uuid(),
  cropName: z.string(),
  plantedOn: z.iso.date(),
  expectedHarvestOn: z.iso.date(),
  status: cropCycleStatusSchema,
  quantityKg: z.number().nonnegative().nullable(),
  growthPct: z.number().int().min(0).max(100),
});
export type CropCycle = z.infer<typeof cropCycleSchema>;

export const createCropCycleSchema = cropCycleSchema
  .omit({ id: true, cropName: true, growthPct: true })
  .refine((c) => c.expectedHarvestOn >= c.plantedOn, {
    path: ["expectedHarvestOn"],
    message: "Expected harvest date must be on or after the planted date",
  });
export type CreateCropCycle = z.infer<typeof createCropCycleSchema>;

export const updateCropCycleSchema = z.object({
  cropId: z.uuid().optional(),
  plantedOn: z.iso.date().optional(),
  expectedHarvestOn: z.iso.date().optional(),
  status: cropCycleStatusSchema.optional(),
  quantityKg: z.number().nonnegative().nullable().optional(),
});
export type UpdateCropCycle = z.infer<typeof updateCropCycleSchema>;
