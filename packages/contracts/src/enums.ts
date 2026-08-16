import { z } from "zod";

/**
 * The single source of truth for the domain's fixed-vocabulary columns
 * (invariant 4). Each Postgres enum in `packages/db/src/schema/` is built
 * from the matching `*Values` tuple here, not redeclared — see
 * `membershipRoleValues` in ./auth.ts for the precedent this generalises.
 */

export const cropCycleStatusValues = ["planned", "growing", "harvested", "failed"] as const;
export const cropCycleStatusSchema = z.enum(cropCycleStatusValues);
export type CropCycleStatus = z.infer<typeof cropCycleStatusSchema>;

/**
 * `TASK-spectral-indices` §2.2: two overlapping vocabularies, not one. Every
 * `scalarIndexValues` member has a threshold-able number and gets stats,
 * ramp, detection eligibility. `true_color` is a renderable layer with none
 * of that — a 3-band RGB composite, no scalar, no legend — so it's added
 * only to the wider set. Both are still one Postgres enum
 * (`observation_index`, `packages/db/src/schema/observation.ts`): the
 * `(field_id, captured_on, index)` grain doesn't care which subset a value
 * came from, only the application layer does.
 */
export const scalarIndexValues = [
  "ndvi",
  "ndre",
  "ndwi",
  "evi",
  "ndmi",
  "msavi",
  "reci",
  "mcari",
  "pri_proxy",
  "vsdi",
] as const;
export const scalarIndexSchema = z.enum(scalarIndexValues);
export type ScalarIndex = z.infer<typeof scalarIndexSchema>;

export const renderableLayerValues = [...scalarIndexValues, "true_color"] as const;
export const observationIndexValues = renderableLayerValues;
export const observationIndexSchema = z.enum(observationIndexValues);
export type ObservationIndex = z.infer<typeof observationIndexSchema>;

export const stressClassificationValues = [
  "soil_issue",
  "low_vigor",
  "pest",
  "water_stress",
  "unclassified",
] as const;
export const stressClassificationSchema = z.enum(stressClassificationValues);
export type StressClassification = z.infer<typeof stressClassificationSchema>;

export const stressSeverityValues = ["low", "medium", "high"] as const;
export const stressSeveritySchema = z.enum(stressSeverityValues);
export type StressSeverity = z.infer<typeof stressSeveritySchema>;

export const taskStatusValues = ["todo", "in_progress", "done"] as const;
export const taskStatusSchema = z.enum(taskStatusValues);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskActivityValues = [
  "watering",
  "planting",
  "fertilization",
  "pest_control",
  "harvesting",
] as const;
export const taskActivitySchema = z.enum(taskActivityValues);
export type TaskActivity = z.infer<typeof taskActivitySchema>;
