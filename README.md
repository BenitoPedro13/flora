# Flora

An operations console for a regenerative farm — fields, crops, satellite-derived crop health,
tasks, and weather.

**Status:** Phase 0 foundations landed (`docs/tasks/TASK-foundations.md`) — pnpm/Turborepo
monorepo, Docker infra, and a proven Drizzle+PostGIS skeleton. No screens yet.
`TASK-auth-tenancy` and `TASK-design-system-shell` are next, followed by the build spine
(Fields & Crops → Crop Stress → Tasks). See `docs/architecture.md` (system, v2) and
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
pnpm dev                 # apps/web on :3000, apps/api on :3000 (nest), apps/worker standalone
```

`pnpm setup` is `pnpm install && pnpm infra:up && pnpm infra:wait && pnpm db:migrate` — run the
steps individually if you want to see each one.

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
| `pnpm db:spike` | Re-run the PostGIS round-trip proof (architecture.md §5.2) |

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
  db/           Drizzle schema, client, migrations, spatial queries
  config/       shared tsconfig, eslint, prettier, env schema
infra/          docker-compose — Postgres+PostGIS, Redis, MinIO
docs/           architecture.md, design-spec.md, tasks/
```

Full conventions, invariants, and workflow in `CLAUDE.md`.
