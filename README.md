# 🌱 Flora

**An operations console for regenerative farming** — fields, crops, satellite-derived crop
health, tasks, and weather, in one place.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js%2016-000000?style=flat&logo=next.js&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat&logo=nestjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL%20%2B%20PostGIS-4169E1?style=flat&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white)

Flora replaces spreadsheets and gut-feel with real satellite imagery, weather data, and a task
pipeline built around how a farm actually runs: register a crop, watch it struggle, act on it.

---

## What it does

- 🗺️ **Fields & Crops** — draw field boundaries on a live map, track crop cycles, import
  GeoJSON
- 🛰️ **Crop Stress** — Sentinel-2 satellite imagery processed into ten spectral indices
  (NDVI, NDRE, NDMI, EVI, and more), clipped to each field and rendered as a colour-ramped
  overlay with detected stress zones
- ✅ **Tasks** — a drag-and-drop Kanban board tying work back to fields and crop cycles
- 📊 **Home** — a farm-wide dashboard: regeneration score, crops stocked, water used, planting
  productivity, gathering rate
- ⛅ **Weather** — a 7-day forecast from Open-Meteo: wind, UV, rain probability, pressure, and
  sun position, all real values, sourced against published scales (WHO/WMO UV bands, NOAA/NWS
  rain terminology) rather than invented ones

Every number on screen is either real data or an honest empty state — nothing is fabricated to
fill a chart.

## Tech stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Web | Next.js 16 (App Router) · React 19 · TypeScript |
| API | NestJS |
| Worker | NestJS standalone, BullMQ |
| Database | PostgreSQL 16 + PostGIS 3.4, via Drizzle ORM |
| Queue / cache | Redis 7 |
| Satellite imagery | Sentinel Hub via Copernicus Data Space Ecosystem |
| Weather | Open-Meteo |
| Maps | Mapbox GL JS |
| Design system | AlignUI on Tailwind CSS v4 |
| Contracts | Zod, shared between API and web — no codegen, no drift |

Full architecture and design rationale: [`docs/architecture.md`](docs/architecture.md) and
[`docs/design-spec.md`](docs/design-spec.md).

## Quick start

Prerequisites: Node 24+, pnpm, Docker.

```bash
cp .env.example .env    # fill in placeholders; see infra/README.md for the local ones
pnpm setup               # install deps, start infra, run migrations
pnpm db:seed              # first organization + owner login (owner@flora.local), one farm, four crops
pnpm db:seed:demo         # demo fields with 12 months of harvested history — optional
pnpm db:seed:satellite    # a year of observations + stress zones, via the real pipeline — optional
pnpm db:seed:rollups      # backfills the Home dashboard's KPI deltas — optional
pnpm db:seed:weather      # one real Open-Meteo call per farm — optional
pnpm dev                  # apps/web on :3000, apps/api on :3001, apps/worker standalone
```

Then log in at `localhost:3000/login` with the credentials `pnpm db:seed` prints.

<details>
<summary>Command reference</summary>

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
| `pnpm db:seed:bulk` | Add 200 more fields on a grid (pagination fixtures) |
| `pnpm --filter web test:e2e` | Playwright e2e tests — needs `apps/api` + infra running |

More on the infra stack, including why the local `db` image differs from CI's, in
[`infra/README.md`](infra/README.md).

</details>

## Project structure

```
apps/
  web/          Next.js — design-system shell, screens, Mapbox, charts
  api/          NestJS — controllers, services, auth
  worker/       NestJS standalone — BullMQ consumers + schedules
packages/
  contracts/    Zod schemas + inferred types (the API contract)
  db/           Drizzle schema, client, migrations, PostGIS queries
  config/       shared tsconfig, eslint, prettier, env schema
infra/          docker-compose — Postgres+PostGIS, Redis, MinIO
docs/           architecture.md, design-spec.md, tasks/
```

## Status

| Phase | Screen | Status |
|---|---|---|
| 0 | Foundations, auth, design system, domain schema | ✅ |
| 1 | Fields & Crops | ✅ |
| 2 | Crop Stress (satellite imagery, 10 spectral indices) | ✅ |
| 3 | Tasks board | ✅ |
| 4 | Home dashboard | ✅ |
| 5 | Weather | ✅ |
| — | Energy, Carbon Offset | deferred (no data source yet) |

**Deployed:** [flora.up.railway.app](https://flora.up.railway.app) — `apps/web`, `apps/api`, `apps/worker`, Postgres+PostGIS, Redis, and self-hosted MinIO, all on Railway. Seeded with the same demo data (`db:seed` + `db:seed:demo`) real local dev runs against.

Every phase is documented end to end in [`docs/tasks/`](docs/tasks/) — what was planned, why,
and what was found once it hit a real browser. Workflow and repo conventions are in
[`CLAUDE.md`](CLAUDE.md).
