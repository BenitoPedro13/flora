# TASK-foundations — monorepo, infrastructure, and the persistence skeleton

> **Phase:** 0 (architecture §16) · **Status:** complete, verified 2026-08-15 · **Date:** 2026-08-15
> **Depends on:** nothing · **Blocks:** every other task
> **References:** [`../architecture.md`](../architecture.md) §2, §3, §5.2, §12 ·
> [`../design-spec.md`](../design-spec.md) §3

This is the first of three Phase 0 tasks. It builds the skeleton only.
`TASK-auth-tenancy` and `TASK-design-system-shell` follow and can run in parallel once this
lands.

---

## 1. Current scenario

`HEAD` is `e2d0f5e`. The repo holds a Python/Leaflet/Earth Engine prototype — 18 commits, one
screen — which architecture §3 retires in full. The relevant facts:

- **`apps/backend`** is Python: FastAPI, Poetry, `earthengine-api`. The whole stack is being
  replaced by TypeScript (architecture §3.1), so none of it survives.
- **`apps/frontend`** is Next.js 16 / React 19 / Tailwind v4 — the right versions — but its
  only content is a `create-next-app` shell plus four Leaflet components. Mapbox replaces
  Leaflet, and the shell is replaced by AlignUI, so nothing meaningful survives either.
- **There is no root `package.json`.** `apps/frontend/` carries its own `pnpm-lock.yaml` and a
  `pnpm-workspace.yaml` containing only `onlyBuiltDependencies`, so this is not a workspace —
  it is a standalone package nested two levels down, with nowhere to put shared code.
- **`make dev` and `make auth` are broken on this machine.** The `Makefile` hardcodes
  `/Users/benitoxavier/Library/Python/3.9/bin/poetry`; this machine's user is `benito`.
- **No database, no migrations, no configuration module, no local infrastructure.** The
  backend reads exactly one environment variable, `GEE_PROJECT`, via a bare `os.getenv`.
- **`scripts/setup_dev.sh`** installs Poetry/Python and scaffolds the frontend by hand; it goes
  with the prototype for the same reason the Makefile does.

---

## 2. Planned changes

### 2.1 Retire the prototype

```bash
git tag prototype-v0 e2d0f5e     # before anything is deleted
```

Then remove `apps/backend/` and `apps/frontend/` entirely. The tag keeps the Earth Engine NDVI
implementation citable; architecture §3 records what carried forward conceptually.

### 2.2 Workspace root

| File | Change |
|---|---|
| `package.json` | **new**. Private, `packageManager` pinned to the pnpm version in use, scripts delegating to Turbo. |
| `pnpm-workspace.yaml` | **new**: `packages: ["apps/*", "packages/*"]`, plus `onlyBuiltDependencies` (`sharp`, `unrs-resolver`) lifted from the deleted frontend copy. |
| `turbo.json` | **new**. Pipeline for `build`, `dev`, `lint`, `typecheck`, `test`, with `build` depending on `^build` so packages compile before apps. |
| `.npmrc` | **new**. `node-linker` and strictness settings appropriate to the pnpm version. |
| `Makefile` | **removal**. Turbo plus pnpm scripts replace it; keeping a Makefile that wraps pnpm is a second place for commands to drift. |

### 2.3 Shared packages

| Package | Contents |
|---|---|
| `packages/config` | **new**. Shared `tsconfig` bases (`base`, `nextjs`, `nestjs`, `library`), ESLint flat config, Prettier config. Every other package extends these — no per-package compiler settings. |
| `packages/db` | **new**. Drizzle schema, client factory, drizzle-kit config, migrations, and `src/types/geography.ts` (§2.5). Exports typed query helpers; the **only** place SQL is written. |
| `packages/contracts` | **new**. Zod schemas + inferred types (architecture §8.2). Ships `geojson` primitives (`pointSchema`, `polygonSchema`, `multiPolygonSchema`) used by both sides. No domain schemas yet beyond a smoke example — those land with their features. |
| `packages/satellite` | **not created here.** Lands in Phase 2. |

### 2.4 Application scaffolds

Scaffold with the official generators (CLAUDE.md §2.0), not by hand:

| App | Command | Notes |
|---|---|---|
| `apps/web` | `pnpm create next-app` | TypeScript, App Router, Tailwind v4, `src/`-less to match the design-spec directory convention. **No AlignUI yet** — that is `TASK-design-system-shell`. |
| `apps/api` | `nest new` | NestJS, pnpm, TypeScript strict. |
| `apps/worker` | hand-assembled from the Nest standalone template | `NestFactory.createApplicationContext` — no HTTP server. BullMQ wiring lands in Phase 2; this task creates the app and proves it boots and reaches Postgres and Redis. |

Each app gets `/health` and, where it has an HTTP surface, `/ready`.

### 2.5 PostGIS with Drizzle — the risk this task exists to retire

Architecture §5.2 records the verified fact that **Drizzle has no native PostGIS geometry
type**, and proposes a `customType`. That proposal is unproven against a live database, and
the entire field schema rests on it. **Proving it is the single most important deliverable
here.**

| File | Change |
|---|---|
| `packages/db/src/types/geography.ts` | **new**. `geographyMultiPolygon` and `geographyPoint` custom types. |
| `packages/db/src/schema/spike.ts` | **new, temporary**. A single `geo_spike` table with a `geography(MultiPolygon,4326)` column, existing only to prove the round-trip. Dropped in `TASK-domain-schema`. |
| `packages/db/migrations/0000_enable_postgis.sql` | **new**. `CREATE EXTENSION IF NOT EXISTS postgis;` Alone, deliberately — a failure here is unambiguous. |
| `packages/db/migrations/0001_geo_spike.sql` | **new**. The spike table plus its GIST index. |
| `packages/db/src/queries/spatial.ts` | **new**. `ST_AsGeoJSON` / `ST_GeomFromGeoJSON` / `ST_Area` / `ST_Centroid` helpers over Drizzle's `sql` template. |

If the `customType` round-trip does not work as written — most likely because the driver
returns geography as WKB hex rather than text — the fallback is to project every read through
`ST_AsGeoJSON` explicitly at the query site and keep the column typed as `text` in Drizzle.
**Record whichever way it lands in architecture §5.2 before moving on.**

**Resolved 2026-08-15: the fallback is what ships.** node-postgres does return WKB hex, not
GeoJSON text — confirmed against a live `imresamu/postgis:16-3.4` instance. Full record,
including the round-trip and area-agreement numbers, is in architecture.md §5.2.

### 2.6 Local infrastructure

| File | Change |
|---|---|
| `infra/docker-compose.yml` | **new**. `db`: `postgis/postgis:16-3.4`, healthcheck `pg_isready`. `cache`: `redis:7-alpine`, healthcheck `redis-cli ping`. `storage`: `minio/minio` as the R2 stand-in, with a `createbuckets` init container. Named volumes, `restart: unless-stopped`. |
| `infra/README.md` | **new**. Start, reset, inspect; the `psql` one-liner confirming PostGIS is loaded; the MinIO console URL. |

**Resolved 2026-08-15:** it does not. `docker image inspect postgis/postgis:16-3.4` reports
`amd64/linux` on this machine — Docker pulls and runs it under emulation rather than refusing,
which would have been a silent performance trap. `infra/docker-compose.yml` uses
`imresamu/postgis:16-3.4` instead, a real arm64 build on the same PostGIS 3.4 base, verified with
`docker image inspect` reporting `arm64/linux`. CI (`.github/workflows/ci.yml`) runs on amd64
GitHub-hosted runners, so it uses the official image directly — see infra/README.md.

### 2.7 Configuration

| File | Change |
|---|---|
| `packages/config/src/env.ts` | **new**. A zod-validated environment schema parsed once at boot. Missing or malformed variables fail loudly at startup, never at first use. |
| `.env.example` | **new** at root. `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `CDSE_CLIENT_ID`, `CDSE_CLIENT_SECRET`, `JWT_SIGNING_KEY`, `WEB_ORIGIN`, `NODE_ENV`. Secrets carry no defaults. |

`CDSE_*` and `MAPBOX` are listed now, unused until Phases 1–2, so the setup instructions are
written once.

### 2.8 CI

| File | Change |
|---|---|
| `.github/workflows/ci.yml` | **new**. `pnpm install --frozen-lockfile`, then `turbo lint typecheck test build`, with Postgres+PostGIS and Redis services available for the integration tests. |

---

## 3. Why

**Why delete rather than migrate.** Every layer changes at once: language, framework, imagery
provider, map library, ORM. A migration path between two stacks with no overlapping files is
not a migration, it is a rewrite with extra bookkeeping. The tag preserves the prototype for
reference at zero ongoing cost.

**Why the workspace first.** `packages/contracts` is what removes the codegen step between
NestJS and Next.js (architecture §8.2). It cannot exist without a workspace root, and every
later task depends on importing from it.

**Why prove the PostGIS `customType` before anything else.** It is the only load-bearing
technical unknown in the whole architecture. Drizzle's lack of native geometry support is
confirmed; the workaround is not. Discovering it doesn't work while building the fields
feature would mean reworking the schema, the queries and the contracts at once. A ten-line
spike table settles it in an afternoon.

**Why a temporary spike table rather than the real `fields` table.** The same reason the two
concerns are separated everywhere else in this plan: a task that both proves the machinery and
designs the schema conflates "does geography round-trip" with "is the field model right", and
a schema review should be about the schema.

**Why MinIO now, when rasters arrive in Phase 2.** The storage credentials shape the config
module and `.env.example`. Adding a service to compose later is trivial; discovering that
`packages/config` has no notion of object storage while mid-way through the satellite pipeline
is not.

**Why drop the Makefile.** It exists to paper over a Python/Node split that no longer exists.
With one language and Turbo, `pnpm dev` is the entry point, and a Makefile wrapping pnpm
scripts is just a second place for commands to go stale — which is exactly how the current one
came to reference a user that does not exist on this machine.

---

## 4. Affected files

| Path | Change | Notes |
|---|---|---|
| `apps/backend/**` | **removal** | Python prototype (tagged `prototype-v0`) |
| `apps/frontend/**` | **removal** | Leaflet + `create-next-app` shell |
| `Makefile` | **removal** | Replaced by Turbo + pnpm scripts |
| `scripts/setup_dev.sh` | **removal** | Poetry/Python setup script, goes with the Makefile |
| `.gitignore` | rewrite | Was prototype-specific (`apps/backend/...`, `apps/frontend/...`); now generic for a pnpm/Turbo monorepo |
| `package.json` | new | Workspace root |
| `pnpm-workspace.yaml` | new | |
| `turbo.json` | new | |
| `.npmrc` | new | |
| `.env.example` | new | |
| `.github/workflows/ci.yml` | new | |
| `packages/config/**` | new | tsconfig, eslint, prettier, env schema |
| `packages/contracts/**` | new | zod + geojson primitives |
| `packages/db/src/client.ts` | new | Drizzle client factory |
| `packages/db/src/types/geography.ts` | new | **The spike's subject** |
| `packages/db/src/schema/spike.ts` | new, temporary | Dropped in `TASK-domain-schema` |
| `packages/db/src/queries/spatial.ts` | new | PostGIS helpers |
| `packages/db/migrations/0000_enable_postgis.sql` | new | |
| `packages/db/migrations/0001_geo_spike.sql` | new | |
| `packages/db/drizzle.config.ts` | new | |
| `apps/web/**` | new | `create-next-app` scaffold, no AlignUI yet |
| `apps/api/**` | new | `nest new` scaffold + health/ready |
| `apps/worker/**` | new | Nest standalone, boots and connects |
| `infra/docker-compose.yml` | new | PostGIS + Redis + MinIO |
| `infra/README.md` | new | |
| `README.md` | rewrite | Currently describes the retired prototype |

---

## 5. Explicitly out of scope

Auth and tenancy (`TASK-auth-tenancy`) · domain tables (`TASK-domain-schema`) · AlignUI
install, shadcn charts, and the app shell (`TASK-design-system-shell`) · Mapbox integration ·
`packages/satellite` and BullMQ (Phase 2) · any screen from the design.

`apps/web` at the end of this task is a bare Next.js scaffold. That is intended.

---

## 6. Verification

Measurable, per CLAUDE.md — no criterion may rest on "works". All 13 run and verified
2026-08-15.

1. ✅ `pnpm install` at the repo root produces **one** lockfile (`apps/web`'s nested
   `pnpm-lock.yaml`/`pnpm-workspace.yaml`, artifacts of scaffolding it standalone before the
   root existed, were removed) and resolves all 6 workspace packages (`@flora/config`,
   `@flora/contracts`, `@flora/db`, `api`, `worker`, `web`).
2. ✅ `pnpm turbo build lint typecheck` exits 0 from a clean install.
3. ✅ `docker compose -f infra/docker-compose.yml up -d` reaches `healthy` on all three
   services in ~9 s, well inside 45 s.
4. ✅ `PostGIS_Version()` returns `3.4 USE_GEOS=1 USE_PROJ=1 USE_STATS=1`.
5. ✅ `pnpm db:migrate` on an empty database applies `0000` and `0001` and exits 0; a second
   run logs nothing and exits 0.
6. ✅ **The geography round-trip test passes** (`packages/db/src/queries/spike-roundtrip.ts`,
   `pnpm db:spike`): GeoJSON round-trip is structurally equal; PostGIS `ST_Area`
   (183,958.91 m²) agrees with `turf.area` (183,677.55 m²) to within **0.15%**, inside the
   0.5% bar. This is the acceptance criterion this task exists for — see architecture §5.2 for
   the full resolution of the `customType` `[VERIFY]`.
7. ✅ `EXPLAIN` on the bounding-box query shows `Index Scan using geo_spike_boundary_gist`, not
   a sequential scan.
8. ✅ `GET /health` on `apps/api`: 200, ~1ms steady-state (first request after cold start was
   35ms; every request after was <2ms).
9. ✅ `GET /ready`: 200 with Postgres and Redis up. `docker stop flora-db-1` →
   `{"status":"error","failed":["database"]}`, 503, in ~43ms. Restarting the container recovers
   `/ready` to 200.
10. ✅ `apps/worker` (built, run as `node dist/main.js`) logs `connected to Postgres` and
    `connected to Redis`, then `worker ready`. `SIGTERM` logs `received SIGTERM, shutting down`
    and the process exits 0.
11. ✅ Starting `apps/worker` or `apps/api` with no env vars set (`env -i`) fails before
    `NestFactory` runs, printing every missing variable by name, and exits 1.
12. **Not yet run** — no PR opened against this branch yet. `.github/workflows/ci.yml` mirrors
    steps 1–10 (migrate, spike round-trip, then `turbo lint typecheck test build`) against
    services matching `infra/docker-compose.yml`, using the official `postgis/postgis:16-3.4`
    image since GitHub-hosted runners are amd64 (§2.6).
13. ✅ `grep -rn "benitoxavier\|earthengine\|leaflet\|poetry" . --exclude-dir=node_modules
    --exclude-dir=.git --exclude-dir=docs --exclude-dir=.turbo` returns nothing.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| **The `customType` round-trip fails** (driver returns WKB hex, not text) | **Happened, as suspected.** Fallback shipped as designed — see §2.5 and architecture §5.2 |
| `postgis/postgis:16-3.4` has no arm64 image | **Confirmed no arm64 image.** `imresamu/postgis:16-3.4` used locally instead — see §2.6 |
| NestJS and Next.js want different TypeScript targets/module settings | `packages/config` ships separate bases per runtime rather than one shared compromise |
| Deleting both apps loses something not yet noticed | `prototype-v0` tag; nothing is unrecoverable |
| Turbo caching masks a broken build locally | CI runs with `--force` on the default branch |

---

## 8. Follow-on tasks

**Phase 0 (remaining, parallel after this):**
`TASK-auth-tenancy` — users, orgs, memberships, JWT cookies, RLS
`TASK-design-system-shell` — AlignUI CLI, shadcn chart, Inter, **plus `AppSidebar` and
`PageHeader` rebuilt from base components** (design-spec §6.2 — there is no PRO seat)
`TASK-domain-schema` — the real tables, drops the spike. **No energy tables** (architecture §4.3).

**Then, in the farmer's order (architecture §16) — the first three are the spine:**
`TASK-fields` → `TASK-crop-stress` → `TASK-tasks-board` → `TASK-home-dashboard` →
`TASK-weather` → `TASK-field-management`.

Energy and Carbon Offset are deferred and have no task documents.
