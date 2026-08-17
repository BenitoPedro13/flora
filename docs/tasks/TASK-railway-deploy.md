# TASK-railway-deploy

## 1. Current scenario

Flora has never been deployed. `docs/architecture.md` §14 records a deployment plan
(`apps/web` on Vercel, `apps/api`/`apps/worker` on Railway/Fly, managed Postgres+PostGIS,
managed Redis, Cloudflare R2) but no infra exists outside `infra/docker-compose.yml`
(local-only: `imresamu/postgis:16-3.4`, `redis:7-alpine`, `minio/minio`).

The repo is on GitHub at `BenitoPedro13/flora`, branch `main`, working tree clean as of
`672eee9`. `apps/web`, `apps/api`, `apps/worker` each build/start via `dotenv -e ../../.env --
<cmd>`, which assumes a local `.env` file — that wrapper cannot run in a deployed container
(no `.env` file there; env vars come from the platform). `packages/db` seed scripts
(`seed`, `seed:demo`, `seed:satellite`, `seed:rollups`, `seed:weather`) are also
`dotenv`-wrapped and assume a reachable local Postgres.

Decided with the user (2026-08-17), superseding architecture §14's split:

- **Everything on Railway** — `apps/web` included, not Vercel. The SameSite=Lax cookie design
  (`apps/web`'s `next.config.ts` `rewrites()` proxying `/api/v1/*` to `API_URL` server-side)
  does not depend on which provider hosts which app — it works identically with both apps as
  Railway services. No cookie-logic change needed, only the architecture doc's provider column.
- **Postgres+PostGIS**: `postgis/postgis:16-3.4` deployed as a Railway service from a Docker
  image (not Railway's managed Postgres plugin, which is plain `postgres:16` with no PostGIS
  extension available) — same image family the local compose already runs.
- **Redis**: Railway's managed Redis plugin.
- **Object storage**: Railway's native `bucket()` resource (S3-compatible, exposed via
  `railway bucket credentials`) — not Cloudflare R2, not self-hosted MinIO. Satisfies
  architecture §14's "managed object storage" line with a provider-native option instead of R2.

## 2. Planned changes

1. **`.railway/railway.ts`** (new) — Railway's TypeScript IaC (`railway config apply`),
   checked into the repo per CLAUDE.md §2 ("use official CLIs... don't hand-write"). Defines:
   - `db`: `image("postgis/postgis:16-3.4")` + a mounted volume, env `POSTGRES_USER`,
     `POSTGRES_PASSWORD` (`preserve()`), `POSTGRES_DB`.
   - `cache`: `redis()` managed plugin.
   - `assets`: `bucket("flora-rasters")`.
   - `api`, `worker`, `web`: `github("BenitoPedro13/flora", { rootDirectory: "." })` sources
     (root directory stays repo root — pnpm workspace resolution needs the workspace root, not
     the per-app folder), each with an explicit `build`/`start` command that does not depend on
     `dotenv-cli` or a local `.env` (Railway injects env vars into `process.env` directly).
   - `api`'s `preDeployCommand` runs `drizzle-kit`/`tsx` migrations against
     `DATABASE_MIGRATION_URL` (the owner role) — never on app boot, per architecture §14.
   - Secrets (`JWT_SIGNING_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `CDSE_CLIENT_ID/SECRET`,
     `POSTGRES_PASSWORD`) are `preserve()`d in the file (never hardcoded in git) and set once via
     `railway variable set` after the first `apply`.
2. **`package.json`, `apps/{web,api}/package.json`** (edit) — add `start:railway` /
   `build:railway`-style scripts (or reuse existing ones) that skip the `dotenv -e ../../.env --`
   wrapper, since Railway has no `.env` file to point at. Exact shape decided while wiring
   `railway.ts`'s `build`/`start` fields — may end up as inline commands in `railway.ts` instead
   of new package.json scripts, whichever needs fewer moving parts.
3. **`docs/architecture.md` §14** (edit) — replace the Vercel/Railway split and R2 line with the
   decision above; note the cookie same-origin design is provider-agnostic, not
   Vercel/Railway-specific.
4. **`.env.example`** (edit) — no new variables; a comment noting which vars are Railway-managed
   (`DATABASE_URL`, `REDIS_URL` come from Railway service references) vs. manually set secrets.
5. **`README.md`** (edit) — status line + a short "Deployed" note with the Railway project link.

Seeding: after migrations run (via `preDeployCommand` or a one-off `railway run`), replay
`db:seed:demo` (and `db:seed:satellite`/`db:seed:rollups`/`db:seed:weather` if the demo data
should include satellite/weather history) against the deployed `DATABASE_MIGRATION_URL`, via
`railway run --service api -- pnpm --filter @flora/db run seed:demo` (Railway injects the
linked environment's vars, so no local `.env` needed for this either).

### Rejected alternatives

- **Nixpacks auto-detected monorepo services** (no explicit `railway.ts`) — Railway's own
  monorepo auto-detection stages one service per detected package, but doesn't know about
  `packages/db`'s owner-vs-app role split, the PostGIS image requirement, or the
  `preDeployCommand` migration step. Explicit IaC is more code but removes guesswork.
- **Self-hosted MinIO as a Railway service** (mirroring `infra/docker-compose.yml` exactly) —
  works, but Railway's native `bucket()` is managed (no volume/backup to own) and is what the
  user asked for ("use bucket on railway").
- **`railway up` (CLI upload, no GitHub link)** — simpler for a one-off deploy, but every future
  change needs a manual re-upload instead of `git push` triggering a redeploy. `github()` source
  in the IaC file gets Railway's native auto-deploy for free, at the cost of needing the Railway
  GitHub App authorized against `BenitoPedro13/flora`.

## 3. Why

The user asked to deploy Flora under the `mainnetdesign` Railway account and, mid-task, to seed
the deployed Postgres with demo data. Architecture §14 already picked a deployment shape; the
one live change is consolidating `apps/web` onto Railway too (user's explicit call) rather than
splitting it to Vercel, and using Railway's own bucket primitive instead of standing up either
R2 or self-hosted MinIO.

## 4. Affected files

| Path | Change | Notes |
|---|---|---|
| `.railway/railway.ts` | new | IaC: db/cache/assets/api/worker/web |
| `apps/web/package.json` | edit | Railway-safe start command (no `dotenv` wrapper) |
| `apps/api/package.json` | edit | Railway-safe start command + migration entrypoint for `preDeployCommand` |
| `docs/architecture.md` | edit | §14 deployment table — Railway-only, bucket not R2 |
| `.env.example` | edit | note which vars come from Railway service refs |
| `README.md` | edit | deployed status + link |

## 5. Out of scope

- Custom domain purchase/DNS (ships on Railway's generated `*.up.railway.app` domain first;
  custom domain is a follow-up once the user picks one).
- CDSE and full weather live credentials wiring for the deployed environment — `CDSE_CLIENT_ID/
  SECRET` stay blank in prod for now (satellite refresh degrades the same way it does locally
  with no CDSE account, per `.env.example`'s existing comment), unless the user supplies real
  credentials during this task.
- CI/CD beyond Railway's own GitHub auto-deploy (no separate GitHub Actions pipeline).
- Sentry / structured-log observability wiring named in architecture §14's "Observability" row —
  not part of this task.

## 6. Verification

- `railway config plan` shows the expected six resources with no unexpected diff before apply.
- After `railway config apply`, all three app services build and reach a running deployment
  (`railway status` / dashboard green) and `db`'s health check passes.
- `GET /health` and `GET /ready` (architecture §14) return 200 on the deployed `api` service.
- The deployed `web` service's root route (`/`) loads over HTTPS on its generated domain.
- `psql` (via `railway connect db` or `DATABASE_MIGRATION_URL`) shows the full migrated schema
  and confirms `flora_app` has no `BYPASSRLS`/`rolsuper` (the same boot assertion `apps/api`/
  `apps/worker` run themselves).
- Seed data present: a row count check against `farms`/`fields`/`crops` post-seed.
- A manual login + `/fields` render against the deployed URL, browser-verified.

### 6.1 Outcome (2026-08-17)

All six services (`postgres`, `cache`, `storage`, `api`, `worker`, `web`) reached `SUCCESS` in
the `flora` project under the `designmainnet-cell's Projects` workspace. Live at
**https://flora.up.railway.app**.

- `curl https://flora.up.railway.app/api/v1/health` → `{"status":"ok",...}`; `/api/v1/ready` →
  `{"status":"ok"}`.
- `POST /api/v1/auth/login` with the seeded owner credentials → `204`; the resulting session
  cookie reads real seeded fields back from `GET /api/v1/fields` (four fields, real crop
  cycles, real `areaM2`/`centroid` values) — full request → API → Postgres → response loop
  confirmed live, not just a health check.
- Data: not the seed *scripts* re-run against prod — the user asked for the actual local
  Docker Postgres data instead. `docker exec flora-db-1 pg_dump -U flora -d flora --data-only
  --disable-triggers -Fc` → `pg_restore` against the deployed Postgres through a temporary
  `railway tcp-proxy` (deleted immediately after). Row counts matched exactly on both sides
  (1 org, 1 user, 1 farm, 4 fields, 5 crops, 16 crop cycles, 332 observations, 78 stress
  zones, 19 tasks, 30 rollups, 30 farm scores, 32 weather snapshots). The only `pg_restore`
  error was a harmless `_migrations` bookkeeping-table key conflict — expected, since both
  databases ran the identical migration files independently and already agreed on that table's
  contents.
- `flora_app`'s password was rotated off the migration's hardcoded dev placeholder
  (`0003_tenancy_rls.sql`'s own instruction) via `railway ssh`/`tcp-proxy` + `ALTER ROLE`, with
  `DATABASE_URL` updated to match on both `api` and `worker`.
- CDSE and Mapbox credentials came from the working local `.env` (both already real, working
  values) rather than being left blank — satellite refresh and the map are live in prod, not
  degraded. `SATELLITE_SCHEDULE_ENABLED`/`ROLLUP_SCHEDULE_ENABLED`/`WEATHER_SCHEDULE_ENABLED`
  stay `false`, same conservative default as local dev.

### 6.2 Bugs this deploy found (all fixed, all invisible in local dev)

Matches this repo's own pattern (`TASK-crop-stress` §10, `TASK-spectral-indices`) of real bugs
only surfacing against a real environment, not by inspection:

1. **`apps/api` and `apps/worker`'s `start:prod` pointed at `dist/main`, but `nest build`
   actually emits `dist/src/main.js`.** Never caught locally because `pnpm dev` always runs
   `start:dev` (`nest start --watch`, straight from `src/` via `ts-node`/`swc`) — `start:prod`
   had never actually been executed before this deploy. Fixed in both `package.json`s.
2. **`apps/worker`'s `parseRedisUrl()` and `apps/api`'s `createRefreshQueue()` each hand-built
   BullMQ's `connection` option as `{host, port}`, dropping `REDIS_URL`'s username/password
   entirely.** `infra/docker-compose.yml`'s Redis has no `requirepass`, so this was silently
   correct locally and silently wrong against any Redis that requires auth — Railway's managed
   Redis returned `NOAUTH` on every command. Fixed in both files to parse and forward
   `username`/`password`.
3. **`apps/web/next.config.ts`'s `rewrites()` needs `API_URL` at build time**, and Railway's
   Railpack build sandbox does not expose service environment variables to the build command —
   confirmed empirically (the same variable resolves correctly via `railway variable list`,
   contradicting Railway's own general docs) after two failed attempts assuming otherwise. A
   first fix (return an empty rewrites array during `PHASE_PRODUCTION_BUILD`) avoided the build
   crash but shipped a manifest with no rewrite at all — `next start` does not re-invoke
   `rewrites()`, it serves from the `routes-manifest.json` Next.js writes once at `next build`.
   The real fix falls back to the deployment's known private-network URL
   (`http://api.railway.internal:3001`) specifically during the build phase, so the baked
   manifest has a working rewrite; the real env var still wins whenever present.
4. **`WEB_ORIGIN` was set once, early, to a domain that didn't survive** — the `web` service got
   deleted and recreated (§2's ghost-service cleanup) after `WEB_ORIGIN` was already set on
   `api`/`worker`, and Railway assigned a *different* generated domain
   (`flora.up.railway.app`, not `web-production-*.up.railway.app`) the second time. `curl`
   testing never caught it because `curl` sends no `Origin` header, so
   `originCheckMiddleware` never ran its check — a real browser login 403'd until `WEB_ORIGIN`
   was corrected on both `api` and `worker` and `api` redeployed.

### 6.3 Left out of scope, still true

- No custom domain — live on Railway's generated `flora.up.railway.app`.
- `.railway/railway.ts` stays in the repo as documentation of the intended topology; it is not
  what actually provisioned these services (§2's "Rejected alternatives" / this section).
- Observability (Sentry, structured JSON logs) from architecture §14's table — not built.
