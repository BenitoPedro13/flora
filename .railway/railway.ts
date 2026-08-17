import { bucket, defineRailway, github, group, image, project, redis, service, volume } from "railway/iac";

// Topology only — see docs/tasks/TASK-railway-deploy.md. Every secret and
// every composed value (DATABASE_URL, DATABASE_MIGRATION_URL, S3_*, JWT
// signing key, Mapbox token, WEB_ORIGIN/API_URL once domains exist) is set
// out-of-band via `railway variable set`, never checked in here — migrations
// are committed to git and secrets must never share that source of truth
// (packages/db/migrations/0003_tenancy_rls.sql makes the same call for the
// flora_app role's dev password).
export default defineRailway(() => {
  const dbData = volume("db-data", { sizeMB: 5120 });

  // postgis/postgis:16-3.4, not Railway's managed Postgres plugin — the
  // latter is plain postgres:16 with no PostGIS extension available.
  const db = service("db", {
    source: image("postgis/postgis:16-3.4"),
    env: {
      POSTGRES_USER: "flora",
      POSTGRES_DB: "flora",
    },
    volumeMounts: { "/var/lib/postgresql/data": dbData },
  });

  const cache = redis("cache");

  // Railway's native bucket resource — S3-compatible, not Cloudflare R2 and
  // not self-hosted MinIO (user's call, TASK-railway-deploy §1).
  const assets = bucket("flora-rasters");

  const repo = github("BenitoPedro13/flora", { branch: "main", rootDirectory: "." });

  const api = service("api", {
    source: repo,
    build: "pnpm install --frozen-lockfile && pnpm exec turbo run build --filter=api...",
    start: "pnpm --filter api run start:prod",
    // Migrations as a release step, never on app boot (architecture §14,
    // invariant enforced by apps/api's own RLS boot assertion too).
    preDeployCommand: "pnpm --filter @flora/db run migrate",
    env: { NODE_ENV: "production" },
  });

  const worker = service("worker", {
    source: repo,
    build: "pnpm install --frozen-lockfile && pnpm exec turbo run build --filter=worker...",
    start: "pnpm --filter worker run start:prod",
    env: { NODE_ENV: "production" },
  });

  const web = service("web", {
    source: repo,
    build: "pnpm install --frozen-lockfile && pnpm exec turbo run build --filter=web...",
    start: "pnpm --filter web run start",
    env: { NODE_ENV: "production" },
  });

  const backend = group("Backend", [db, cache, api, worker]);
  const storage = group("Storage", [assets, dbData]);

  return project("flora", {
    resources: [backend, storage, web],
  });
});
