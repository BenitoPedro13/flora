import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { createDbClient } from "./client.js";
import { memberships, organizations, users } from "./schema/auth.js";

/**
 * Same argon2id cost parameters as apps/api/src/auth/password.service.ts —
 * `[VERIFY: check the OWASP Password Storage Cheat Sheet at implementation
 * time and use its current argon2id figures rather than these]`
 * (TASK-auth-tenancy §2.3).
 */
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

const SEED_EMAIL = "owner@flora.local";
const SEED_PASSWORD = "flora-dev-owner-password";
const SEED_ORG_NAME = "Flora Farm";
const SEED_ORG_SLUG = "flora-farm";

/**
 * Creates the first organization and owner (TASK-auth-tenancy §5 — no
 * self-serve signup exists yet). Idempotent: does nothing if the seed user
 * already exists. Runs as the owner role (DATABASE_MIGRATION_URL), the way a
 * migration or admin tool would, not through the API.
 */
async function main() {
  const databaseUrl = process.env.DATABASE_MIGRATION_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_MIGRATION_URL is not set");
  }

  const { db, pool } = createDbClient(databaseUrl);
  try {
    const [existing] = await db.select().from(users).where(eq(users.email, SEED_EMAIL)).limit(1);
    if (existing) {
      console.log(`Seed user already exists: ${SEED_EMAIL}`);
      return;
    }

    const passwordHash = await hash(SEED_PASSWORD, ARGON2_OPTIONS);
    const [org] = await db
      .insert(organizations)
      .values({ name: SEED_ORG_NAME, slug: SEED_ORG_SLUG })
      .returning();
    const [user] = await db
      .insert(users)
      .values({ email: SEED_EMAIL, passwordHash, name: "Flora Owner" })
      .returning();
    await db.insert(memberships).values({ organizationId: org!.id, userId: user!.id, role: "owner" });

    console.log("Seeded the first organization and owner:");
    console.log(`  organization: ${org!.name} (${org!.id})`);
    console.log(`  email:        ${SEED_EMAIL}`);
    console.log(`  password:     ${SEED_PASSWORD}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
