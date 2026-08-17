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
