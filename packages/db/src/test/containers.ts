import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer } from "@testcontainers/redis";
import { Client } from "pg";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");

// Same arm64 trap TASK-foundations hit with the local dev image (architecture
// §5.2): postgis/postgis has no arm64 build, so Apple Silicon needs the
// imresamu fork. CI (amd64) uses the official image.
const POSTGIS_IMAGE =
  process.env.TEST_POSTGIS_IMAGE ??
  (process.arch === "arm64" ? "imresamu/postgis:16-3.4" : "postgis/postgis:16-3.4");

const OWNER_USER = "flora";
const OWNER_PASSWORD = "flora";
const APP_USER = "flora_app";
const APP_PASSWORD = "flora-app-dev-secret";
const DATABASE = "flora_test";

export interface TestInfra {
  /** The owner connection — same role packages/db scripts use in dev (DATABASE_MIGRATION_URL). */
  ownerUrl: string;
  /** The flora_app connection — same role apps/api and apps/worker use (DATABASE_URL). */
  appUrl: string;
  redisUrl: string;
  stop(): Promise<void>;
}

let cached: Promise<TestInfra> | null = null;

/**
 * One Postgres + Redis container per test run, migrations applied once
 * (TASK-auth-tenancy §2.9). Shared by packages/db and apps/api's test
 * suites — apps/api imports this via `@flora/db/test/containers` rather than
 * standing up its own containers, so both exercise the exact same migration
 * history.
 */
export function startTestInfra(): Promise<TestInfra> {
  if (!cached) {
    cached = boot();
  }
  return cached;
}

async function boot(): Promise<TestInfra> {
  const postgres = await new PostgreSqlContainer(POSTGIS_IMAGE)
    .withDatabase(DATABASE)
    .withUsername(OWNER_USER)
    .withPassword(OWNER_PASSWORD)
    .start();
  const redis = await new RedisContainer("redis:7-alpine").start();

  const ownerUrl = connectionUrl(postgres, OWNER_USER, OWNER_PASSWORD);
  await applyMigrations(ownerUrl);
  const appUrl = connectionUrl(postgres, APP_USER, APP_PASSWORD);

  return {
    ownerUrl,
    appUrl,
    redisUrl: redis.getConnectionUrl(),
    async stop() {
      await postgres.stop();
      await redis.stop();
      cached = null;
    },
  };
}

function connectionUrl(postgres: StartedPostgreSqlContainer, user: string, password: string): string {
  return `postgresql://${user}:${password}@${postgres.getHost()}:${postgres.getPort()}/${DATABASE}`;
}

async function applyMigrations(ownerUrl: string): Promise<void> {
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      await client.query(readFileSync(join(migrationsDir, file), "utf-8"));
    }
  } finally {
    await client.end();
  }
}
