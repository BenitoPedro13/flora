import { z } from "zod";

/**
 * Not a domain contract — proves the pattern (Zod schema in `packages/contracts`,
 * imported by both `apps/api` and `apps/web`) before any real schema exists.
 * Backs `GET /health` on every app. Domain schemas land with their features.
 */
export const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.enum(["api", "worker", "web"]),
  timestamp: z.string().datetime(),
});

export type Health = z.infer<typeof healthSchema>;
