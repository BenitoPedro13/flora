import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { startTestInfra } from '@flora/db/test/containers';
import { createDbClient, memberships, organizations, users } from '@flora/db';
import type { Database } from '@flora/db';
import type { Role } from '@flora/contracts';
import { hash } from '@node-rs/argon2';
import { sql } from 'drizzle-orm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';

/**
 * One container-backed Nest app per test run (TASK-auth-tenancy §2.9),
 * shared by every e2e spec file — `startTestInfra()` caches the containers,
 * and this caches the compiled app on top of them. Env vars are set before
 * AppModule's providers (DatabaseModule, JwtModule) read them at DI-resolve
 * time, so this must run before any import that constructs the app.
 */
let appPromise: Promise<INestApplication> | null = null;

export function getTestApp(): Promise<INestApplication> {
  if (!appPromise) {
    appPromise = boot();
  }
  return appPromise;
}

async function boot(): Promise<INestApplication> {
  const infra = await startTestInfra();
  process.env.DATABASE_URL = infra.appUrl;
  process.env.DATABASE_MIGRATION_URL = infra.ownerUrl;
  process.env.REDIS_URL = infra.redisUrl;
  process.env.JWT_SIGNING_KEY ??= 'test-signing-key-at-least-32-bytes-long';
  process.env.WEB_ORIGIN ??= 'http://localhost:3000';
  process.env.ACCESS_TOKEN_TTL_SECONDS ??= '900';
  process.env.REFRESH_TOKEN_TTL_SECONDS ??= '2592000';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

export interface SeededUser {
  userId: string;
  organizationId: string;
  organizationName: string;
  email: string;
  password: string;
  role: Role;
}

// One shared owner-connection pool for seeding, not one per seedUserWithOrg()
// call — the enumeration test (§6.7) seeds 200 users, and 200 independent
// pools blew through Postgres's default max_connections.
let ownerDb: Database | null = null;

async function getOwnerDb(): Promise<Database> {
  if (!ownerDb) {
    await getTestApp();
    ownerDb = createDbClient(process.env.DATABASE_MIGRATION_URL!).db;
  }
  return ownerDb;
}

/**
 * Seeds directly through the owner connection — bypassing HTTP and RLS on
 * purpose, the way a migration or admin tool would, not exercising the code
 * under test.
 */
export async function seedUserWithOrg(
  role: Role = 'owner',
): Promise<SeededUser> {
  const unique = randomUUID();
  const email = `test-${unique}@example.test`;
  const password = `Correct-Horse-Battery-${unique}`;
  const passwordHash = await hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const db = await getOwnerDb();
  const [org] = await db
    .insert(organizations)
    .values({ name: `Test Org ${unique}`, slug: `test-org-${unique}` })
    .returning();
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash })
    .returning();
  await db
    .insert(memberships)
    .values({ organizationId: org.id, userId: user.id, role });

  return {
    userId: user.id,
    organizationId: org.id,
    organizationName: org.name,
    email,
    password,
    role,
  };
}

export interface SeededFarmAndCrop {
  farmId: string;
  cropId: string;
}

/**
 * Seeds through the owner connection, same as `seedUserWithOrg` — the
 * TASK-fields e2e suites need a farm (fields' required parent) and a crop
 * (a growing cycle's required parent) beyond what `seedUserWithOrg` sets up.
 */
export async function seedFarmAndCrop(
  organizationId: string,
): Promise<SeededFarmAndCrop> {
  const db = await getOwnerDb();
  const farmRows = await db.execute<{ id: string }>(sql`
    INSERT INTO farms (organization_id, name, location, timezone)
    VALUES (${organizationId}, 'Test Farm', ST_GeomFromGeoJSON('{"type":"Point","coordinates":[-93.6,42.03]}'), 'America/Chicago')
    RETURNING id
  `);
  const cropRows = await db.execute<{ id: string }>(sql`
    INSERT INTO crops (organization_id, name, slug)
    VALUES (${organizationId}, 'Corn', 'corn')
    RETURNING id
  `);
  return { farmId: farmRows.rows[0].id, cropId: cropRows.rows[0].id };
}
