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

**Status (2026-08-15):** `TASK-foundations` (monorepo, infra, Drizzle+PostGIS skeleton) and
`TASK-auth-tenancy` (identity, sessions, RLS enforced twice) have both landed. Email+password
login with cookie sessions works end to end in a real browser; every tenant table is protected
by the catalog test in `packages/db/src/queries/tenancy.spec.ts`. Next:
`TASK-design-system-shell`, then the build spine. The retired prototype was deleted by
`TASK-foundations` after tagging `prototype-v0`.

**Decided 2026-08-15:** no AlignUI PRO seat. The five PRO blocks in the Figma
(`Sidebar [Navigation]`, `Page Header`, `Widgets [HR Management]`, `Schedule Cards`,
`File Upload Cards`) are **rebuilt from free base components** as Flora composites —
design-spec §6.2 has the mapping. `AppSidebar` and `PageHeader` carry the real work and are
first-class deliverables of `TASK-design-system-shell`, not afterthoughts.

Next up: `docs/tasks/TASK-design-system-shell.md` — AlignUI CLI, shadcn chart, `AppSidebar` and
`PageHeader` rebuilt from free base components. Parallel with it (no file overlap except
`.env.example`): `TASK-domain-schema`, which is blocked on `TASK-auth-tenancy`'s
`packages/db/src/tenancy.ts` — every one of its tenant tables must go through it.

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
   holding colour values are `app/globals.css` and `components/charts/config.ts`
   (design-spec §10).
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
