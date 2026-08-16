# Flora

An operations console for a regenerative farm — fields, crops, satellite-derived crop health,
tasks, and weather.

**Status:** Phases 0 through 3 are complete. Foundations
(`docs/tasks/TASK-foundations.md`), identity/tenancy (`docs/tasks/TASK-auth-tenancy.md`), the
design-system shell (`docs/tasks/TASK-design-system-shell.md`), the domain schema
(`docs/tasks/TASK-domain-schema.md`), Fields & Crops (`docs/tasks/TASK-fields.md`), the
satellite pipeline's write path (`docs/tasks/TASK-satellite-pipeline.md`), the Crop Stress
screen (`docs/tasks/TASK-crop-stress.md`), the live CDSE round-trip fix
(`docs/tasks/TASK-satellite-live.md`), and the Tasks board
(`docs/tasks/TASK-tasks-board.md`) have all landed:
pnpm/Turborepo monorepo, Docker infra, the ten domain tables (farms, crops, fields, crop_cycles,
observations, stress_zones, tasks + its three children) with composite foreign keys and RLS,
email+password login with cookie sessions, row-level security enforced twice (repository filter
+ Postgres RLS) for every tenant table, the AlignUI token chain + `AppSidebar`/`PageHeader` shell
every screen renders into, `/fields` — field CRUD, Mapbox boundary drawing, crop cycles,
cursor-paginated search/sort/filter, and GeoJSON import (preview-then-commit) —
`packages/satellite` (the CDSE HTTP client) + `packages/raster` (decode → stats → PNG →
detection) + `apps/worker`'s BullMQ queue and scheduler + seven `apps/api` endpoints, and now
`/fields/[fieldId]/stress` (`18:6567`) reading all of it: the NDVI raster overlay clipped to the
field boundary, the stress-zone map layer, the colour-ramp legend, the map toolbar
(locate/measure/zoom), the classification-grouped detection list, the popover with
classify/mute/delete, a manual-refresh button that polls to completion, and NFR-8's stale badge.
`db:seed:satellite` replays a synthetic fixture through the real pipeline for offline
development — no CDSE credentials needed locally. `TASK-satellite-live` closed the one real gap
in that write path: `packages/satellite/src/cdse/process.ts` now sends `Accept: application/tar`
and extracts the two named TAR members CDSE actually returns, instead of the bare-TIFF/`res.formData()`
mismatch that failed every real refresh; a manual refresh on Field 237 now completes end to end
against a real account and writes a real observation. `/tasks` (`24:11420`) closes the spine:
a Kanban board over the task domain — five `apps/api` endpoints, server-computed drag positions
(`PATCH /tasks/:id/move`), and `tasks.water_volume_m3` sourcing Phase 4's Water Used tile. List
and Timeline views and Import ship disabled (undesigned); the board's own NFR-10 baseline is a
real Figma export this environment could finally reach. `/` still renders the session sentence.
Next: Home (`TASK-home-dashboard`, Phase 4) — the "create a task from this stress zone" action
on the Crop Stress popover is `TASK-stress-to-task`'s entry point, buildable now that Tasks has
a create path.
See `docs/architecture.md` (system, v2) and
`docs/design-spec.md` (visual) for the full picture — `CLAUDE.md` for how work happens in this
repo.

## Stack

pnpm workspaces + Turborepo · Next.js 16 (`apps/web`) · NestJS (`apps/api`, `apps/worker`) ·
PostgreSQL 16 + PostGIS 3.4 via Drizzle ORM (`packages/db`) · Redis 7 · Sentinel Hub ·
Mapbox GL JS · Zod contracts (`packages/contracts`). Full rationale in architecture.md §2–§3.

## Quick start

Prerequisites: Node 24+, pnpm, Docker.

```bash
cp .env.example .env   # fill in placeholders; see infra/README.md for the local ones
pnpm setup              # install deps, start infra, run migrations
pnpm db:seed             # first organization + owner login (owner@flora.local), one farm, four crops
pnpm db:seed:demo        # four demo fields matched to the Fields screen's Figma cards — optional
pnpm db:seed:satellite   # observations + stress zones for the demo fields, via the real pipeline — optional, run after db:seed:demo
pnpm dev                 # apps/web on :3000, apps/api on :3001, apps/worker standalone
```

`pnpm setup` is `pnpm install && pnpm infra:up && pnpm infra:wait && pnpm db:migrate` — run the
steps individually if you want to see each one. `pnpm dev` builds `packages/*` first (Turbo's
`dev` task depends on `^build`): `apps/api`/`apps/worker` run through NestJS's own compiler
(needed for `emitDecoratorMetadata`, which esbuild-based tools like `tsx` don't implement), so
`packages/config`/`db`/`contracts` must exist as compiled JS, not raw TypeScript, for `nest
start` to resolve them.

Log in at `localhost:3000/login` with the seeded credentials `pnpm db:seed` printed.

## Commands

| Command | Does |
|---|---|
| `pnpm dev` | Runs every app's dev server via Turbo |
| `pnpm build` / `lint` / `typecheck` / `test` | Same, for the matching task across the workspace |
| `pnpm format` | Prettier, using `packages/config`'s shared config |
| `pnpm infra:up` / `infra:down` / `infra:reset` | Start / stop / wipe-and-restart Postgres+PostGIS, Redis, MinIO |
| `pnpm infra:logs` | Follow logs for all three infra services |
| `pnpm infra:psql` / `infra:redis-cli` | Open a shell into the running db / cache container |
| `pnpm db:migrate` | Apply pending SQL migrations (`packages/db/migrations`) |
| `pnpm db:generate` | `drizzle-kit generate` — always review the output before committing |
| `pnpm db:studio` | Drizzle Studio against the local database |
| `pnpm db:seed` | Create the first organization, owner login, farm, and crops, if they don't exist yet |
| `pnpm db:seed:demo` | Add four demo fields matched to the Fields screen's Figma cards — run after `db:seed` |
| `pnpm db:seed:satellite` | Replay a synthetic-but-known raster through the real pipeline into `observations`/`stress_zones` for the demo fields — run after `db:seed:demo`; needs no CDSE credentials |
| `pnpm db:seed:bulk` | Add 200 more fields on a grid (pagination and NFR-11 fixtures) — run after `db:seed` |
| `pnpm --filter web test:e2e` | Playwright e2e tests (`apps/web/e2e/`) — needs `apps/api` + infra running and `pnpm db:seed && pnpm db:seed:demo`; run `pnpm --filter web exec playwright install chromium` once first |

More detail on the infra stack, including why the local `db` image differs from CI's, is in
`infra/README.md`.

## Project structure

```
apps/
  web/          Next.js — AlignUI shell, screens, Mapbox, charts
  api/          NestJS — controllers, services, auth
  worker/       NestJS standalone — BullMQ consumers + schedules
packages/
  contracts/    zod schemas + inferred types (the API contract)
  db/           Drizzle schema, client, migrations, PostGIS queries
  config/       shared tsconfig, eslint, prettier, env schema
infra/          docker-compose — Postgres+PostGIS, Redis, MinIO
docs/           architecture.md, design-spec.md, tasks/
```

Full conventions, invariants, and workflow in `CLAUDE.md`.
