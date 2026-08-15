import { z } from "zod";

/**
 * Backs `GET /health` on every app. Was `smoke.ts` — the first schema written
 * to prove the pattern (Zod in `packages/contracts`, imported by both sides)
 * before any domain schema existed. `auth.ts` is now that domain schema; this
 * one stays because health.controller.ts genuinely depends on it.
 */
export const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.enum(["api", "worker", "web"]),
  timestamp: z.string().datetime(),
});

export type Health = z.infer<typeof healthSchema>;
