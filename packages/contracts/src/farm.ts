import { z } from "zod";
import { pointSchema } from "./geojson.js";

/** A tenant's farm — `timezone` drives the "farm-local day" growth calculation (architecture §5.3). */
export const farmSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  location: pointSchema,
  timezone: z.string().min(1),
});
export type Farm = z.infer<typeof farmSchema>;
