import { z } from "zod";

export const cropSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120),
});
export type Crop = z.infer<typeof cropSchema>;

/** Slug is derived server-side from `name` (citext-unique per org) — never accepted on write. */
export const createCropSchema = z.object({
  name: z.string().min(1).max(120),
});
export type CreateCrop = z.infer<typeof createCropSchema>;
