# Flora

An operations console for a regenerative farm — fields, crops, satellite-derived crop health,
tasks, and weather.

**Status:** Phase 0 foundations (`docs/tasks/TASK-foundations.md`) and identity/tenancy
(`docs/tasks/TASK-auth-tenancy.md`) have landed — pnpm/Turborepo monorepo, Docker infra, a
proven Drizzle+PostGIS skeleton, email+password login with cookie sessions, and row-level
security enforced twice (repository filter + Postgres RLS) for every tenant table.
`TASK-design-system-shell` is next, followed by the build spine (Fields & Crops → Crop Stress
→ Tasks). See `docs/architecture.md` (system, v2) and `docs/design-spec.md` (visual) for the
full picture — `CLAUDE.md` for how work happens in this repo.

## Stack

pnpm workspaces + Turborepo · Next.js 16 (`apps/web`) · NestJS (`apps/api`, `apps/worker`) ·
PostgreSQL 16 + PostGIS 3.4 via Drizzle ORM (`packages/db`) · Redis 7 · Sentinel Hub ·
Mapbox GL JS · Zod contracts (`packages/contracts`). Full rationale in architecture.md §2–§3.

## Quick start

Prerequisites: Node 24+, pnpm, Docker.

```bash
cp .env.example .env   # fill in placeholders; see infra/README.md for the local ones
pnpm setup              # install deps, start infra, run migrations
pnpm db:seed             # first organization + owner login (owner@flora.local)
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
| `pnpm db:spike` | Re-run the PostGIS round-trip proof (architecture.md §5.2) |
| `pnpm db:seed` | Create the first organization + owner login, if one doesn't exist yet |

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
