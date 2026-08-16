import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // The flora_app (non-bypass-RLS) connection — what apps/api and apps/worker use
  // for every query. See packages/db/src/tenancy.ts and TASK-auth-tenancy §2.1.4.
  DATABASE_URL: z.string().url(),
  // The owner connection — used only by packages/db scripts (migrate, generate,
  // studio, seed). Never read by apps/api or apps/worker. Getting DATABASE_URL and
  // this backwards silently disables RLS with no other symptom; the boot assertion
  // in apps/api and apps/worker main.ts is the guard against that class of mistake.
  DATABASE_MIGRATION_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  // Composed with a stored raster key to build the public PNG URL returned
  // by the API — never stored itself, never a signed URL (invariant 2).
  R2_PUBLIC_BASE_URL: z.string().url(),
  NEXT_PUBLIC_MAPBOX_TOKEN: z.string().min(1),
  // Optional (TASK-satellite-pipeline §2.12, §7 decision 4): a blank value
  // used to fail every app's boot, which blocked building TASK-crop-stress
  // off the seed with no CDSE account. Only apps/worker actually reads
  // these — see its own startup warning when they're unset.
  CDSE_CLIENT_ID: z.string().optional(),
  CDSE_CLIENT_SECRET: z.string().optional(),
  // Default false (TASK-satellite-pipeline §2.12): nobody wants a 3am job
  // firing against live CDSE quota from a laptop.
  SATELLITE_SCHEDULE_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  // TASK-home-dashboard §2.9/§2.6 — same "off by default in dev" reasoning
  // as SATELLITE_SCHEDULE_ENABLED, though neither rollups nor Open-Meteo
  // calls have a quota to protect; the default just keeps a laptop quiet.
  ROLLUP_SCHEDULE_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  WEATHER_SCHEDULE_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  // Only apps/weather's fixture tests override this — unset (or blank, as
  // .env.example ships it) in every real environment, where OpenMeteoProvider
  // falls back to the real API. Not `.url()`: an empty string from a copied
  // .env.example must parse as "absent", not fail boot (CDSE_CLIENT_ID's
  // same pattern above).
  OPEN_METEO_BASE_URL: z.string().optional(),
  // HS256 signing key for access + refresh tokens (architecture §10). ≥32 bytes so
  // it carries enough entropy for HMAC-SHA256 — shorter keys are brute-forceable.
  JWT_SIGNING_KEY: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(30 * 24 * 60 * 60),
  WEB_ORIGIN: z.string().url(),
  // apps/web reads this server-side only (never NEXT_PUBLIC_) to know where to
  // proxy /api/v1/* — see apps/web/next.config.ts and TASK-auth-tenancy §7.
  API_URL: z.string().url(),
  API_PORT: z.coerce.number().int().positive().default(3001),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parses `process.env` against {@link envSchema}. Call once at process boot
 * (each app's entrypoint) so a missing or malformed variable fails loudly
 * before anything else runs, instead of surfacing as an undefined-value bug
 * at first use.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
