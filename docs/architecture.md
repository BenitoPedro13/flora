# Flora — Architecture Specification

> **Status:** Draft v2, 2026-08-15. Supersedes v1 (Python/FastAPI/Earth Engine/Leaflet).
> No code has been written against this document yet.
> **Companion documents:** [`design-spec.md`](./design-spec.md) · `tasks/TASK-*.md`
> **Convention:** anything not personally verified is marked `[VERIFY: what to check and where]`
> and must be resolved *before* the code depending on it ships.

---

## 1. Context

### 1.1 What Flora is

Flora is an **operations console for a regenerative farm**. A farm manager opens it to answer,
in order of frequency:

1. What am I growing, where, and how is it doing? (Fields)
2. Which of my fields is in trouble right now? (Fields → Crop Stress)
3. What needs doing about it, and who is doing it? (Tasks)
4. How much of what do I have, and is the trend good? (Home)
5. What is the weather going to do to my plan? (Weather)

That ordering is deliberate and drives §16: it is the loop a farmer actually walks — look at
the crop, spot the problem, act on it, schedule around the weather. Everything that is not on
that loop is deferred (§4.3).

Every screen in the Figma is a specialisation of "field × time × measurement". That is the
spine of the domain model in §5.

### 1.2 What exists today, and what happens to it

The repo holds an 18-commit prototype (HEAD `e2d0f5e`): a Leaflet map where you draw a
polygon, and a Python FastAPI service asks Google Earth Engine for Sentinel-2 NDVI statistics
and a tile overlay. **It is being deleted, not extended.** The decision and its reasoning are
in §3.

Before deleting, tag it: `git tag prototype-v0 e2d0f5e`. The Earth Engine work is a correct
reference implementation of the NDVI maths and is worth being able to cite.

### 1.3 Goals

- **G1** — One coherent product built from the Figma design, on AlignUI.
- **G2** — Persist the domain. Fields, crops, tasks and observations survive a restart.
- **G3** — Satellite analysis must be *fast to read*. No imagery-provider call ever happens on
  a request path (§7). This is the defining constraint.
- **G4** — Multi-tenant from the first migration, even with one tenant. Retrofitting tenancy
  onto an agronomy schema costs far more than carrying it from the start.
- **G5** — One language. TypeScript across web, API, worker and shared packages, so a domain
  type is defined once and imported everywhere.

### 1.4 Non-goals for v1

- **Not** an agronomy engine. The Nitrogen Rx screen *displays* prescriptions; v1 does not
  compute them.
- **Not** mobile. The design is a fixed 1440 px desktop canvas with no mobile artboards.
- **Not** a carbon credit marketplace (§4.3).
- **Not** real-time. Sentinel-2 revisits every ~5 days; weather is hourly. Nothing here earns
  a WebSocket.
- **No** IoT or device ingestion. The only screen that needed it (Energy) is deferred (§4.3).

---

## 2. Stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + **Turborepo** |
| Web | **Next.js 16** App Router · React 19 · TypeScript |
| Design system | **AlignUI v1.2** on Tailwind CSS v4 · Remix Icon |
| Charts | **shadcn/ui `chart`** (Recharts v3) + 3 hand-rolled SVG components |
| Map | **Mapbox GL JS** via `react-map-gl` · `@mapbox/mapbox-gl-draw` · `turf` |
| API | **NestJS** (TypeScript), a separate service from the web app |
| Worker | **NestJS standalone app** consuming **BullMQ** |
| Queue / cache | **Redis 7** |
| Database | **PostgreSQL 16 + PostGIS 3.4**, **Drizzle ORM** + drizzle-kit |
| Object storage | **Cloudflare R2** (S3-compatible); MinIO locally |
| Satellite | **Sentinel Hub** via the Copernicus Data Space Ecosystem |
| Weather | **Open-Meteo** |
| Contracts | **Zod** schemas in `packages/contracts`, imported by both sides |

Versions are a snapshot, not a pin — verify against each project's own docs before installing.

---

## 3. Why the prototype is being replaced rather than extended

Three independent forces pointed the same way, and only the third is about code quality.

**3.1 Earth Engine is what forced Python.** Google ships Python and JavaScript bindings only;
there is no official Go client and the JS binding is a callback-era library. As long as the
imagery provider was Earth Engine, the backend language was effectively decided. Swapping to
Sentinel Hub — whose Process, Statistical and Catalog APIs are plain REST/JSON over OAuth2 —
removes that constraint entirely and is what makes a TypeScript backend possible.

**3.2 Earth Engine is the wrong shape for this product.** It is a research compute platform:
you submit an analysis and it runs across a cluster over the whole archive. Latency is
variable and unbounded, which is fine for science and wrong for a screen. Sentinel Hub is an
imagery *API* built to serve applications — one HTTP call returns a raster already clipped to
your polygon. The prototype's slowness is a direct consequence of that mismatch, compounded
by calling it synchronously on the request path.

**3.3 What is actually left to keep is knowledge, not code.** Once the provider changes and
the language changes, the only surviving artefacts would have been the NDVI band maths
(`(B08 − B04) / (B08 + B04)` — four lines) and the domain understanding, both of which carry
over into this document for free. Everything else — the Leaflet UI, the imperative
`DashboardControl`, the `create-next-app` shell, the mock-asserting tests — was scheduled for
replacement anyway.

**What carries forward conceptually:** the `SatelliteProvider` seam (kept, as a TypeScript
interface in `packages/satellite`), the cloud-cover filter at 20%, the median-composite
approach to cloud rejection, and the decision to clip the raster to the field boundary.

---

## 4. Product scope

Per-screen visual detail is in [`design-spec.md`](./design-spec.md); this records only what
each screen demands of the *system*.

### 4.1 In scope

| Screen | Figma node | System capability required |
|---|---|---|
| **Home** | `1:12913` | Cross-domain aggregation: stock by crop, fields at risk, water used, a composite regeneration score, a 12-month productivity series, a 6-month gathering-rate series, the task queue head, 2-day weather. KPI row re-sourced per §4.4. Pre-aggregated (§7.5) — this screen cannot fan out to six live queries. |
| **Fields — list** | `1:35172` | Field CRUD, per-field growth %, species, quantity, soil moisture, carbon-ton potential, centroid, activity tags. Search, filter, sort, import. |
| **Fields — Crop Stress** | `18:6567` | Raster overlay + per-field index statistics + persisted stress zones, each with area, date window, index value, mutable classification, mute/delete. Detection is a scheduled job. |
| **Fields — Management** | `15:8608` | Management-zone polygons, three goal scenarios, per-zone prescription table. **Storage and display only.** |
| **Tasks** | `24:11420` | Board / List / Timeline over tasks with status, field, progress, multi-assignee, activity tag, comment and subtask counts, date range. Drag between columns. |
| **Weather** | `3:5274` | 7-day forecast, wind speed + direction, UV index, precipitation probability, sunrise/sunset, pressure, per farm location. |

### 4.2 Not screens

`2043:6217` ("Frame 167") is a scratch board of chart widgets. The `2157:5410` "Referencias"
section and the loose `map` frames are design scraps. Excluded.

### 4.3 Deferred: Energy and Carbon Offset

**Energy (`3:5920`) is deferred by product decision.** It is a well-designed screen, but it
sits off the farmer's loop (§1.1): a farm manager's daily questions are about crops, fields,
stress and scheduling, not about turbine output. It also has no data source (§11.4), so
building it would mean inventing an ingestion story for numbers nobody is currently producing.
The screen, its entities and its integration notes stay documented — this is a sequencing
decision, not a deletion.

Three consequences, handled rather than ignored:

- **The sidebar loses its Energy entry.** Ship four destinations — Home, Fields, Tasks,
  Weather — rather than a nav item leading nowhere. Restoring it is one line.
- **Home's "Energy Generated" KPI tile has no source.** See §4.4.
- **The Regeneration Score loses its energy component** (§5.4).

**Carbon Offset (`3:6566`) remains deferred, blocked on design.**

`3:6566` is an unmodified AlignUI PRO fintech template: a Mastercard savings card, cargo
tracking Shenzhen → Tokyo, a wire-transfer table, and a **blue `#335CFF`** primary button
rather than Flora green. It appears in no sidebar. Building it would mean inventing the
carbon-credit domain from a logistics template. **Excluded from v1** pending a design pass.

### 4.4 Home's KPI row needs re-sourcing

Deferring Energy exposes a problem that was already there. Home's three KPI tiles are
**Crops Stocked · Energy Generated · Water Used**, and *two* of the three have no data source
in the design — Energy has no meter, and Water Used has no irrigation feed either. Dropping
Energy does not create this problem, it just makes it impossible to keep ignoring.

Proposed, and needing sign-off before Phase 4:

| Tile | Source | Available from |
|---|---|---|
| **Crops Stocked** — unchanged | `crop_cycles.quantity_kg` summed by crop | Phase 1 |
| **Fields at Risk** — *replaces Energy Generated* | count of fields with unmuted `stress_zones` | Phase 2 |
| **Water Used** — kept, re-sourced | volume on completed `watering` tasks | Phase 3 |

Two things make this the right shape rather than a patch. **Fields at Risk** is the single
number a farmer most wants on a landing screen, and it costs nothing because Phase 2 already
computes it. And **Water Used** stops being a phantom meter reading: the Tasks screen already
carries "Water 4 Acres of Wheat" under a `Watering` tag, so recording a volume when that task
completes turns irrigation into a by-product of work the farmer is already logging.

The layout is unchanged — three tiles plus the Crops Stocked donut, exactly as designed. Only
the middle tile's label, icon and source change.

`[VERIFY: confirm the swap with the design owner. If Energy Generated must stay on Home, it
needs a manual-entry path, which pulls a slice of §11.4 back into scope.]`

---

## 5. Domain model

### 5.1 Entities

```
Organization ─┬─< Membership >─ User
              └─< Farm ─┬─< Field ─┬─< CropCycle ──< Harvest
                        │          ├─< Observation          (time × index × field)
                        │          ├─< StressZone           (geometry, classified)
                        │          ├─< ManagementZone ──< Prescription
                        │          └─< Task
                        └─< WeatherSnapshot

  deferred (§4.3, not created in v1):  Farm ─< EnergyAsset ──< EnergyReading
```

### 5.2 PostGIS with Drizzle — the one schema decision that needs care

**Drizzle has no native PostGIS geometry type.** Its PostgreSQL column types cover only the
built-in geometric types `point` and `line`; PostGIS `geography`/`geometry` is not among them.
This is confirmed, not assumed.

The escape hatch is `customType`, which is a clean fit here because the wire format we want on
both sides is GeoJSON anyway:

```ts
// packages/db/src/types/geography.ts
import { customType } from 'drizzle-orm/pg-core'
import type { MultiPolygon } from 'geojson'

export const geographyMultiPolygon = customType<{
  data: MultiPolygon
  driverData: string
}>({
  dataType: () => 'geography(MultiPolygon,4326)',
  toDriver: (v) => JSON.stringify(v),      // wrapped in ST_GeomFromGeoJSON at the query site
  fromDriver: (v) => JSON.parse(v),        // produced by ST_AsGeoJSON at the query site
})
```

Every PostGIS *function* — `ST_Area`, `ST_Contains`, `ST_Centroid`, `ST_GeomFromGeoJSON`,
`ST_AsGeoJSON` — is called through Drizzle's `sql` template in `packages/db/src/queries/`.
This is a feature, not a workaround: spatial SQL is where the real logic lives and it stays
readable, in one place, and reviewable.

**Resolved 2026-08-15**, against a live `imresamu/postgis:16-3.4` instance
(`packages/db/src/queries/spike-roundtrip.ts`, TASK-foundations §2.5): node-postgres returns
`geography` columns as **WKB hex** (e.g. `0106000020E6...`), not GeoJSON text — confirmed by
selecting a `geography(MultiPolygon,4326)` column directly and observing the raw driver value.
`JSON.parse`-ing that throws, so the `customType` above is not what ships.

**What actually ships:** the fallback this section already named. `geographyMultiPolygon` (and
`geographyPolygon`, `geographyPoint`) in `packages/db/src/types/geography.ts` declare `data` as
`string` — the raw WKB hex — precisely so nothing treats a direct select as parsed GeoJSON. They
exist only to give `drizzle-kit generate` the correct column DDL. Every actual read and write
goes through `packages/db/src/queries/spatial.ts`, wrapping `ST_GeomFromGeoJSON` on insert and
projecting every select through `ST_AsGeoJSON(...)::json`.

The spike test proved the full chain on a known `MultiPolygon`: insert → read back is
structurally equal GeoJSON, and PostGIS `ST_Area` agrees with `turf.area` on the same polygon to
within 0.15% (well inside the 0.5% acceptance bar). A GIST bounding-box query on the spike table
confirmed an index scan via `EXPLAIN`, not a sequential scan.

### 5.3 Table notes

**`organizations`** — tenant root. Every tenant-scoped table carries `organization_id`,
denormalised onto leaf tables deliberately so tenancy predicates and index prefixes never
require a join. Row-Level Security on every such table.

**`farms`** — name, `location geography(Point,4326)`, `timezone` (IANA).

**Units decided 2026-08-15: acres and metric tonnes, fixed.** No per-farm `area_unit` column
in v1 — it was speculative configuration for a requirement nobody has. Instead:
**store canonical SI everywhere** (`m²`, `kg`) and convert at the edge through a single
`packages/contracts/src/units.ts`. Every acreage and tonnage in the UI goes through it. If
hectares are ever needed, that is one module and a user preference, not a schema migration
and an audit of every numeric display.

**`fields`** — `boundary geography(MultiPolygon,4326)`. MultiPolygon, not Polygon: real fields
get split by roads and watercourses and frequently have holes. Acreage is **derived** via
`ST_Area(boundary)` at read time — never stored, because a stored area silently diverges the
moment a boundary is edited. GIST index on `boundary`.

**`crop_cycles`** — `field_id`, `crop_id`, `planted_on`, `expected_harvest_on`, `status`
(`planned | growing | harvested | failed`), `growth_pct`, `quantity_kg`. Drives the field
card's "Growth 30%", "Specie Planted: Corn", "Crops Quantity 1.9 T". A field has at most one
`growing` cycle — enforced by a partial unique index, not application logic.

**`observations`** — the central time series.
`(organization_id, field_id, captured_on, index, stats jsonb, raster_key text, bbox jsonb,
scene_id text)` with `PRIMARY KEY (field_id, captured_on, index)`.
`index` is an enum: `ndvi | ndre | ndwi | evi | true_color`. `stats` is JSONB
(`min/max/mean/stddev/p10/p90`) rather than columns, so adding an index does not require a
migration. `raster_key` is the **R2 object key** for the rendered PNG — never a signed URL
(§18.4). `bbox` is the raster's geographic extent, needed to place it as a Mapbox image
source (§9.5).

**`stress_zones`** — `field_id`, `geometry geography(Polygon,4326)`, `detected_on`,
`window_start`/`window_end`, `classification` (`soil_issue | low_vigor | pest | water_stress |
unclassified`), `severity`, `index_value`, `muted_at`, `deleted_at`. Soft delete: the design
offers Delete on a detection card, and an operator deleting a true positive must stay
auditable.

**`management_zones`** / **`prescriptions`** — zone label, geometry, ordinal; then product
(`Urea`), unit (`lbs/ac`), `yield_goal`, `rate`, `scenario`
(`max_roi | balanced | max_yield`). The three scenario cards are three rows per zone, not
three columns.

**`tasks`** — `field_id` nullable, `title`, `status` (`todo | in_progress | done`),
`progress_pct`, `activity` (`watering | planting | fertilization | pest_control |
harvesting`), `starts_on`, `due_on`, `position numeric`.
`position` is `numeric`, not integer, so a drag-and-drop reorder is one row updated between
two neighbours rather than a renumbering of the column.
Plus **`task_assignees`**, **`task_comments`**, **`subtasks`** — the cards show `2` comments
and `1/5` subtasks.

**`energy_assets`** (`name`, `kind`, `rated_w`, `is_regenerative`) / **`energy_readings`**
(`PRIMARY KEY (asset_id, recorded_at)`) / **`batteries`**. **Deferred — not created in v1**
(§4.3). Recorded here so the shape is settled when the screen returns; the hour × weekday
heatmap is a `date_trunc('hour')` aggregate over readings.

**`weather_snapshots`** — `(farm_id, observed_at, horizon)` + JSONB payload. `horizon`
separates an actual from a forecast for the same timestamp, so forecast accuracy stays
measurable.

### 5.4 The Regeneration Score

Home shows a gauge reading **95**, with a secondary **86**. No formula exists in the design.

This is a **product decision and must not be invented in code.** v1 stores
`farm_scores (farm_id, computed_on, score, components jsonb)` and computes from a named,
versioned function in `apps/worker/src/scoring/`. Proposed — to be signed off, not assumed —
a weighted mean of three normalised components: mean NDVI against the crop's expected curve,
share of field area free of stress zones, and water use per tonne against baseline. (A fourth
— share of energy from regenerative sources — is dropped with the Energy screen, §4.3.)
`[VERIFY: confirm the intended definition before Phase 4. If it stays undefined, ship the
gauge reading a single component (stress-free area share) and label it honestly rather than
shipping a fabricated composite.]`

---

## 6. System architecture

### 6.1 Components

```
┌──────────────────────────────────────────────────────────────────┐
│  apps/web — Next.js 16 · React 19 · AlignUI · Mapbox GL          │
│  Server Components fetch · Client Components for map/charts/board │
└───────────────┬──────────────────────────────────────────────────┘
                │  HTTPS · JSON validated by packages/contracts (zod)
┌───────────────▼──────────────────────────────────────────────────┐
│  apps/api — NestJS                                                │
│  controllers → services → packages/db                             │
│  Reads Postgres + Redis only. Never calls Sentinel Hub inline.    │
└───┬───────────────────────────────┬──────────────────────────────┘
    │                               │ BullMQ enqueue
┌───▼─────────────────┐    ┌────────▼─────────────────────────────┐
│ PostgreSQL 16       │    │ Redis 7                               │
│ + PostGIS 3.4       │    │ BullMQ queues + cache                 │
└─────────────────────┘    └────────┬─────────────────────────────┘
                                    │
┌───────────────────────────────────▼──────────────────────────────┐
│  apps/worker — NestJS standalone + BullMQ                         │
│  satellite refresh · stress detection · weather poll · rollups    │
│  imports packages/db, packages/satellite, packages/contracts      │
└──────────┬────────────────────────┬──────────────────────────────┘
           │                        │
    Sentinel Hub (CDSE)      Cloudflare R2          Open-Meteo
    Process/Statistical/     rendered PNG rasters
    Catalog APIs
```

### 6.2 Why a separate API service rather than Next.js Route Handlers

Chosen deliberately, and it is the more expensive option, so the reason should be explicit:
the worker needs the same domain services as the API, and a standalone NestJS app can import
them directly as Nest modules. Collapsing the API into Next.js would leave the worker either
duplicating that logic or importing out of an app directory. The separation also keeps the
long-running scheduled work off Vercel's execution model entirely.

The cost is a third deploy target and a network hop that a single app would not have. Accepted.

### 6.3 Process inventory

| Process | Command | Scale |
|---|---|---|
| Web | `next start` | n replicas |
| API | `node dist/main` (Nest HTTP) | n replicas, stateless |
| Worker — default | BullMQ consumer, `default` queue | n replicas |
| Worker — satellite | BullMQ consumer, `satellite` queue, **concurrency 2** | 1 replica — see §7.2 |
| Scheduler | BullMQ repeatable jobs | registered once at boot |

The satellite worker's concurrency is pinned to 2 because that is the CDSE free tier's
concurrent-request ceiling (§11.1). The queue *is* the rate limiter — there is no separate
throttle to keep in sync.

---

## 7. The satellite pipeline

### 7.1 Why it is asynchronous

Sentinel Hub is fast for what it does, but a Process API call over a season is still seconds,
the free tier permits **2 concurrent requests and 10,000 requests/month**, and the Crop Stress
screen must render in under a second. These reconcile only by never doing both at once.

### 7.2 Write path — scheduled

```
BullMQ repeatable job, daily 03:00 farm-local
  └─ for each field with an active crop_cycle
       └─ satellite.refresh(fieldId, index)          [queue: satellite, concurrency 2]

           1. Catalog API — find the latest scene intersecting the field bbox
              with cloudCover < 20%. Skip if we already hold an observation
              for (field, sceneDate, index).
           2. Process API — ONE request, output float32 GeoTIFF, evalscript
              computing the index, clipped to the field boundary.
           3. In-worker: decode with geotiff.js →
                a. compute stats (min/max/mean/stddev/p10/p90)
                b. apply the colour ramp → PNG via sharp → upload to R2
                c. threshold + vectorise → candidate stress polygons
           4. Upsert `observations`; upsert `stress_zones` (preserving operator
              classifications and mutes on zones that still overlap).
```

**One request, three artefacts.** Requesting a float32 GeoTIFF rather than a display PNG means
the same call yields the statistics, the display raster, and the stress geometry. Using the
Statistical API for numbers plus a Process API call for the picture would cost two requests
and still leave nothing to vectorise.

**This is the only real computation in the system**, and it is small: a 512×512 raster is
~260k pixels, a few milliseconds in Node. The claim that this stack is IO-bound survives
because Sentinel Hub's evalscript does the per-pixel work on their servers.

**Backfill** — adding a field enqueues a bounded historical backfill for the Home charts. This
uses the **Statistical API**, not Process: it aggregates over a time range in one request and
returns numbers only, so 12 months of monthly means costs roughly one request instead of
twelve rasters. Low priority on the `satellite` queue.
`[VERIFY: the Statistical API's aggregation interval parameters and whether a 12-month monthly
aggregation is genuinely one request or one per interval — this materially changes quota
sizing.]`

**Failure** — BullMQ `attempts: 5`, exponential backoff with jitter. On exhaustion the field
records `last_refresh_error` and the UI shows a stale badge with the last-success date, never
a silent zero (NFR-8).

### 7.3 Read path

| Request | Source | Target |
|---|---|---|
| Field statistics | `observations` row | < 50 ms |
| Stress zones | `stress_zones` rows | < 50 ms |
| Raster image | R2 object, public CDN URL | < 100 ms |

Because rasters are pre-rendered PNGs in R2 behind a CDN, **the read path never touches
Sentinel Hub at all** — no tile proxy, no signed-URL refresh, no provider credentials near the
browser. This is the main architectural gain over the tile-proxy design v1 required for Earth
Engine.

### 7.4 Token handling

CDSE OAuth2 access tokens live **10 minutes**. `packages/satellite` caches the token in Redis
with a 60-second safety margin and refreshes on demand. Never stored in Postgres, never sent
to the browser.

### 7.5 Stress detection rules

Decided 2026-08-15. The design shows "8 stress detected · 24.1 ac" and per-zone areas of
1.9–4.5 ac, but states no rule. These are the rules; they live in
`apps/worker/src/satellite/detect.ts` behind a named, versioned function so a change is
visible in review rather than buried in a constant.

**Thresholds are relative, never absolute.** NDVI has no universal "stressed" value — corn at
V6 and corn at tasseling have completely different healthy baselines, and so do corn and soy
on the same day. An absolute cut-off would fire on every field in early season and never fire
in late season. The design agrees: the map legend carries a **`Relative`** dropdown
(design-spec §5.3), which only makes sense if the ramp is scaled to the field.

| Rule | Value | Why |
|---|---|---|
| Stress pixel | NDVI < **p10** of that field on that capture date | Percentile, not `mean − kσ` — robust to the skewed distributions real fields produce |
| Non-vegetation floor | pixels with NDVI < **0.10** are excluded entirely | Tracks, ponds, buildings and bare soil are not stressed crop; classifying them as stress trains the farmer to ignore the feature |
| Edge buffer | ignore a **10 m** inward buffer of the boundary | One Sentinel-2 pixel. Boundary pixels are contaminated by adjacent roads and treelines and are the single largest source of false positives |
| Minimum zone area | **0.5 acres** | Below this it is noise, and it is smaller than the machinery that would treat it |
| Maximum zone area | **4 acres** — larger contiguous regions are split into ≤ 4 ac zones | Operator decision. A 4 ac patch is one job; a 40 ac problem is not a "detection", it is a field-level failure and should not arrive as a to-do card |
| Scene validity | skip the date unless **≥ 70%** of in-field pixels are cloud/shadow-free per the Sentinel-2 SCL band | A partly-clouded scene produces confident nonsense |

**Severity**, which the `Sort: Priority` control needs, is the zone's own mean against the
field median for that date:

| Severity | Condition |
|---|---|
| `high` | zone mean ≤ 0.60 × field median |
| `medium` | ≤ 0.75 × field median |
| `low` | otherwise |

`Priority` sorts severity desc → area desc → most recent. The **`NEW`** badge marks zones
first detected within the last 7 days.

**Re-detection preserves operator input.** On each refresh, a new zone overlapping an existing
one by **≥ 50% of the smaller area** is treated as the same zone: its geometry and index value
update, but its operator-set `classification` and `muted_at` are kept. Otherwise every refresh
would silently discard a farmer's triage.

`[VERIFY: the design's detection popover reads "4.5 ac", which exceeds the 4 ac cap agreed
above. Either the cap splits it into two zones, or the popover is illustrative. Confirm —
this is cosmetic, not blocking.]`

### 7.6 Aggregation for Home

Home reads one materialised row per farm per day — `farm_daily_rollups (farm_id, day, payload
jsonb)` — rebuilt by a job after the satellite refresh completes. Home therefore issues one
query. Building it from six live aggregates would make the most-visited screen the slowest.

---

## 8. API surface

### 8.1 Conventions

`/api/v1` prefix, NestJS controllers. `camelCase` JSON — one language end to end means no
case translation layer. Cursor pagination (never offset; the board and field list sort by a
mutable `position`). Errors as RFC 9457 `application/problem+json` via a Nest exception
filter. `organizationId` is never a client-supplied parameter — it comes from the session.

### 8.2 Contracts

`packages/contracts` exports **zod** schemas as the single source of truth. NestJS validates
with them through a `ZodValidationPipe`; the web app imports the inferred types directly and
reuses the same schemas for form validation. **No codegen step, no drift.** NestJS also
publishes OpenAPI at `/api/docs` for documentation.

```ts
// packages/contracts/src/field.ts
export const fieldSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  boundary: multiPolygonSchema,
  areaHectares: z.number(),          // derived server-side, never accepted on write
  centroid: pointSchema,
})
export type Field = z.infer<typeof fieldSchema>
```

`[VERIFY: current zod major version and the matching NestJS integration — nestjs-zod vs a
hand-written pipe. Check both projects' docs rather than assuming the API shape above.]`

### 8.3 Endpoints

```
POST   /api/v1/auth/login | logout | refresh
GET    /api/v1/me

GET    /api/v1/farms
GET    /api/v1/farms/:id/dashboard              → farm_daily_rollups payload (Home)

GET    /api/v1/fields                           ?farmId=&q=&sort=&cursor=
POST   /api/v1/fields                           body: GeoJSON MultiPolygon
GET    /api/v1/fields/:id
PATCH  /api/v1/fields/:id
DELETE /api/v1/fields/:id
POST   /api/v1/fields/import                    multipart: GeoJSON/KML/zipped Shapefile

GET    /api/v1/fields/:id/observations          ?index=&from=&to=
GET    /api/v1/fields/:id/observations/dates    → the Crop Stress date picker
POST   /api/v1/fields/:id/observations/refresh  → 202 + jobId (manual re-run)

GET    /api/v1/fields/:id/stress-zones          ?sort=priority
PATCH  /api/v1/stress-zones/:id                 { classification | muted }
DELETE /api/v1/stress-zones/:id                 soft

GET    /api/v1/fields/:id/management-zones
GET    /api/v1/fields/:id/prescriptions         ?scenario=

GET    /api/v1/tasks                            ?status=&fieldId=&view=
POST   /api/v1/tasks
PATCH  /api/v1/tasks/:id                        { status, position } → drag-and-drop
POST   /api/v1/tasks/:id/comments

GET    /api/v1/farms/:id/weather                ?days=7
GET    /api/v1/farms/:id/energy/summary         ?from=&to=
GET    /api/v1/farms/:id/energy/heatmap         ?weeks=1
POST   /api/v1/energy/readings                  ingest (§11.4)
```

There is no tile endpoint. Rasters are R2 URLs returned inline on the observation
(§7.3).

---

## 9. Frontend architecture

### 9.1 Routing

```
apps/web/app/
├─ (auth)/login/page.tsx
└─ (app)/                          ← layout.tsx renders Sidebar + PageHeader
   ├─ page.tsx                     Home                          [1:12913]
   ├─ fields/
   │  ├─ page.tsx                  list + map                    [1:35172]
   │  └─ [fieldId]/
   │     ├─ stress/page.tsx        Crop Stress                   [18:6567]
   │     └─ management/page.tsx    Zone/Productivity/Nitrogen Rx [15:8608]
   ├─ tasks/page.tsx               board | list | timeline       [24:11420]
   ├─ weather/page.tsx                                           [3:5274]
   └─ energy/page.tsx                                            [3:5920]
```

Board/List/Timeline and Zone/Productivity/Nitrogen Rx are `?view=` and `?tab=` search params,
not routes — they share data and must not remount the map or the board on switch.

### 9.2 Server vs client

Default to Server Components. `"use client"` only for: the Mapbox map, charts, the Kanban
board, and AlignUI components wrapping Radix state. Initial paint data is fetched server-side;
TanStack Query takes over for mutations, optimistic drag-and-drop, and polling a manual
refresh job.

### 9.3 Directory convention

```
apps/web/
├─ components/
│  ├─ ui/          AlignUI base components + shadcn chart.tsx — vendored, edit only to fix bugs
│  ├─ charts/      chart compositions built on shadcn/Recharts + 3 hand-rolled SVG
│  ├─ map/         FieldMap, RasterOverlay, DrawControl, Legend, LabelLayer
│  └─ flora/       product composites: FieldCard, TaskCard, KpiTile, StressZoneRow, ...
└─ utils/          cn, tv, recursiveCloneChildren, Polymorphic   (required by AlignUI)
```

The `ui/` vs `flora/` split keeps the AlignUI upgrade path open.

### 9.4 Charts

`pnpm dlx shadcn@latest add chart` provides `ChartContainer`, `ChartTooltip`,
`ChartTooltipContent`, `ChartLegend`, `ChartLegendContent` and the `ChartConfig` type over
**Recharts v3**, themed through `--chart-*` CSS variables. Its **radial** chart covers the
Regeneration Score and Rain Chance gauges. Per-chart assignments are in design-spec §7.

Under Recharts v3 the tokens are referenced as `var(--chart-1)`, **not** `hsl(var(--chart-1))`
— the older form appears throughout blog posts and older shadcn examples and will silently
render nothing.

### 9.5 Responsive posture

**v1 targets desktop only.** There are no mobile or tablet artboards, and guessing a phone
layout for a Kanban board and a split map view would be inventing design, not implementing it.

But mobile is the *most likely* first post-v1 request — this is a product for people standing
in a field — so the cost of the retrofit is managed now, cheaply:

- Layout with fluid grid and flex containers plus `max-width`, never fixed pixel widths. The
  design's 1110 px content column becomes `max-w-[1110px]` inside a fluid parent.
- The shell degrades to ~1280 px without breaking; below that is explicitly unsupported and
  out of scope for QA.
- No `min-width` on the body that would force horizontal scrolling of the whole page.

That is the whole obligation. No breakpoints are designed or built until artboards exist.

### 9.6 Map

`mapbox-gl` via `react-map-gl`, with `@mapbox/mapbox-gl-draw` for boundary drawing and `turf`
for client-side area, centroid and bbox.

The Sentinel Hub raster is added as a Mapbox **`image` source** — a single PNG placed by its
four corner coordinates, taken from the observation's `bbox` — not as a tile source. One image
request, no tile pyramid, and it is exactly the clipped-to-boundary treatment Fields-01 shows.

Field boundaries are one GeoJSON source with `fill`, `line` and `symbol` layers; the label
pills in the design are a symbol layer with a text halo.

---

## 10. Authentication and tenancy

NestJS owns `users`, `organizations` and `memberships`. Access token 15 min, refresh token 30
days and rotating, stored hashed; both in `HttpOnly`, `Secure`, `SameSite=Lax` cookies.
Passwords hashed with **argon2id**.

Roles on `memberships`: `owner | manager | operator | viewer`. An `operator` can move tasks
and classify stress zones but cannot edit field boundaries or invite users.

**Tenancy is enforced twice** — a repository-layer filter *and* Postgres RLS as the backstop.
One missed `where` clause must not become a cross-tenant leak.

`[VERIFY: whether social login is required. If so, revisit — an external IdP weakens the
argument for backend-owned identity considerably.]`

---

## 11. External integrations

### 11.1 Sentinel Hub via Copernicus Data Space Ecosystem

Free tier, verified: **10,000 processing units/month · 300 PU/min · 10,000 requests/month ·
300 requests/min · 2 concurrent requests · access tokens valid 10 minutes.** Monthly reset,
no rollover.

At 50 fields refreshed daily on one index that is ~1,500 requests/month — comfortable. The
binding limits are **concurrency 2** (handled by pinning the satellite queue's concurrency,
§6.3) and possibly **processing units rather than request count**.
`[VERIFY: the Processing Unit formula — PU is derived from output size and band count, so a
full-resolution GeoTIFF costs more than one unit. Size the refresh job against PU, not
requests.]`

Copernicus Sentinel *data* is free for commercial use, but CDSE states the portal's other
contents are intended for non-commercial use, with commercial scale directed to Sentinel Hub
on CREODIAS. For a portfolio project this is fine; commercialising means a paid migration
against the same API.

The provider sits behind a `SatelliteProvider` interface in `packages/satellite` — the one
idea carried over from the prototype (§3).

### 11.2 Mapbox

Free tier, verified: **50,000 map loads/month** (a load = one GL JS initialisation, including
unlimited tile requests within that session), then $5/1,000 to 100k. Separately **750,000
raster tile requests/month**. At this product's scale — tens of users — usage lands around a
third of the free tier.

`[VERIFY: current Mapbox ToS on using GL JS with third-party tile sources. This restriction is
why MapLibre forked from GL JS v1.13, and it matters if the satellite basemap is ever sourced
elsewhere.]`

MapLibre remains a near-drop-in escape hatch — it is a fork of GL JS with a closely compatible
API — so this choice is reversible at low cost.

### 11.3 Open-Meteo

Covers every value on the Weather screen with no API key: 7-day forecast, hourly wind speed
and direction, UV index, precipitation probability, sunrise/sunset, surface pressure.
`[VERIFY: exact parameter names for uv_index, surface_pressure, precipitation_probability and
daily sunrise/sunset, plus licence terms for the intended deployment.]`

Polled hourly per farm by a repeatable job, persisted to `weather_snapshots`. The browser
never calls the provider — that would leak farm coordinates from the client and make the
screen unrenderable from cache.

### 11.4 Energy — deferred (§4.3)

Retained for when the screen returns. **The weakest-specified area of the design**, and the
reason it was the first thing deferred. The screen shows named physical assets with live
wattage, but no data source is implied. v1 exposes `POST /api/v1/energy/readings` (API-key
authenticated, per farm) plus a manual-entry form. No device protocol.
`[VERIFY: what actually produces these readings — inverter API, Modbus gateway, manual entry?
The answer materially changes the ingestion design.]`

### 11.5 Field import

GeoJSON, KML, and zipped Shapefile. `[VERIFY: a maintained TypeScript Shapefile parser —
this is where the Python ecosystem was genuinely stronger (fiona/pyogrio) and the JS options
need checking before committing to the format list.]` Import runs as a job with a
preview-then-commit step; silently importing 400 misprojected polygons is worse than failing.

---

## 12. Repository layout

```
flora/
├─ apps/
│  ├─ web/                Next.js 16 — AlignUI, Mapbox, charts
│  ├─ api/                NestJS — controllers, services, auth
│  └─ worker/             NestJS standalone — BullMQ consumers + schedules
├─ packages/
│  ├─ contracts/          zod schemas + inferred types (the API contract)
│  ├─ db/                 Drizzle schema, client, migrations, spatial queries
│  ├─ satellite/          Sentinel Hub client behind SatelliteProvider
│  └─ config/             shared tsconfig, eslint, tailwind presets
├─ infra/
│  └─ docker-compose.yml  postgis/postgis:16-3.4 · redis:7 · minio
├─ docs/
│  ├─ architecture.md · design-spec.md · tasks/TASK-*.md
├─ turbo.json
├─ pnpm-workspace.yaml
└─ package.json
```

`apps/frontend` and `apps/backend` are deleted (§3); `apps/web` and `apps/api` are fresh
scaffolds from `create-next-app` and `nest new`.

**Tooling.** pnpm workspaces, Turborepo for task orchestration and caching, drizzle-kit for
migrations, ESLint + Prettier, `tsc --noEmit` in CI, Vitest, Playwright.

**One command.** `pnpm dev` starts compose (Postgres+PostGIS, Redis, MinIO), then web, api and
worker through Turbo — no absolute paths, no globally-installed tools assumed.

---

## 13. Testing strategy

The prototype's tests asserted on values they fed their own mocks. The rule that follows:
**a test that cannot fail for a real reason is not a test.**

| Layer | Approach |
|---|---|
| `packages/db` and API | **testcontainers** with real `postgis/postgis:16-3.4` and real Redis. Never mock the database or the queue — for anything touching geometry, PostGIS behaviour *is* the thing under test. |
| Tenancy | A dedicated suite: authenticate as org A, assert **404** (not 403) on every org-B resource, against real RLS. |
| Sentinel Hub | Recorded HTTP fixtures (msw or nock) of real captured responses, replayed, with assertions on parsed output for a known input. Plus one `@live` test against the real API, excluded from CI. |
| Raster processing | Golden fixtures — a committed float32 GeoTIFF with known values, asserting computed stats within tolerance and a stable stress-polygon count. |
| Jobs | Real BullMQ against testcontainers Redis. The retry path is tested by making the provider fail, not asserted by reading a config object. |
| Web | Vitest + Testing Library; Playwright for task drag between columns, field draw → save, and stress-zone reclassify. |
| Visual | Playwright screenshots of each of the 7 screens at 1440×900, diffed against the Figma export. |

---

## 14. Deployment

| Concern | Choice |
|---|---|
| `apps/web` | Vercel |
| `apps/api`, `apps/worker` | One container image, two commands — Railway or Fly.io |
| Postgres | Managed **with PostGIS 3.4 available** — verify before choosing; not every provider ships it |
| Redis | Managed (Upstash or provider-native) |
| Object storage | Cloudflare R2, public-read bucket behind the CDN |
| Migrations | drizzle-kit, run as a release step, never on app boot |
| Secrets | `CDSE_CLIENT_ID/SECRET`, `MAPBOX_TOKEN`, `DATABASE_URL`, `REDIS_URL`, `R2_*`, `JWT_SIGNING_KEY` |
| Observability | Structured JSON logs, Sentry on all three, `/health` (liveness) + `/ready` (Postgres + Redis reachable) |

Every environment variable the code reads is listed in `.env.example`.

---

## 15. Non-functional targets

| # | Target |
|---|---|
| NFR-1 | Home TTFB < 300 ms p95, LCP < 1.5 s p95, cold cache, 50 fields |
| NFR-2 | `GET /fields/:id/observations` < 50 ms p95 |
| NFR-3 | Raster PNG served from R2/CDN < 100 ms p95 |
| NFR-4 | **Zero Sentinel Hub calls on any request path.** Enforced by a test asserting `packages/satellite` is not imported anywhere under `apps/api/src/controllers` |
| NFR-5 | Daily refresh of 200 fields completes within 30 min at concurrency 2 |
| NFR-6 | Monthly Sentinel Hub usage stays under 60% of the free tier at 200 fields — alert at 80% |
| NFR-7 | Cross-tenant suite: 100% of resource endpoints return 404 for a foreign-org id |
| NFR-8 | A field whose last refresh failed renders a stale badge with the last-success date — never a zero or a blank |
| NFR-9 | Task drag → optimistic UI, server confirm < 200 ms p95 |
| NFR-10 | Screenshot diff vs Figma ≤ 2% pixel delta per screen at 1440×900 |
| NFR-11 | Map interaction holds 60 fps while panning with 200 field polygons rendered |

---

## 16. Phasing

Ordered by the farmer's loop (§1.1), not by screen count. Crops and fields come first and
everything else is sequenced by how directly it serves them.

| Phase | Deliverable | Screens |
|---|---|---|
| **0 — Foundations** | Monorepo, Turbo, compose, Drizzle + PostGIS customType, Next + NestJS scaffolds, contracts, auth + tenancy + RLS, AlignUI install, **PRO blocks rebuilt from base components** (design-spec §6.2), app shell | shell |
| **1 — Fields & Crops** | Field CRUD, PostGIS boundaries, import, crop cycles, growth/species/quantity, Mapbox list + map | `1:35172` |
| **2 — Crop Stress** | `packages/satellite`, BullMQ + schedules, R2, GeoTIFF → stats + PNG + stress zones, detection review UI | `18:6567` |
| **3 — Tasks** | Task domain scoped to fields, board with drag, list, timeline, watering volumes (§4.4) | `24:11420` |
| **4 — Home** | Rollups, scoring, re-sourced KPI row (§4.4), all Home widgets | `1:12913` |
| **5 — Weather** | Open-Meteo ingest + console | `3:5274` |
| **6 — Management** | Zones, prescriptions, scenarios | `15:8608` |
| **deferred** | **Energy** — off the farmer's loop, no data source (§4.3) | `3:5920` |
| **deferred** | Carbon Offset — blocked on design (§4.3) | `3:6566` |

**Phases 1 → 2 → 3 are the spine and are hard-sequenced**: you cannot detect stress on a field
that does not exist, and a task board whose cards read "Field: Wheat 09" needs fields and crop
cycles first. That chain — register the crop, see it struggle, act on it — is the whole
product for a farmer, and it is shippable on its own without Home, Weather or Management.

4 and 5 are independent of each other. 6 is last because it displays prescriptions nobody
computes yet (§17 Q4).

---

## 17. Open questions

| # | Question | Blocks |
|---|---|---|
| ~~Q1~~ | ~~AlignUI PRO licence~~ — **RESOLVED 2026-08-15: no PRO seat.** The five PRO blocks are rebuilt from free base components as Flora composites (design-spec §6.2). | — |
| Q2 | The Regeneration Score formula (§5.4) | Phase 4 |
| Q3 | Home's KPI row re-sourcing — confirm the Fields at Risk / Water Used swap (§4.4) | Phase 4 |
| ~~Q4~~ | ~~Stress-zone thresholds~~ — **RESOLVED 2026-08-15.** Relative (p10) thresholds, 0.5 ac min, **4 ac max**, 10 m edge buffer, ≥70% clear scene. Full rules in §7.6. | — |
| ~~Q5~~ | ~~Units~~ — **RESOLVED 2026-08-15: acres + metric tonnes, fixed.** Store SI, convert at the edge (§5.3). | — |
| ~~Q6~~ | ~~Social login~~ — **RESOLVED 2026-08-15: no.** Email + password (argon2id), backend-owned identity (§10). Farm staff frequently have no work-linked Google account, and an external IdP would split identity from the tenancy model that lives in Postgres. Revisit only if an org asks for SSO. | — |
| ~~Q7~~ | ~~Mobile~~ — **RESOLVED 2026-08-15: desktop-only in v1, built to retrofit cheaply.** See §9.6. | — |
| Q8 | Who computes nitrogen prescriptions (§4.1) | Phase 6 |
| — | ~~What produces energy readings~~ — moot while Energy is deferred (§4.3) | deferred |

---

## 18. Alternatives considered and rejected

**18.1 Go for the API.** Rejected. With Sentinel Hub doing per-pixel work server-side, the
backend is HTTP orchestration and CRUD — IO-bound, where Go's throughput and concurrency
advantages do not materialise. The cost would be a second language, hand-maintained types
across the boundary, and a weaker ORM story for PostGIS. **Revisit if** raster processing is
ever brought in-house at volume.

**18.2 Staying on Python + Earth Engine.** Rejected — see §3. Provider mismatch, language lock,
and the user's stated weakness in Python.

**18.3 Single Next.js app with Route Handlers.** Rejected — see §6.2. Roughly half the code,
but the worker would have no clean way to share domain services.

**18.4 Storing signed raster URLs.** Rejected. Store the R2 object key; the public CDN URL is
composed at read time. A persisted signed URL expires in the database.

**18.5 Tile-proxying Sentinel Hub through the API.** Rejected. One map pan is dozens of tile
requests, which would exhaust a 10,000/month quota in days. Pre-rendered PNGs in R2 cost one
request per field per date and are faster to read (§7.3).

**18.6 Statistical API for numbers + Process API for the picture.** Rejected for the daily
refresh: two requests where one float32 GeoTIFF yields stats, picture and stress geometry
(§7.2). Still used for historical backfill, where no raster is needed.

**18.7 A stored `area` column on `fields`.** Rejected — derived via `ST_Area`, always (§5.3).

**18.8 Prisma instead of Drizzle.** Rejected. Neither has first-class PostGIS support, but
Drizzle's `sql` template makes the spatial escape hatch idiomatic rather than a foreign-key
into raw queries.

**18.9 shadcn/ui as the design system.** Rejected — only its `chart` component is used. The
Figma *is* AlignUI down to the token names (`bg/white-0`, `text/strong-950`) and the Remix
Icon set; rebuilding on shadcn would mean re-deriving every token by hand.

**18.10 MapLibre + a separate imagery vendor.** Rejected for v1. MapLibre is a free renderer
but ships no imagery, so it means assembling two vendors where Mapbox is one, at a scale where
Mapbox is free. Kept as a documented escape hatch (§11.2).
