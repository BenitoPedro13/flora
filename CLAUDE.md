# Workflow Guidelines — Flora (Farm Operations Console)

> Ported from the `plexus` → `reelcast` workflow (plan before you touch anything, lean on
> existing tooling while you work, treat documentation as part of the deliverable when you
> finish), retargeted to this project.

---

## 0. Project context

The design lives in `docs/architecture.md` (system, **v2**) and `docs/design-spec.md`
(visual). Read architecture §1 for the problem statement, §3 for why the prototype was
replaced, §4 for scope, §16 for phasing, and design-spec §2 for the screen inventory.

Flora is an **operations console for a regenerative farm** — fields, crops, satellite-derived
crop health, tasks and weather — built from a Figma design on the AlignUI design system.

**Build order serves the farmer, not the screen count.** The spine is
**Fields & Crops → Crop Stress → Tasks** (architecture §16), hard-sequenced: register the
crop, see it struggle, act on it. That chain is shippable on its own. Home, Weather and
Field Management follow. **Energy (`3:5920`) and Carbon Offset (`3:6566`) are deferred** —
Energy sits off that loop and has no data source (architecture §4.3). Do not build against
either without re-opening the decision.

**Status (2026-08-16):** `TASK-foundations` (monorepo, infra, Drizzle+PostGIS skeleton),
`TASK-auth-tenancy` (identity, sessions, RLS enforced twice), `TASK-design-system-shell`
(AlignUI token chain, vendored base components, `AppSidebar`/`PageHeader`, the `(app)`/`(auth)`
route groups, Playwright shell tests), `TASK-domain-schema` (the ten domain tables — farms,
crops, fields, crop_cycles, observations, stress_zones, tasks + its three children — composite
foreign keys, RLS, the `fields` geometry read/write pattern, seeds), `TASK-fields` (Fields &
Crops — `1:35172`, the first spine screen: field CRUD, boundary drawing, crop cycles, the map,
GeoJSON import), `TASK-satellite-pipeline` (the satellite write path — `packages/satellite`
(CDSE HTTP client), `packages/raster` (decode → stats → PNG → detection), `apps/worker`'s BullMQ
queue and per-field scheduler, six new `apps/api` endpoints, `db:seed:satellite`), and
`TASK-crop-stress` (the `18:6567` screen reading what that write path produces —
`/fields/[fieldId]/stress`: the raster overlay, stress-zone map layer, colour-ramp legend, the
map toolbar's locate/measure/zoom, the grouped detection list, the popover and its three
mutations, the manual-refresh poll, NFR-8's stale badge), and `TASK-satellite-live` (the fix that
made the CDSE round trip actually work against a real account — `packages/satellite/src/cdse/process.ts`
now sends `Accept: application/tar` and extracts named TAR members instead of calling
`res.formData()` on a bare TIFF), `TASK-tasks-board` (Phase 3, `24:11420` — the third and
last link of the spine), and `TASK-home-dashboard` (Phase 4, `1:12913` — the first screen that
reads across every domain instead of owning one) have all landed. **Phases 0 through 4 are
complete**; Phase 5 (`TASK-weather`) is next.
Email+password login with cookie sessions works end to end in a real browser, styled with
AlignUI tokens; every tenant table is protected by the catalog test in
`packages/db/src/queries/tenancy.spec.ts`, now a named allowlist of **three** SECURITY DEFINER
functions (`auth_memberships_for_user`, `scheduler_fields_due_for_refresh`,
`scheduler_farms_due_for_rollup`). `/fields` renders
the four demo field cards (pixel-matched against the Figma), the Mapbox satellite map, the field
editor, and GeoJSON import — all exercised live in a browser and by `apps/web/e2e/fields.spec.ts`;
**View Details** now navigates to `/fields/[fieldId]/stress` instead of opening the editor, whose
second entry point is double-clicking the card (`TASK-crop-stress` §2.12), mirroring the map
polygon's own double-click gesture. `/` is now the real Home screen (`TASK-home-dashboard`),
not the one-line session sentence — see below. Real
`observations` and `stress_zones` rows exist for the demo fields via `db:seed:satellite`, which
replays a synthetic-but-known raster through the real pipeline (`packages/raster`), and now also
via the real thing: `TASK-satellite-live` got real CDSE credentials working end to end — a manual
refresh on Field 237 writes a real `observations` row (`captured_on = 2026-08-14`, a real
`scene_id` ending `.SAFE`, `stats.mean` inside the expected NDVI range) with its PNG fetchable
from MinIO — closing `TASK-satellite-pipeline` §6 item 1. The five Sentinel Hub `[VERIFY]`s are
resolved: four against CDSE's own current docs, the fifth (the Process API's multi-output
response shape) against the live account itself, which is also where the bug was — `process.ts`
sent no `Accept` header, CDSE silently returned a bare single TIFF instead of the requested TAR
of two, and `res.formData()` threw undici's own parser error on it, long mistaken for a
token-endpoint failure. NFR-5 (200-field timing) and NFR-6 (PU budget) stay open — see
`TASK-satellite-pipeline` §6 items 12–13 and `TASK-satellite-live` §10. `TASK-crop-stress` found and fixed two defects
in the landed write path (a manual refresh never retried — the API's producer `Queue` had no
`defaultJobOptions`, unlike the worker's registration — and `jobId` was write-only, no endpoint
read a job back) and one in the seed script itself (the synthetic raster filled its whole
bounding-box rectangle with valid pixels, never clipping to the field's real, possibly
non-rectangular boundary the way a real CDSE response is clipped server-side — found live, by
looking at a rendered field, the same lesson `TASK-satellite-pipeline` §10 recorded for its
flat-ramp bug). `TASK-tasks-board` (`24:11420`) closes the spine: the task domain
`TASK-domain-schema` shipped and left empty of product — contracts, all-SQL-in-`packages/db`
queries (`listBoard`'s one grouped query for all three columns, `moveTask`'s server-computed
midpoint), five `apps/api` endpoints, the Kanban board with a real `@dnd-kit` drag (verified
against React 19.2.8 + Strict Mode before any board code existed, per its own task doc §2.6),
and `tasks.water_volume_m3` for Phase 4's Water Used tile (§4.4). Figma became reachable from
this environment partway through the task, which resolved three things at once: `24:11420`'s
geometry is measured, not read off prose; `PageContainer`'s `max-w-[1110px]` was corrected to
`max-w-[1168px]` (68px narrower than the artboard's real content column, confirmed against the
Page Header instance's own measured width); and NFR-10's baseline is a real Figma export,
committed at `apps/web/e2e/baselines/tasks-board.png`, closing the gap the three earlier screen
specs each recorded as unfetchable "in this environment." The "create a task from this stress
zone" button `TASK-crop-stress` §5 named and deferred is `TASK-stress-to-task`, next in line now
that a create path exists to hang it off. Two live-discovered fixes rode along, unrelated to the
board itself: `FieldEditor`'s new-field map camera defaulted to the seed's Amazonas coordinates
regardless of where an org's real fields actually are (now derived from the org's own field
centroids); and `POST /api/v1/auth/refresh` existed on the API since `TASK-auth-tenancy` but
nothing in `apps/web` ever called it, so every session died with the access token's 15-minute
TTL instead of the refresh token's real 30-day one — a `SessionRefresher` client component now
renews it silently every 10 minutes. `TASK-home-dashboard` (Phase 4, `1:12913`) closes it out:
three new tables (`farm_daily_rollups`, `farm_scores`, `weather_snapshots`), a new
`packages/weather` package (an `OpenMeteoProvider` mirroring `packages/satellite`'s shape —
`[VERIFY]`s on parameter names resolved against Open-Meteo's current docs and a real captured
response, CC-BY 4.0, keyless), `GET /farms/:id/dashboard` (computing on a rollup miss rather
than a "pending" state), a daily worker rollup job and an hourly weather-ingest job, and the
screen itself — four Recharts components and six new `components/flora/` composites. The
Regeneration Score closes architecture §17 Q2 with a real, sourced formula (AAFC's
agri-environmental performance index over Soil Cover Days, Shannon evenness and stress-free
area share — `packages/db/src/scoring/regeneration.ts`) instead of the invented composite
architecture §5.4 originally proposed. Several defects surfaced live, comparing the running
screen against the real Figma export and real seeded data rather than by inspection: two
historical crop-cycle offsets closer together than their cycle length silently double-counted
a field's area in Planting Productivity, caught by the write path's own schema validation on
write, not observed by eye; a shadcn chart tooltip used shadcn's own `bg-background` token
(undefined in AlignUI's theme, fully transparent) and then a *semantic* token
(`--color-bg-strong-950`) that inverts in dark mode, instead of the theme-invariant
`--color-static-*` pair; Gathering Rate's tooltip reliably landed on a zero value because 26
weekly categories in a ~303px chart gave the 1–2 weeks with real data an ~11px hover target,
fixed by re-bucketing to six monthly columns; and `CropsStockedCard`'s donut/legend divider
needed one shared CSS grid (not a flex row with a gap) plus explicit per-cell
border-right/-bottom (Tailwind's `divide-x`/`divide-y` don't understand a 2D grid's row/column
boundaries). Playwright's `mask` option was tried and reverted for the NFR-10 screenshot test:
it only paints the *live* page before capturing, never the stored baseline, so it can't
suppress diff noise against an external, un-doctored Figma export the way it incidentally does
for `shell.spec.ts`'s small sidebar-identity mask — the real measured floor (9%, real per-farm
data against the mock's illustrative numbers) is recorded with headroom instead, the same
"measured floor, not silently loosened" precedent `shell.spec.ts` §10 already set. Next:
`TASK-weather` (Phase 5) — the ingest already stores the full 7-day/wind/UV/pressure/
sunrise-sunset payload Home doesn't read.
The retired prototype was deleted by `TASK-foundations` after tagging `prototype-v0`;
`geo_spike`, the schema spike that proved the PostGIS/Drizzle round-trip, was retired by
`TASK-domain-schema` once `fields` landed.

**Corrected 2026-08-15 (`TASK-design-system-shell`):** design-spec §3.2 called the neutral
colour "Gray" — it's **Slate**. AlignUI's Gray primitive is fully achromatic; the Figma's
neutral hexes (`#0e121b` etc.) have a faint blue tint that converts exactly to AlignUI's Slate
ramp. If a future task re-runs the AlignUI CLI from scratch, pick **Slate**, not Gray.

**Decided 2026-08-15:** no AlignUI PRO seat. The five PRO blocks in the Figma
(`Sidebar [Navigation]`, `Page Header`, `Widgets [HR Management]`, `Schedule Cards`,
`File Upload Cards`) are **rebuilt from free base components** as Flora composites —
design-spec §6.2 has the mapping. `AppSidebar` and `PageHeader` (`components/flora/`) carry the
real work and are built — 11 base components + `chart.tsx` are vendored in `components/ui/`
with sources tracked in `components/ui/SOURCES.md`.

### Why the stack changed

The prototype was Python because **Earth Engine only ships Python and JavaScript bindings**.
Earth Engine is also a research compute platform, not an imagery API — which is why it was
slow. Swapping to **Sentinel Hub** (plain REST/JSON over OAuth2) removed both problems at once
and freed the language choice, so the whole stack is now TypeScript. Architecture §3 has the
full reasoning; §18 has the rejected alternatives. Do not re-litigate without reading them.

### Stack (per architecture §2 — see that document for rationale)

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + **Turborepo** |
| Web | **Next.js 16** App Router · React 19 · TypeScript |
| Design system | **AlignUI v1.2** on Tailwind v4 · **Remix Icon** (`@remixicon/react`) |
| Charts | **shadcn/ui `chart`** (Recharts v3) + 3 hand-rolled SVG (design-spec §7) |
| Map | **Mapbox GL JS** via `react-map-gl` · `mapbox-gl-draw` · `turf` |
| API | **NestJS**, a separate service from the web app (architecture §6.2) |
| Worker | **NestJS standalone** consuming **BullMQ** |
| Database | **PostgreSQL 16 + PostGIS 3.4** · **Drizzle ORM** + drizzle-kit |
| Queue / cache | **Redis 7** |
| Object storage | **Cloudflare R2** (S3-compatible); MinIO locally |
| Satellite | **Sentinel Hub** via Copernicus Data Space Ecosystem |
| Weather | **Open-Meteo** |
| Contracts | **Zod** in `packages/contracts`, imported by both sides — no codegen |

Version numbers here and in the specs are a snapshot, not a pin — verify against each
project's own docs before installing (§2.0).

### How to write in this repo

- **Never invent an API, a component prop, or a provider's behaviour.** Write
  `[VERIFY: what to check and where]` inline instead. Both specs already carry several — the
  Drizzle PostGIS round-trip (architecture §5.2), Sentinel Hub's Processing Unit formula
  (§11.1), Mapbox's ToS on third-party tiles (§11.2), Open-Meteo's parameter names (§11.3),
  and the AlignUI/shadcn `globals.css` ordering (design-spec §7.1). Resolve each before the
  code depending on it ships, not after.
- **Be specific to the point of discomfort:** exact token names, exact node IDs, exact latency
  budgets, exact enum values. No acceptance criterion may rest on "works" or "fast".
  Architecture §15 and `TASK-foundations` §6 set the pattern.
- **Cite the design by node ID**, not by description — `1:12913`, not "the home screen".

### Invariants — never break these without changing the spec first

1. **No Sentinel Hub call on a request path.** Ever. It is scheduled work in the worker;
   the API reads Postgres and Redis (architecture §7). This is the reason the system is shaped
   the way it is, and it is enforced by a test (NFR-4).
2. **Rasters are pre-rendered PNGs in R2.** Store the **object key**, never a signed URL — a
   persisted signed URL expires in the database (architecture §18.4). No tile proxying
   (§18.5).
3. **Field area is derived from geometry** via `ST_Area`, never stored in a column
   (architecture §5.3).
4. **`packages/contracts` is the single source of truth for API shapes.** Zod schemas, imported
   by both NestJS and Next.js. Never hand-write a type on one side that mirrors the other —
   that drift is exactly what killed `lib/api.ts` in the prototype.
5. **All SQL lives in `packages/db`.** Drizzle has no native PostGIS type, so geometry goes
   through the `customType` in `src/types/geography.ts` and every spatial function through
   the `sql` template in `src/queries/`. No raw SQL in `apps/`.
6. **Tenancy is enforced twice** — a repository filter *and* Postgres RLS (architecture §10).
   One missed `where` must not become a cross-tenant leak.
7. **No raw hex in components.** Colours come from AlignUI token classes; the only files
   holding colour values are `app/globals.css`, `components/charts/config.ts`, and
   `components/map/config.ts` (design-spec §10). The last exists because Mapbox GL's paint
   properties are JSON values, not CSS classes, and its style parser does not resolve
   `var(--color-*)` — `TASK-fields` §3.4. **Amended 2026-08-16 (`TASK-crop-stress` §2.2/§3.3):**
   `packages/contracts/src/ramp.ts` also holds one raw stop set, `NDVI_RAMP_STOPS` — it is the
   single source both the worker (encodes a PNG's pixels, not a component) and
   `components/map/config.ts` (re-exports, doesn't declare) read from, so the legend and the
   raster it labels can never paint from a different ramp. `apps/web` itself still has exactly
   the three named files; a grep for raw hex under `apps/web` stays clean.
8. **`components/ui/` is vendored.** AlignUI base components and shadcn's `chart.tsx` stay
   byte-identical to their sources. Restyle through tokens, never by editing them. Product
   composites live in `components/flora/`.

### Tests

- **Integration tests against real infra** (testcontainers: `postgis/postgis:16-3.4`, Redis) —
  never mock the database or the queue. For anything touching geometry, PostGIS behaviour *is*
  the thing under test.
- **A dedicated cross-tenant suite**: authenticate as org A, assert **404** (not 403) on every
  org-B resource, against real RLS.
- **Sentinel Hub is tested from recorded HTTP fixtures**, not hand-built mocks — real captured
  responses replayed, with assertions on parsed output for a known input. The prototype's tests
  asserted on values they fed their own mocks and could not fail for any real reason
  (architecture §13); do not reproduce that.
- **Raster processing has golden fixtures** — a committed float32 GeoTIFF with known values,
  asserting computed stats within tolerance and a stable stress-polygon count.
- **The retry path is a test, not a decorator you read** — make the provider fail and assert
  BullMQ re-runs the job.
- **Visual diff** each screen at 1440×900 against its Figma export, ≤ 2% pixel delta. The
  design spec is a contract; drift should fail a build.

---

## 1. Plan before executing — write a task document first

**Rule:** Before editing or creating **any** code file, write a task document at
`docs/tasks/TASK-<slug>.md`.

### 1.1 Required sections

1. **Current scenario** — what exists today, what's missing or blocked, with concrete file
   names and the commit it describes.
2. **Planned changes** — file by file, what's added/modified/removed and how it connects.
   Note alternatives considered and rejected.
3. **Why** — the justification, so a reviewer can push back before code exists.
4. **Affected files** — a table: path, change type (new/edit/removal), notes.
5. **Verification** — measurable criteria. See `TASK-foundations.md` §6.

Also record what is **explicitly out of scope**; the phases in architecture §16 overlap enough
that an unstated boundary will be crossed.

### 1.2 How to apply it

- Write the document, summarize in 2–3 lines, and wait for alignment on anything non-trivial
  before writing code.
- One document per task, short kebab-case slug: `TASK-foundations.md`, `TASK-fields.md`,
  `TASK-satellite-pipeline.md`.
- Keep it in sync if the plan changes mid-task — it's a living record, not write-once.

---

## 2. Use CLIs, generators, and SDKs — don't write everything by hand

### 2.0 Check current docs before scaffolding anything

Before scaffolding or adding a dependency for **any** part of this stack — AlignUI, shadcn,
Next.js, NestJS, Drizzle, BullMQ, Mapbox, Recharts, Sentinel Hub — check the tool's own
current docs first, then use its official CLI or generator. Hand-authoring what a generator
produces correctly is the wrong default.

### 2.1 In practice

- Apps are scaffolded by their generators: `pnpm create next-app`, `nest new`. Not by hand.
- **AlignUI is installed by its CLI**: `npx @alignui/cli tailwind`, answered
  Green / Gray / oklch / no prefix / CSS-only / `app/globals.css` (design-spec §3.2). Base
  components are then pasted from the docs, unmodified.
- **Order matters between AlignUI and shadcn** — both want to own `globals.css`. AlignUI's CLI
  runs first and overwrites it; shadcn's chart tokens are then *appended*. Never let a shadcn
  theme generator rewrite the file (design-spec §7.1).
- Under **Recharts v3**, chart tokens are `var(--chart-1)`, not `hsl(var(--chart-1))`. The
  wrapped form is all over older examples and silently renders nothing.
- Migrations via `drizzle-kit generate`, always reviewed by hand before commit — it does not
  see PostGIS index or RLS changes.
- Geospatial maths on the client goes through `turf`; never hand-roll area or centroid.
- Sentinel Hub work goes through `packages/satellite`; never call the API from an app directly.

---

## 3. Update documentation after executing

**Rule:** Before considering a task done, update every doc the change affects.

- **`CLAUDE.md`** (this file) — if the change alters the stack, an invariant, or a convention.
- **`docs/architecture.md`** — if the change resolves an open question (§17) or a `[VERIFY]`,
  or changes scope. Update the specific section; don't append.
- **`docs/design-spec.md`** — if a `[VERIFY]` is resolved or a design gap (§9) is closed. When
  the Figma changes, this file changes with it.
- **`.env.example`** — every environment variable the code reads must be listed.
- **`README.md`** — status line and quickstart.
- Grep `docs/*.md` for the names of things you changed (endpoint, table, token, node ID) to
  catch stale references.

---

## 4. Project conventions

```
apps/
  web/          Next.js — AlignUI shell, screens, Mapbox, charts
    components/ui/     AlignUI base + shadcn chart.tsx — vendored verbatim
    components/flora/  product composites (FieldCard, TaskCard, KpiTile, ...)
    components/charts/ shadcn/Recharts compositions + hand-rolled SVG
    components/map/    Mapbox GL
    utils/             cn, tv, recursiveCloneChildren, Polymorphic (AlignUI)
  api/          NestJS — controllers, services, auth
  worker/       NestJS standalone — BullMQ consumers + schedules
packages/
  contracts/    zod schemas + inferred types (the API contract)
  db/           Drizzle schema, client, migrations, spatial queries
  satellite/    Sentinel Hub client behind SatelliteProvider
  config/       shared tsconfig, eslint, tailwind presets
infra/          docker-compose — Postgres+PostGIS, Redis, MinIO
docs/           architecture.md, design-spec.md, tasks/
```

- The worker is a separate app but shares domain services with the API through `packages/`.
  That sharing is the reason the API is a standalone NestJS service rather than Next.js Route
  Handlers (architecture §6.2).
- One TypeScript config source: `packages/config`. No per-package compiler settings.
- **The only contract crossing an app boundary is `packages/contracts`.** No other shape is
  duplicated by hand.

### 4.1 Commit conventions

- Commit automatically once a task doc's work is complete and verified (build/lint/tests
  passing per its own scope) — don't wait to be asked for each one. Standing authorization
  scoped to work that followed the task-doc process in §1; not blanket permission for
  destructive git operations, which still need explicit confirmation.
- **Never add a `Co-Authored-By` trailer to commits in this repo.**

---

## TL;DR

Plan (`docs/tasks/TASK-<slug>.md`) → align → build with official generators, AlignUI via its
CLI (before shadcn), types from `packages/contracts` → update `docs/architecture.md` /
`docs/design-spec.md` / `.env.example` / `README.md` → commit (no `Co-Authored-By`) → done.
Never broken: no Sentinel Hub on a request path, R2 keys not signed URLs, area derived not
stored, contracts are the single source of truth, all SQL in `packages/db`, tenancy enforced
twice, no raw hex outside `globals.css` and the chart config, `components/ui/` stays vendored,
no invented API behaviour (`[VERIFY: ...]` instead), measured acceptance criteria per
architecture §15.
