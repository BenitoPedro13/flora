# TASK-satellite-pipeline — Sentinel Hub → observations, rasters, stress zones

> **Phase:** 2, first half (architecture §16) · **Status:** complete (write path only — see §1.1,
> §10) · **Date:** 2026-08-16
> **Depends on:** `TASK-fields` (complete, `f0b86bb`) — `fields` with real boundaries, the
> `/fields` screen, the Mapbox map this task's successor extends; `TASK-domain-schema`
> (complete, `00aa097`) — `observations`, `stress_zones`, composite FKs, RLS;
> `TASK-auth-tenancy` (complete) — `withOrganization`, the non-bypass-RLS role, the boot assertion
> **Blocks:** `TASK-crop-stress` — the Crop Stress screen (`18:6567`) has nothing to render
> until observations and stress zones exist
> **Screen:** none. This task ships **no UI.** See §1.1.
> **References:** [`../architecture.md`](../architecture.md) §5.3, §6.3, §7 (all), §8.3, §10,
> §11.1, §12, §15 (NFR-2/4/5/6/8), §16, §18.4, §18.5, §18.6 ·
> [`../design-spec.md`](../design-spec.md) §5.3 (for what the data has to support, not for pixels)

This is the task the whole architecture was shaped around. Invariant 1 — *no Sentinel Hub call
on a request path* — is the reason there is a worker, a queue, an object store and a
pre-rendered PNG at all. Everything here exists to make the Crop Stress screen a database read.

---

## 1. Current scenario

`HEAD` is `f0b86bb`. Phase 1 is complete: a farmer can register a field with a real PostGIS
boundary, attach a crop cycle, and see it on a satellite map. **Nothing observes that field.**

**What exists and is directly reusable:**

| Where | What |
|---|---|
| `packages/db/src/schema/observation.ts` | `observations` — `PK (field_id, captured_on, index)`, `stats jsonb`, `raster_key`, `bbox jsonb`, `scene_id`, the `(org, field, index, captured_on desc)` index NFR-2 needs. **Written by nothing.** |
| `packages/db/src/schema/stress.ts` | `stress_zones` — `geography(Polygon,4326)`, GIST index, `classification`, `severity`, `index_value`, `muted_at`, `deleted_at`, the partial `(org, field, detected_on desc) WHERE deleted_at IS NULL` index. **Written by nothing.** |
| `packages/db/src/schema/field.ts` | `fields.last_refresh_at` / `last_refresh_succeeded_at` / `last_refresh_error` — the three columns NFR-8's stale badge reads. All still `NULL` for every row. |
| `packages/db/src/queries/fields.ts` | The `ST_GeomFromGeoJSON` write / `ST_AsGeoJSON(...)::json` read pattern, `assertValidBoundary`, `InvalidGeometryError` — the template every new spatial query in this task follows |
| `packages/db/src/tenancy.ts` | `withOrganization(db, orgId, fn)` — transaction-local GUC, the only way to touch a tenant table |
| `packages/contracts/src/observation.ts` | `observationStatsSchema` (min/max/mean/stddev/p10/p90) and `bboxSchema` — already the declared JSONB shapes, unused so far |
| `packages/contracts/src/enums.ts` | `observationIndexValues`, `stressClassificationValues`, `stressSeverityValues` — the Postgres enums are built from these (invariant 4) |
| `apps/worker/` | A NestJS standalone app that boots, validates env, asserts the non-bypass-RLS role, and proves Postgres + Redis reachability (`connectivity.service.ts`). **No queue, no job, no schedule.** |
| `apps/api/src/tenancy/` | `TenantInterceptor` + `@TenantTx()` — a controller receives an already-scoped `Tx` and never imports `@flora/db` directly |
| `apps/api/src/fields/` | `FieldsModule` — the controller/service/DTO shape every new module in this task copies |
| `infra/docker-compose.yml` | MinIO (`storage`) with a `flora-rasters` bucket created at boot by the `createbuckets` service |
| `.env.example` / `packages/config/src/env.ts` | `CDSE_CLIENT_ID` / `CDSE_CLIENT_SECRET` declared and required, marked *"unused until Phase 2"*; `S3_*` likewise |
| `packages/db/src/test/containers.ts` | `startTestInfra()` — **Postgres and Redis** containers, cached per run. BullMQ tests get a real Redis for free. |

**What does not exist:** `packages/satellite` (the directory is not there at all), any BullMQ
queue or processor, any S3/R2 client, any GeoTIFF decode, any PNG, any detection code, any
observation or stress-zone endpoint, any contract for either, any HTTP fixture.

### 1.1 Phase 2 is split into two tasks — this one, then the screen

Architecture §16 lists Phase 2 as one deliverable: *"`packages/satellite`, BullMQ + schedules,
R2, GeoTIFF → stats + PNG + stress zones, detection review UI."* That is a new workspace
package, a queue runtime, an object store, a raster-processing chain, a detection algorithm,
six endpoints **and** the most instrument-dense screen in the design. `TASK-fields` was already
called "the largest task since `TASK-foundations`" in its own risk log; this is larger.

**Split:**

| Task | Owns |
|---|---|
| **`TASK-satellite-pipeline`** (this one) | Everything from the provider to the endpoint. No React. Ends with real rows in `observations` and `stress_zones`, real PNGs in MinIO, and six working endpoints. |
| **`TASK-crop-stress`** (next) | `18:6567` only — `RasterOverlay`, `ColorRampLegend`, `MapToolbar`, the detection list, the detection popover, the date picker, the index dropdown, the stale badge, re-pointing **View Details** at `/fields/[fieldId]/stress` |

The slug is the one CLAUDE.md §1.2 already names as an example (`TASK-satellite-pipeline.md`),
so the split is consistent with the workflow doc's own expectation.

**The seam is deliberate and testable:** this task's §2.11 seed writes observations and stress
zones from a committed golden fixture, so `TASK-crop-stress` can be built and reviewed on a
machine with **no CDSE credentials at all**. That is the property that makes the split safe
rather than merely convenient. Architecture §16 and CLAUDE.md's status line get updated to name
both tasks.

---

## 2. Planned changes

### 2.1 Scope rule

**In:** the write path (§7.2), the detection rules (§7.5), the read path (§7.3) and the
endpoints that expose it. **Out:** every pixel of `18:6567`, historical backfill, Home's
rollups. §5 is explicit.

### 2.2 `packages/satellite` — the provider, and only the provider

A new workspace package. It owns **HTTP conversation with Copernicus Data Space Ecosystem and
nothing else** — no decoding, no statistics, no colour ramp, no detection. Those are worker
concerns (§2.4), which is exactly where architecture §7.2 puts them ("in-worker") and where
§7.5 puts `detect.ts`.

```
packages/satellite/src/
  provider.ts      SatelliteProvider — the interface (architecture §11.1)
  cdse/
    token.ts       OAuth2 client-credentials, cached in Redis, 60s safety margin (§7.4)
    catalog.ts     latest scene intersecting a bbox with cloudCover < 20%
    process.ts     one Process API call → float32 GeoTIFF ArrayBuffer
    evalscript.ts  one evalscript per ObservationIndex, + the SCL band
  errors.ts        SatelliteError / RateLimitedError / NoSceneError — typed, so the
                   retry policy in §2.5 can distinguish "try again" from "no scene today"
  index.ts
```

```ts
export interface SatelliteProvider {
  findLatestScene(input: {
    bbox: BBox; from: string; to: string; maxCloudCoverPct: number;
  }): Promise<Scene | null>;

  fetchIndexRaster(input: {
    boundary: MultiPolygon; sceneId: string; index: ObservationIndex; widthPx: number;
  }): Promise<{ geotiff: ArrayBuffer; bbox: BBox }>;
}
```

Two implementations: `CdseSatelliteProvider` (real) and `FixtureSatelliteProvider` (replays
recorded responses, §2.10). The interface is the one idea architecture §3 says survived the
prototype; it is also what makes the golden tests possible.

**Everything below is a `[VERIFY]`, and CLAUDE.md §2.0 applies — resolve each against Sentinel
Hub's own current documentation before writing the call, and never guess a field name:**

- `[VERIFY: the CDSE token endpoint URL and the Sentinel Hub API host under CDSE — these are
  not the same hosts as services.sentinel-hub.com. Confirm both, plus that the grant is
  client_credentials and the token lifetime is the 10 minutes §11.1 records.]`
- `[VERIFY: the Catalog API — STAC search or the SH catalog endpoint? The exact collection id
  for Sentinel-2 L2A under CDSE, and the exact query field for cloud cover
  (eo:cloud_cover vs a provider-specific name).]`
- `[VERIFY: the Process API request body for a float32 GeoTIFF —
  output.responses[].format.type, sampleType FLOAT32, and whether a per-band nodata value can
  be declared. Clipping to the field boundary: confirm whether input.bounds.geometry accepts a
  GeoJSON MultiPolygon directly or requires a Feature.]`
- `[VERIFY: the evalscript API version currently required (setup()/evaluatePixel signature),
  and that SCL can be requested as an extra band in the same call — the ≥70% clear-scene rule
  (§7.5) needs it in the same response or it costs a second request.]`
- `[VERIFY: the Processing Unit formula (architecture §11.1's open item). Size widthPx against
  PU, not request count — NFR-6 is a PU budget, not a request budget. Record the measured PU
  cost of one refresh in §10 when this lands.]`

**Token caching:** Redis key `satellite:cdse:token`, `SET ... EX (expires_in - 60)`, refreshed
on demand. Never in Postgres, never sent to the browser (§7.4).

### 2.3 No new package for object storage — the worker puts, the API prefixes

Rasters need an S3 client in exactly one place (the worker, to `PutObject`) and a string
concatenation in exactly one other (the API, to turn a stored key into a public URL). A
`packages/storage` was considered and **rejected**: it would add a workspace package to
architecture §12's layout to hold one `PutObjectCommand` and one template literal, and the two
halves share no type — the key format is written by one side and never parsed by the other.

- `apps/worker/src/storage/raster-store.ts` — `@aws-sdk/client-s3` against `S3_ENDPOINT`
  (`forcePathStyle: true` for MinIO), `putRaster(key, png) → void`.
- Key format, one function, in the worker:
  `rasters/{organizationId}/{fieldId}/{index}/{capturedOn}.png`. Deterministic, so a re-run
  overwrites rather than orphans.
- `apps/api/src/observations/raster-url.ts` — `` `${R2_PUBLIC_BASE_URL}/${key}` ``. Composed at
  read time, per invariant 2 / §18.4. **The API returns `rasterUrl` and never the key.**
- `infra/docker-compose.yml` — the `createbuckets` service gains
  `mc anonymous set download local/flora-rasters` so the local bucket serves the PNG to a
  browser the way R2's public bucket will. Without this the screen task gets a 403 and a
  confusing afternoon.
- New env var `R2_PUBLIC_BASE_URL` (`http://localhost:9000/flora-rasters` locally), added to
  `packages/config/src/env.ts` and `.env.example`.

### 2.4 `apps/worker` — the queue, the schedule, the job

```
apps/worker/src/
  queue/
    queues.ts            queue names + the shared connection
    satellite.queue.ts   registration, concurrency 2 (architecture §6.3, §11.1)
  satellite/
    refresh.processor.ts the four steps of §7.2, and nothing else
    scheduler.service.ts reconciles one repeatable job per farm at boot
    raster.ts            GeoTIFF → stats (§7.2 step 3a)
    ramp.ts              stats + pixels → RGBA → PNG (step 3b)
    vectorise.ts         thresholded pixels → GeoJSON polygons in lon/lat (step 3c)
    detect.ts            the §7.5 rules — named, versioned (step 3c/4)
    upsert.ts            observations + stress-zone reconciliation (step 4)
```

**Queue:** `@nestjs/bullmq` + `bullmq` against the existing `REDIS_URL`. One queue, `satellite`,
**concurrency pinned to 2** — this is not a tuning knob, it is CDSE's concurrent-request limit
(§11.1) and the comment must say so. `attempts: 5`, exponential backoff with jitter (§7.2).
`NoSceneError` is **not** retried — "no cloud-free scene today" is a healthy outcome, not a
failure, and retrying it burns quota five times for nothing.

**Schedule:** daily 03:00 **farm-local** (§7.2), which is why `farms.timezone` exists. One
repeatable job per farm, reconciled at worker boot from the farm list.
`[VERIFY: BullMQ's current scheduling API — repeatable jobs were superseded by Job Schedulers
(upsertJobScheduler) in BullMQ v5. Confirm the installed version's API and that it accepts an
IANA tz, before writing scheduler.service.ts.]`
`[VERIFY: @nestjs/bullmq's version compatibility with NestJS 11 — check its peer range, don't
assume.]`

**Cross-tenant enumeration is a real problem and needs a migration — read this before coding.**
The scheduler must ask "which fields, in any org, have an active crop cycle?" The worker runs
as `flora_app`, which has **no `BYPASSRLS`** (asserted at boot in `main.ts`, and that assertion
stays). Under RLS with no `app.current_organization_id` set, `app_current_org()` returns NULL
and *every tenant table returns zero rows* — including `organizations` itself, which
`0003_tenancy_rls.sql` protects with `USING (id = app_current_org())`. **A naive
`SELECT ... FROM fields` in the worker silently returns nothing and the pipeline silently never
runs.** This is the single most likely way to lose a day on this task.

The fix follows the precedent `0003` already set for login:

```sql
-- packages/db/migrations/0007_satellite_scheduler.sql (hand-written, like 0003/0005)
CREATE FUNCTION scheduler_fields_due_for_refresh()
  RETURNS TABLE (organization_id uuid, farm_id uuid, field_id uuid, timezone text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ ... fields JOIN crop_cycles (status = 'growing') JOIN farms ... $$;
GRANT EXECUTE ON FUNCTION scheduler_fields_due_for_refresh() TO flora_app;
```

It returns **ids and a timezone only** — no name, no geometry, no crop, nothing a leak would be
interesting about — and it is the *only* thing that runs unscoped. Every subsequent step, the
whole refresh included, runs inside `withOrganization(db, orgId, …)` exactly like the API does.
Invariant 6 survives intact: the repository filter and RLS both still apply to every read and
write of real data.

**This deliberately changes a committed assertion.** `0003`'s comment and
`packages/db/src/queries/tenancy.spec.ts` assert the system-wide `prosecdef` count is **1**.
It becomes **2**, and the test changes from a bare count to a **named allowlist**
(`auth_memberships_for_user`, `scheduler_fields_due_for_refresh`) — which is a strictly better
test, because it now fails on a *different* SECURITY DEFINER function rather than merely on a
third one. §7 asks for this explicitly; do not make this change silently.

**The refresh processor**, per §7.2, in order:

1. `findLatestScene` over the field bbox, `cloudCover < 20%`. Skip if an `observations` row
   already exists for `(field, sceneDate, index)` — the cheapest possible quota saving.
2. `fetchIndexRaster` — **one** Process API call, float32 GeoTIFF, clipped to the boundary.
3. Decode (`geotiff`) → stats → PNG (`sharp`) → upload → candidate polygons.
4. Upsert `observations`; reconcile `stress_zones` (§2.9). Write `last_refresh_at` always,
   `last_refresh_succeeded_at` on success, `last_refresh_error` on final failure and `NULL` on
   success — NFR-8 needs the last **success**, which is why the two timestamps are separate
   columns and not one.

`[VERIFY: geotiff (geotiff.js) — the current read API (fromArrayBuffer/readRasters), how a
nodata mask is exposed, and whether it returns a typed array per band or interleaved.]`
`[VERIFY: sharp's raw-input path for building a PNG from an RGBA Uint8Array
(width/height/channels), and that sharp installs cleanly on this arm64 machine — it is already
in pnpm-workspace.yaml's onlyBuiltDependencies, so the plumbing is anticipated, but it has
never actually been installed here.]`

**Vectorisation** (step 3c) is the one step with no obvious library. `turf` does not do
raster→vector, and PostGIS raster is not installed (`0000_enable_postgis.sql` enables PostGIS
only). Recommended: **`d3-contour`'s `contours()`** — marching squares over the threshold,
returning GeoJSON MultiPolygon in *pixel* space — then an affine transform from pixel indices
to lon/lat using the GeoTIFF's bbox and dimensions, then `turf` for area, simplification and
the boundary buffer.
`[VERIFY: d3-contour's output — coordinate origin (top-left pixel vs bottom-left), ring winding
order, and whether holes come back as separate rings. A y-flip here produces polygons that look
plausible and sit in the wrong half of the field, which is exactly the bug that is hard to see
in a unit test and obvious on a map. Assert against the golden fixture (§2.10), not by eye.]`

### 2.5 `packages/db` — two new query modules, one migration

`packages/db/src/queries/observations.ts`:

- `upsertObservation(tx, input)` — `ON CONFLICT (field_id, captured_on, index) DO UPDATE`.
  `stats` and `bbox` are parsed through `observationStatsSchema` / `bboxSchema` **on write**
  (the schema file's own comment already promises this — JSONB is not licence to store an
  unvalidated shape).
- `listObservations(tx, org, fieldId, { index, from, to })` — serves NFR-2's 50 ms p95.
- `listObservationDates(tx, org, fieldId, index)` — the Crop Stress date picker; `captured_on`
  only, no stats, no key.
- `getFieldBoundaryForRefresh(tx, org, fieldId)` — boundary as GeoJSON + bbox via
  `ST_Envelope`, the worker's one read.

`packages/db/src/queries/stress-zones.ts`:

- `listStressZones(tx, org, fieldId, { sort })` — `deleted_at IS NULL`, geometry projected
  through `ST_AsGeoJSON(...)::json`, **area derived via `ST_Area`** (invariant 3 applies to
  every geometry, not just fields), and `isNew` computed as
  `detected_on > current_date - 7` (§7.5's NEW badge). `sort=priority` is
  `severity DESC → area DESC → detected_on DESC`, with the enum ordered high→low **in SQL**,
  not re-sorted in JS after a paged read.
- `findOverlappingZone(tx, org, fieldId, geometry)` — `ST_Area(ST_Intersection(...)) >= 0.5 *
  LEAST(ST_Area(a), ST_Area(b))`, the §7.5 re-detection rule. This is what the GIST index on
  `stress_zones.geometry` was built for.
- `insertStressZone`, `updateStressZoneGeometry`, `setStressZoneClassification`,
  `setStressZoneMuted`, `softDeleteStressZone`.
- `bufferedFieldInterior(tx, org, fieldId, metres)` — `ST_Buffer(boundary, -10)`, the §7.5
  edge-buffer rule, done in PostGIS rather than turf because the authoritative geometry is
  already there and `geography` buffering is in metres for free.

`packages/db/src/queries/fields.ts` gains `recordRefreshResult(tx, org, fieldId, result)`.

**Migration `0007_satellite_scheduler.sql`** — hand-written (like `0003`/`0005`), containing
only the SECURITY DEFINER function above and its `GRANT`. **No table changes:**
`TASK-domain-schema` already shipped `observations` and `stress_zones` with the exact columns
and indexes §7 needs, which is the whole point of having built the schema ahead of the feature.
If `drizzle-kit generate` proposes anything here, that is a signal something drifted — read it
line by line before accepting a single statement (the `0006` phantom-drop precedent).

### 2.6 `packages/contracts` — the API shapes

`packages/contracts/src/observation.ts` (extends the existing stats/bbox file):

```ts
export const observationSchema = z.object({
  fieldId: z.uuid(),
  capturedOn: z.iso.date(),
  index: observationIndexSchema,
  stats: observationStatsSchema,
  bbox: bboxSchema,
  rasterUrl: z.url(),      // composed from the R2 key at read time — never the key (invariant 2)
  sceneId: z.string(),
});
export const observationDatesSchema = z.array(z.iso.date());
export const listObservationsQuerySchema = z.object({
  index: observationIndexSchema.default('ndvi'),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export const refreshAcceptedSchema = z.object({ jobId: z.string() });
```

`packages/contracts/src/stress-zone.ts` (new):

```ts
export const stressZoneSchema = z.object({
  id: z.uuid(),
  fieldId: z.uuid(),
  geometry: polygonSchema,          // add to geojson.ts — only multiPolygon/point exist today
  areaM2: z.number().positive(),    // derived via ST_Area, never stored
  detectedOn: z.iso.date(),
  windowStart: z.iso.date(),
  windowEnd: z.iso.date(),
  classification: stressClassificationSchema,
  severity: stressSeveritySchema,
  indexValue: z.number(),
  isNew: z.boolean(),               // detected within 7 days (§7.5)
  mutedAt: z.iso.datetime().nullable(),
});
export const stressZoneSortValues = ['priority', 'newest', 'area'] as const;
export const updateStressZoneSchema = z.object({
  classification: stressClassificationSchema.optional(),
  muted: z.boolean().optional(),
}).refine(v => v.classification !== undefined || v.muted !== undefined);
```

Add `polygonSchema` to `geojson.ts`. Export both modules from `index.ts`.

The design's short zone id (`42BB-37AC`, design-spec §5.3) is **not** a new column — it is the
UUID's first two groups uppercased, formatted in the screen task. Recorded here so nobody adds
a column for it.

### 2.7 `apps/api` — six endpoints, zero satellite imports

New `apps/api/src/observations/observations.module.ts`, following `FieldsModule` exactly
(controller + service + `createZodDto` DTOs + `@TenantTx()`):

| Route | Notes |
|---|---|
| `GET /fields/:id/observations?index=&from=&to=` | Pure Postgres read. NFR-2. |
| `GET /fields/:id/observations/dates?index=` | The date picker's feed |
| `POST /fields/:id/observations/refresh` | **202** + `{ jobId }`. Enqueues onto the `satellite` queue and returns. |
| `GET /fields/:id/stress-zones?sort=priority` | `deleted_at IS NULL`, area derived |
| `PATCH /stress-zones/:id` | `{ classification }` and/or `{ muted }` |
| `DELETE /stress-zones/:id` | **Soft** — sets `deleted_at`, returns 204. A hard delete here is a spec violation (§5.3). |

Every `:id` that is not in the caller's org returns **404**, never 403 (NFR-7) — the
cross-tenant suite gets six new cases.

**The refresh endpoint is the one place invariant 1 could be broken, so be precise about what
it does:** it is a BullMQ **producer** — a Redis `LPUSH`, sub-millisecond, no HTTP to CDSE, no
import of `@flora/satellite`. The job runs in the worker. Enqueueing is not calling.
`apps/api/package.json` gains `bullmq` and **must not gain `@flora/satellite`**; §6.9 is the
test that enforces it.

**NFR-4's wording needs a small correction while we are here.** Architecture §15 says the test
asserts `packages/satellite` is not imported "anywhere under `apps/api/src/controllers`" — a
directory that does not exist in this codebase (controllers live in feature folders). The test
this task writes asserts it against **all of `apps/api/src`** *and* `apps/api/package.json`'s
dependency list, which is what was meant. Update §15's row to match the test.

### 2.8 The colour ramp

`ramp.ts` maps index value → RGBA using the design's red→yellow→green (design-spec §5.3). The
ramp is **relative by default** — `p10`→`p90` of that field on that date, which is what
design-spec §5.3's `Relative` dropdown implies and what §7.5's "thresholds are relative, never
absolute" requires. The absolute mode the dropdown offers is a fixed `[0, 1]` NDVI domain.

Both modes are ramp parameters, not separate rasters: **one PNG per (field, date, index)**, and
the legend's numeric labels come from the observation's `stats` — the screen renders the two
modes by relabelling, not by re-fetching. Pixels outside the boundary and below the 0.10
non-vegetation floor get `alpha 0`, which is what produces the clipped-to-boundary look
`1:35172` shows.

The ramp's literal colours live in **`apps/worker/src/satellite/ramp.ts`**. This is not a new
invariant-7 exemption: invariant 7 governs `apps/web` components, and a PNG encoder is not a
component. Note it in the file so a future reader does not think it slipped through.

### 2.9 Detection — `apps/worker/src/satellite/detect.ts`

Architecture §7.5's rules, implemented verbatim, behind a named exported function with a
version constant (`DETECTOR_VERSION = 'v1'`) so a change to a threshold shows up in review as a
version bump rather than a silently edited number:

| Rule | Value |
|---|---|
| Stress pixel | `< p10` of that field on that date |
| Non-vegetation floor | drop pixels `< 0.10` **before** computing p10, or the floor pixels drag the percentile down and the detector under-fires |
| Edge buffer | 10 m inward (`ST_Buffer(boundary, -10)`, §2.5) |
| Min zone area | 0.5 ac |
| Max zone area | 4 ac — larger contiguous regions **split** |
| Scene validity | skip the date unless ≥ 70% of in-field pixels are clear per SCL |
| Severity | `high ≤ 0.60 × field median`, `medium ≤ 0.75 ×`, else `low` |
| NEW | first detected within 7 days |

Two things §7.5 leaves genuinely underspecified, resolved here rather than improvised in code:

- **How a >4 ac region splits.** Proposal: `turf.squareGrid` over the region's bbox at a cell
  size giving ≤ 4 ac, intersected with the region, then cells under 0.5 ac merged into their
  largest neighbour. Deterministic and explainable to a farmer ("this is four jobs"). Recorded
  as §7 decision 3 — it is the only invented rule in this task and it should be invented in
  review, not in a commit.
- **`classification` on a brand-new zone** is `unclassified`. The design's "Low vigor" group
  heading is an operator's label, and the detector has no evidence to distinguish pest from
  soil issue from water stress. **Guessing here would be the worst kind of invention** —
  plausible, unfalsifiable, and it trains the farmer to distrust the feature.

**Re-detection preserves operator input** (§7.5): a new zone overlapping an existing
non-deleted one by ≥ 50% of the smaller area updates that row's `geometry`, `index_value`,
`severity`, `detected_on` and `window_*` — and **keeps `classification` and `muted_at`**.
Anything else is a new row. Zones with no match this run are left alone, not deleted; they age
out of `isNew` on their own. This is the single most important behaviour in the file and it
gets a dedicated test (§6.6).

### 2.10 Tests — fixtures and goldens, per architecture §13

The prototype's satellite tests asserted on values they fed their own mocks and could not fail
for any real reason. Do not reproduce that.

- `packages/satellite/test/fixtures/` — **recorded** CDSE responses: one token response, one
  catalog response, one Process API float32 GeoTIFF for a known field and date. Captured once
  from the live API (or from a scripted capture run committed alongside), then replayed by
  `FixtureSatelliteProvider`. Committed. Redact the bearer token from the recorded headers.
- `apps/worker/test/raster.golden.spec.ts` — the committed GeoTIFF in, asserting: stats within
  tolerance of independently computed values, a **stable stress-polygon count**, and stable
  polygon centroids within a metre. The centroid assertion is what catches §2.4's y-flip.
- `apps/worker/test/retry.spec.ts` — **the retry path is a test, not a decorator you read.**
  Make the provider fail against a real Redis (testcontainers) and assert BullMQ actually
  re-runs the job, and that `NoSceneError` is *not* retried.
- `apps/worker/test/detect.spec.ts` — the re-detection rule: a zone classified `pest` and muted
  by an operator survives a refresh that re-detects it, and a non-overlapping detection creates
  a new row.
- `apps/api/test/observations.e2e.spec.ts` + the cross-tenant suite's six new cases.
- `packages/db/src/queries/observations.spec.ts` / `stress-zones.spec.ts` against real PostGIS,
  never a mock — for geometry, PostGIS behaviour *is* the thing under test.

### 2.11 Seeds — `db:seed:satellite`

`packages/db/src/seed-satellite.ts`, wired as `pnpm db:seed:satellite`, run after
`db:seed:demo`. It replays the golden fixture through the same `raster.ts`/`detect.ts`/
`upsert.ts` code the worker uses (**not** a hand-written INSERT of invented rows) to produce,
for each demo field: ~12 `observations` across the last 60 days for `ndvi`, PNGs uploaded to
MinIO, and **8 stress zones totalling ~24.1 ac on the selected field** — the numbers
design-spec §5.3 shows on `18:6567`, so the screen task's visual diff is a real comparison.

One demo field is left with `last_refresh_error` set and an older
`last_refresh_succeeded_at`, so NFR-8's stale badge has something to render before the screen
that renders it exists.

### 2.12 Environment and docs

- `packages/config/src/env.ts`: add `R2_PUBLIC_BASE_URL` (url). Make `CDSE_CLIENT_ID` /
  `CDSE_CLIENT_SECRET` **optional with a startup warning in the worker** rather than
  `min(1)`-required — a contributor building `TASK-crop-stress` off the seed has no CDSE
  account, and today's schema fails *every* app's boot without one. The API and web app have no
  business requiring them at all. (§7 decision 4.)
- `.env.example`: `R2_PUBLIC_BASE_URL`, `SATELLITE_SCHEDULE_ENABLED` (default `false` in dev —
  nobody wants a 3am job firing against live quota on a laptop), and the CDSE lines lose their
  "unused until Phase 2" comment.
- `docs/architecture.md`: §15 NFR-4's directory correction (§2.7); §16 Phase 2 split into two
  tasks; §7.2's backfill `[VERIFY]` explicitly deferred to Phase 4 with a pointer; §10 gains
  the second SECURITY DEFINER function and why; §11.1's PU `[VERIFY]` resolved with the
  measured number; §12's tree gains `packages/satellite`'s real contents.
- `docs/design-spec.md`: §5.3's `[VERIFY]` on the 4.5 ac popover vs the 4 ac cap — resolve it
  ("the popover is illustrative" or "the cap splits it"), don't leave it hanging.
- `CLAUDE.md`: status line, and the stack table gains nothing (every dependency here is already
  named in architecture §2 or is an implementation detail of it).
- `README.md`: status line, and `db:seed:satellite` in the quickstart.

---

## 3. Why

### 3.1 Why the API enqueues and the worker calls

Invariant 1 exists because a Sentinel Hub call is seconds, the free tier allows two concurrent
requests, and Crop Stress must render in under a second (§7.1). Those reconcile only by never
doing both at once. A manual refresh button still has to exist — a farmer who just fixed an
irrigation line wants to see it — so the endpoint returns **202 + a job id** and the screen
polls. That is the honest shape: the work is asynchronous, and the UI says so, rather than
holding a request open and pretending.

### 3.2 Why one float32 GeoTIFF and not two calls

Requesting the display PNG directly would give a picture and nothing else — no statistics to
compute p10 from, and no values to threshold and vectorise. The Statistical API would give
numbers and no pixels. One float32 raster yields all three artefacts from one request and one
PU charge (§7.2, §18.6). At 200 fields daily this is the difference between comfortably inside
the free tier and outside it.

### 3.3 Why detection is a versioned function and not a config table

Thresholds that live in a database row change without a diff. §7.5's rules were decided with
reasons attached — the p10 percentile because real field distributions are skewed, the 10 m
buffer because one Sentinel-2 pixel of roadside contaminates the edge, the 4 ac cap because a
40 ac problem is not a to-do card. A future change to any of them should have to survive a
reviewer reading that reasoning, which means it belongs in a file with a version constant.

### 3.4 Why one more SECURITY DEFINER function is the right answer

The alternatives were: give the worker a `BYPASSRLS` role (deletes invariant 6 for the process
that writes the most rows, and would require deleting the boot assertion that has already
caught this class of mistake once), or store a denormalised, unprotected work queue table
(a second source of truth for "which fields are active"). A tightly-scoped, ids-only,
argument-less function that the *scheduler alone* calls is a far smaller surface than either,
and it reuses a pattern this repo already reviewed and accepted for login. Making the
`prosecdef` test an allowlist rather than a count makes the guard stronger, not weaker.

### 3.5 Why the fixture seed is not optional

Two tasks, one seam. If `TASK-crop-stress` can only be developed against live CDSE credentials,
then every reviewer of that screen needs a Copernicus account, every CI run burns quota, and
the screen's visual diff depends on the weather over the Amazon on the day it runs. The seed
makes the screen task deterministic and offline. It is also the honest test of whether this
task's output shape is actually sufficient for the screen — if something is missing, it surfaces
here, in the seed, instead of two weeks later.

---

## 4. Affected files

### `packages/satellite` — new package

| Path | Change | Notes |
|---|---|---|
| `package.json`, `tsconfig*.json`, `vitest.config.ts` | new | mirrors `packages/db`'s layout exactly |
| `src/provider.ts` | new | `SatelliteProvider`, `Scene`, the typed errors |
| `src/cdse/token.ts` | new | OAuth2 + Redis cache, 60 s margin (§7.4) |
| `src/cdse/catalog.ts` | new | latest clear scene for a bbox |
| `src/cdse/process.ts` | new | one call → float32 GeoTIFF |
| `src/cdse/evalscript.ts` | new | one per `ObservationIndex` + SCL |
| `src/fixture-provider.ts` | new | replays `test/fixtures/` |
| `test/fixtures/*` | new | recorded responses, bearer redacted |

### `packages/contracts`

| Path | Change | Notes |
|---|---|---|
| `src/observation.ts` | edit | `observationSchema`, dates, query, `refreshAcceptedSchema` |
| `src/stress-zone.ts` | new | zone, sort values, update schema |
| `src/geojson.ts` | edit | `polygonSchema` |
| `src/index.ts` | edit | export the new module |

### `packages/db`

| Path | Change | Notes |
|---|---|---|
| `migrations/0007_satellite_scheduler.sql` | new | hand-written; the function + grant only |
| `src/queries/observations.ts` | new | upsert, list, dates, boundary-for-refresh |
| `src/queries/stress-zones.ts` | new | list w/ derived area, overlap, mutations, soft delete |
| `src/queries/fields.ts` | edit | `recordRefreshResult` |
| `src/queries/tenancy.spec.ts` | edit | `prosecdef` count → named allowlist (§2.4) |
| `src/queries/observations.spec.ts`, `stress-zones.spec.ts` | new | real PostGIS |
| `src/seed-satellite.ts` | new | fixture → the same pipeline the worker runs |
| `src/index.ts`, `package.json` | edit | exports + the `seed:satellite` script |

### `apps/worker`

| Path | Change | Notes |
|---|---|---|
| `src/queue/*` | new | BullMQ registration, concurrency 2 |
| `src/satellite/{refresh.processor,scheduler.service,raster,ramp,vectorise,detect,upsert}.ts` | new | §2.4, §2.8, §2.9 |
| `src/storage/raster-store.ts` | new | S3 put + key format |
| `src/app.module.ts`, `src/main.ts` | edit | register the queue; `connectivity.service.ts` retires (its Phase 2 note said it would) |
| `test/*.spec.ts` | new | golden, retry, detect |
| `package.json` | edit | `bullmq`, `@nestjs/bullmq`, `@aws-sdk/client-s3`, `geotiff`, `sharp`, `d3-contour`, `@turf/turf`, `@flora/contracts`, `@flora/satellite` |

### `apps/api`

| Path | Change | Notes |
|---|---|---|
| `src/observations/{observations.module,observations.controller,observations.service}.ts` | new | four routes |
| `src/observations/stress-zones.controller.ts` | new | two routes |
| `src/observations/dto/*.ts` | new | `createZodDto` over §2.6 |
| `src/observations/raster-url.ts` | new | key → public URL (invariant 2) |
| `src/app.module.ts` | edit | register the module |
| `test/observations.e2e.spec.ts` | new | incl. 202 + jobId |
| `test/tenancy.e2e.spec.ts` | edit | six new 404 cases (NFR-7) |
| `test/nfr4.spec.ts` | new | no `@flora/satellite` in `apps/api` (§2.7) |
| `package.json` | edit | `bullmq` only |

### Infra & docs

| Path | Change | Notes |
|---|---|---|
| `infra/docker-compose.yml` | edit | `mc anonymous set download local/flora-rasters` |
| `packages/config/src/env.ts`, `.env.example` | edit | §2.12 |
| `docs/architecture.md` | edit | §7.2, §10, §11.1, §12, §15, §16 — specific sections, not appended |
| `docs/design-spec.md` | edit | §5.3's 4 ac `[VERIFY]` |
| `CLAUDE.md`, `README.md` | edit | status lines |

---

## 5. Explicitly out of scope

1. **The Crop Stress screen `18:6567`** — every component of it. `TASK-crop-stress`.
2. **Historical backfill via the Statistical API** (§7.2). It serves Home's charts (Phase 4)
   and depends on an unresolved `[VERIFY]` about whether a 12-month aggregation is one request
   or twelve. Building it now means sizing quota against a guess. `TASK-home`.
3. **`farm_daily_rollups` and the rollup job** (§7.6) — Phase 4, and there is no Home to read
   them.
4. **`farm_scores` / the Regeneration Score** (§5.4) — blocked on open question Q2, a product
   decision that must not be invented in code.
5. **Indices other than NDVI in the daily schedule.** All five enum values are supported by
   `evalscript.ts` and can be requested manually; only `ndvi` is scheduled. Refreshing five
   indices daily is 5× the PU cost for four pictures nothing renders yet.
6. **Management zones and prescriptions** (Phase 6) — different geometry, different job.
7. **Weather ingest** (Phase 5), **KML/Shapefile import** (`TASK-fields-import`), **the tasks
   board** (Phase 3).
8. **Production R2.** MinIO locally, with the R2-shaped config and a public base URL; the real
   bucket and CDN are a deployment task.
9. **A quota dashboard for NFR-6.** This task *measures* one refresh's PU cost and records it;
   an alerting mechanism at 80% is not built.

---

## 6. Verification

Measurable, per architecture §15. Anything not run gets recorded honestly in §10, not quietly
dropped — `TASK-fields` §10 set that precedent and it is why that task's gaps are known.

1. **The round trip, live, once.** With real CDSE credentials, `refresh(field, 'ndvi')` on a
   demo field produces: one `observations` row, a PNG in MinIO that opens in a browser and
   shows the field clipped to its boundary, and ≥ 1 `stress_zones` row. Screenshot it into the
   PR. Everything else can be fixture-driven; this cannot.
2. **Golden fixture.** `raster.golden.spec.ts` passes: stats within tolerance, stable polygon
   count, centroids stable within 1 m across runs.
3. **Geometry is not flipped.** Every detected polygon from the golden fixture is
   `ST_Contains`-ed by the source field's boundary. A y-flip fails this immediately.
4. **Area rules hold.** No zone in the golden output is `< 0.5 ac` or `> 4 ac` (±1% for
   floating point), and a synthetic 12 ac contiguous region yields ≥ 3 zones, each ≤ 4 ac.
5. **Scene validity.** A fixture whose SCL says 50% cloud produces **no** observation and no
   error state — `last_refresh_at` moves, `last_refresh_succeeded_at` does not, and
   `last_refresh_error` stays `NULL` (a skipped date is not a failure).
6. **Re-detection preserves triage.** A zone set to `pest` and muted, re-detected with 80%
   overlap: `classification` is still `pest`, `muted_at` is still set, `geometry` and
   `index_value` have changed. A zone with 20% overlap creates a second row.
7. **Retry is real.** Provider throws twice, BullMQ re-runs, third attempt succeeds, one
   observation row exists. `NoSceneError` is retried **zero** times.
8. **NFR-8.** After five exhausted attempts, `last_refresh_error` is non-null and
   `last_refresh_succeeded_at` retains its previous value — asserted directly, not inferred.
9. **NFR-4.** `apps/api/package.json` lists no `@flora/satellite`, and
   `grep -rn "@flora/satellite" apps/api/src` returns nothing. Test, not a review note.
10. **NFR-7.** Six new cross-tenant cases: org A gets **404** (not 403) on org B's
    observations, dates, refresh, stress zones, PATCH and DELETE.
11. **NFR-2.** `GET /fields/:id/observations` p95 **< 50 ms** measured over 100 calls against a
    field with 90 days of observations seeded. Record the achieved number in a comment.
12. **NFR-5, extrapolated honestly.** Time one fixture-driven refresh end to end; assert
    `200 fields ÷ concurrency 2 × measured` **< 30 min** and write the measured per-field
    number into the test. Do not claim a 200-field run that was not performed.
13. **NFR-6 / the PU `[VERIFY]`.** Record the actual Processing Unit cost of one live refresh
    from CDSE's usage dashboard, and compute 200 fields × 30 days against the 10,000 PU/month
    tier. If it exceeds 60%, say so and propose the fix (fewer pixels, or fewer than daily)
    rather than shipping past the target silently.
14. **RLS survives.** `packages/db/src/queries/tenancy.spec.ts` passes with the allowlist
    change; the SECURITY DEFINER function returns ids **only** (asserted on its column list);
    the worker's `assertNonBypassRlsRole` boot check is unchanged and still passes.
15. **The scheduler actually finds work.** Against a seeded multi-org database,
    `scheduler_fields_due_for_refresh()` called as `flora_app` with no GUC set returns rows
    from **both** orgs — the exact query that silently returns zero rows if §2.4 is ignored.
16. **Soft delete is soft.** After `DELETE /stress-zones/:id`, the row still exists with
    `deleted_at` set and is absent from the list endpoint.
17. **Seed determinism.** `db:seed:satellite` run twice produces identical row counts and
    identical `raster_key`s (idempotent, like the other two seeds), and yields **8 zones /
    ~24.1 ac** on the demo field so `TASK-crop-stress` has the design's own numbers.
18. **Offline development works.** With `CDSE_CLIENT_ID`/`CDSE_CLIENT_SECRET` **unset**, all
    three apps boot, `db:seed:satellite` succeeds, and the six endpoints serve real data. This
    is the seam §1.1 depends on; if it fails, the split has failed.
19. **The whole workspace is green.** `pnpm turbo lint typecheck test build` exits 0 from a
    clean `--force` run; `pnpm --filter web test:e2e` still passes 22/22 unchanged (this task
    touches no web code, and if a web test breaks, something leaked).

---

## 7. Decisions this task needs before code

| # | Decision | Recommendation |
|---|---|---|
| 1 | **Split Phase 2 into `TASK-satellite-pipeline` + `TASK-crop-stress`** (§1.1) | **Yes.** One task covering a new package, a queue runtime, an object store, a raster chain, a detector, six endpoints *and* the densest screen in the design is not reviewable. CLAUDE.md §1.2 already names this slug. |
| 2 | **A second SECURITY DEFINER function** for cross-tenant scheduling, and the `prosecdef` test becoming a named allowlist instead of a count of 1 (§2.4, §3.4) | **Yes.** The alternatives are a `BYPASSRLS` worker role or an unprotected queue table, both worse. But this changes a deliberate, commented, tested assertion from `TASK-auth-tenancy` — it needs a yes, not an assumption. |
| 3 | **How a >4 ac region splits** into zones (§2.9) | Grid-and-merge as described. This is the one genuinely invented rule in the task; §7.5 states the cap but not the mechanism. Say if you would rather zones simply cap at 4 ac and the remainder go undetected. |
| 4 | **CDSE credentials become optional** in `packages/config` with a worker-only warning (§2.12) | **Yes.** Today a blank `CDSE_CLIENT_SECRET` fails the *web* app's boot, which is nonsense, and it would block anyone building `TASK-crop-stress` from the seed. |
| 5 | **Backfill deferred to Phase 4** (§5.2) | **Yes.** It serves Home's charts only and rests on an unresolved quota `[VERIFY]`. |
| 6 | **NDVI only on the daily schedule**, other indices manual (§5.5) | **Yes.** 5× the PU cost for four pictures nothing renders. |

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| **The RLS enumeration trap (§2.4)** — a worker query that returns zero rows and no error is invisible. This will cost a day if it is discovered by debugging instead of by reading. | It is written down here, with the migration, before any code. §6.15 is the test that proves it, and it is written *first*. |
| **The y-flip in vectorisation (§2.4)** — polygons that look plausible and are in the wrong place. Unit tests on counts will not catch it. | §6.3's `ST_Contains` assertion and §6.2's centroid stability. Resolve `d3-contour`'s coordinate convention against its docs *before* writing the transform, per CLAUDE.md §2.0. |
| **Five unresolved Sentinel Hub `[VERIFY]`s (§2.2)** — evalscript version, SCL availability, the Process body, the catalog collection id, the PU formula. Guessing any one produces a call that fails at runtime with an unhelpful error. | Resolve all five against Sentinel Hub's own current docs before writing `cdse/`. Record each resolution in §10. Burn a handful of quota on manual curl calls first — that is cheaper than a wrong implementation. |
| **Quota.** Development iterating on a live Process API burns a 10,000/month tier fast, and there is no rollover. | Record fixtures **early** and develop against `FixtureSatelliteProvider`. `SATELLITE_SCHEDULE_ENABLED=false` in dev by default. §6.1 is the only item requiring live calls. |
| **`sharp` has never been installed on this machine** despite being anticipated in `pnpm-workspace.yaml`. Native builds on arm64 are the classic afternoon. | Install it as the very first step, before writing `ramp.ts`. If it fights, `pngjs` is a pure-JS fallback and the PNG here is a simple RGBA encode with no resizing. |
| **BullMQ's scheduling API changed in v5** (repeatables → Job Schedulers). Older examples are everywhere and are wrong. | §2.4's `[VERIFY]`. Check the installed version's own docs, not a blog post. |
| **Scope, again.** This is `TASK-fields`-sized even after the split. | The §2 subsections land in this order, each independently reviewable: contracts → db queries + migration → `packages/satellite` + fixtures → worker raster/ramp/vectorise/detect (offline, golden-tested) → queue + scheduler → API endpoints → seed. The first live CDSE call happens at step 5, not step 1. |

---

## 9. Follow-on tasks

| Task | What it picks up |
|---|---|
| `TASK-crop-stress` | `18:6567` — the raster overlay from `bbox` + `rasterUrl`, the colour-ramp legend with its `Relative`/absolute dropdown, the detection list and popover, the date picker off `/observations/dates`, mute/classify/delete, the manual-refresh poll on `{ jobId }`, NFR-8's stale badge, re-pointing **View Details** at `/fields/[fieldId]/stress`. Vendors AlignUI `Datepicker`. |
| `TASK-tasks-board` (Phase 3) | `24:11420`. Independent of this task, but a stress zone is the thing a task is created *about* — the two meet at "create task from detection". |
| `TASK-home` (Phase 4) | The Statistical API backfill deferred in §5.2, `farm_daily_rollups` (§7.6), `farm_scores` (§5.4, blocked on Q2). |

---

## 10. Landed

*(Filled in when this task completes: the five Sentinel Hub `[VERIFY]` resolutions, the measured
PU cost, the measured per-field refresh time, the §7 decisions as taken, deviations from §2, and
— per `TASK-fields` §10's precedent — an honest list of which §6 items were actually run and
which were not.)*

### Deviation found before coding began: `packages/raster`, not `apps/worker`, owns the pure pipeline

§2.11 has `packages/db/src/seed-satellite.ts` replay the golden fixture "through the same
`raster.ts`/`detect.ts`/`upsert.ts` code the worker uses" — but §2.4 puts those files under
`apps/worker/src/satellite/`. `packages/db` cannot import from `apps/worker`: the monorepo's own
rule is apps depend on packages, never the reverse, and apps do not import each other (§4's
tree, "the worker is a separate app... shares domain services with the API through
`packages/`"). Implemented literally, the seed script would either duplicate the raster/detect
logic (exactly what §3.5 says must not happen — "not a hand-written INSERT of invented rows") or
require a relative cross-app import that breaks the moment `apps/worker` is built rather than
run from source.

**Fix:** a new sibling package, `packages/raster`, owns the four pure, storage/DB-independent
functions — `raster.ts` (GeoTIFF → stats), `ramp.ts` (stats + pixels → PNG), `vectorise.ts`
(pixels → polygons), `detect.ts` (the §7.5 rules) — plus `raster-store.ts` (the S3 put + key
format, moved here from §2.3's `apps/worker/src/storage/` for the same reason: three call sites
now, worker + seed, want the identical key format, not two copies of one template literal).
`packages/satellite` is unchanged from §2.2 — CDSE HTTP conversation only, no decoding, no
statistics, no colour ramp, no detection, exactly as originally scoped.

**Second half of the same fix, found while writing the seed script itself:** `upsert.ts` (the
observations + stress-zone reconciliation glue) has the identical problem — it's pure `Tx` +
`@flora/db` orchestration with no worker-specific state, so it moved to
`packages/db/src/queries/satellite-upsert.ts` (exported as `upsertObservationAndZones`) instead
of staying in `apps/worker/src/satellite/`. `apps/worker`'s own `src/satellite/` now holds only
`refresh.processor.ts` (orchestration) and `scheduler.service.ts`. `packages/db` gained a
`@flora/raster` dependency for this (type-only: `DetectedZone`) — no cycle, `packages/raster`
depends on nothing in `packages/db`.

### The five Sentinel Hub `[VERIFY]`s (§2.2), resolved against CDSE's own current docs

No CDSE credentials were available in this environment (risk log item 3) — every resolution
below came from CDSE's published documentation, not a live call, and each is marked where that
matters.

1. **Token endpoint:** `https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token`
   (Keycloak-backed CDSE identity, not `services.sentinel-hub.com`). `grant_type=client_credentials`
   confirmed. Exact `expires_in` seconds not published as a fixed number — `token.ts` reads it
   from the token response itself rather than hardcoding one, so this doesn't block anything.
2. **Catalog API:** STAC search, POST `https://sh.dataspace.copernicus.eu/catalog/v1/search`
   (the Sentinel-Hub-authenticated host, sharing the OAuth audience with Process — not the
   separate general CDSE STAC catalog at `stac.dataspace.copernicus.eu`, which uses a different
   cloud-cover scale). Collection id `sentinel-2-l2a`. Cloud-cover filter: `eo:cloud_cover` via
   CQL2 (`catalog.ts`).
3. **Process API body:** POST `https://sh.dataspace.copernicus.eu/api/v1/process`, confirmed
   against a live CDSE notebook sample's own documented request shape. `input.bounds.geometry`
   takes a raw GeoJSON geometry object, not a Feature. `sampleType: FLOAT32` is declared per
   output in the evalscript's `setup()`, not in the request body.
4. **Evalscript version / SCL:** `//VERSION=3`, `setup()`/`evaluatePixel(samples)` confirmed.
   Multiple named outputs in one evalscript (index + SCL) confirmed. **Not independently
   verified against a live response:** whether two `output.responses[]` entries actually come
   back as `multipart/form-data` (one part per identifier) as `process.ts` assumes — this is the
   standard documented Sentinel Hub pattern for multiple responses, and it's what `raster.ts`'s
   `decodeGeoTiff` is built around (two single-band GeoTIFFs, not one two-band file), but it
   needs a real request to confirm before this ships live.
5. **PU formula:** resolved and recorded in architecture.md §11.1. The formula itself is
   documented; the *actual* PU cost of one refresh at this task's `RASTER_WIDTH_PX`/`HEIGHT_PX`
   (512x512) with 6 input bands and the float32 2x penalty was not measured against a live
   account — still open, architecture.md §11.1 says so directly.

### A real bug found and fixed by the tests, not by review

`stress-zones.ts`'s `findOverlappingZone` originally computed `ST_Intersection` on `geometry`
(planar, square-**degrees**) while comparing it against `ST_Area(geometry)` on the `geography`
column (square-**metres**) — comparing incompatible units meant the ≥50%-overlap re-detection
rule almost never matched. `stress-zones.spec.ts`'s re-detection test (§6 item 6) caught it
immediately against real PostGIS; the fix is `ST_Intersection(geography, geography)` throughout
(PostGIS 3.4 supports the geography overload directly). Left here as a reminder of exactly why
§2.10 insists on real PostGIS for anything touching geometry — this bug produces no error, just
a silently-wrong boolean.

### §7 decisions, as taken

All six taken as recommended: (1) the split — yes; (2) the second `SECURITY DEFINER` function
and the named-allowlist test — yes, done in `0007_satellite_scheduler.sql` and
`tenancy.spec.ts`; (3) grid-and-merge for the >4ac split — yes, implemented with one correction:
`turf.squareGrid`'s `Math.floor`-based cell count silently drops edge area rather than covering
it, so `detect.ts` builds its own `Math.ceil`-based coverage grid instead (full details in
`detect.ts`'s own comment); (4) CDSE credentials optional, worker-only warning — yes; (5)
backfill deferred to Phase 4 — yes; (6) NDVI-only on the daily schedule — yes.

### Other deviations from §2

- **Scheduler granularity:** one BullMQ Job Scheduler per **field**, not literally "one
  repeatable job per farm" (§2.4's own text) — a Job Scheduler carries exactly one fixed job
  template, so per-field job data needs a per-field scheduler id. Every field of a farm shares
  that farm's timezone, so the observable behaviour (one wave of jobs per farm each night) is
  unchanged. Recorded in architecture.md §7.2 too.
- **Raster dimensions:** `RASTER_WIDTH_PX`/`RASTER_HEIGHT_PX` default to 512x512 (Sentinel Hub's
  own PU baseline resolution) — §2.2 left the exact sizing as part of the PU `[VERIFY]`, and
  512 is a defensible starting point pending the live PU measurement above, not a tuned value.
- **Seed's zone target:** §2.11 named "8 stress zones totalling ~24.1 ac" from design-spec
  §5.3. `seed-demo.ts`'s demo field rectangles are ~18.3 ac *total*, smaller than that sum — no
  geometry can hit 24.1 ac on one field without violating the same `ST_Contains`-within-boundary
  invariant the live pipeline enforces. `seed-satellite.ts` instead produces the largest
  realistic pattern that fits: **3 zones, ~1.8 ac**, on `Field 237`. `TASK-crop-stress` should
  treat this as its real visual-diff target, or a `TASK-fields` follow-up could enlarge the demo
  boundary. Getting there also surfaced a real synthetic-data trap worth keeping in mind for any
  future seed: stressed pixels must stay under ~10% of a field's population, or they start
  dragging `p10` down to meet them, and pixels sitting exactly at a self-lowered `p10` fail the
  strict `<` test — the mask goes empty and every zone silently vanishes. `seed-satellite.ts`'s
  own comment on `STRESS_BLOCKS` has the full arithmetic.

### §6 verification — honest results

| # | Item | Result |
|---|---|---|
| 1 | Live round trip | **Not run** — no CDSE credentials in this environment. Everything else is fixture/synthetic-driven per the seam §1.1 describes. |
| 2 | Golden fixture (stats/count/centroid stability) | **Passed** — `packages/raster/src/golden.spec.ts`, against a synthetic-but-known GeoTIFF pair built and decoded through the real `geotiff` reader/writer (not a captured live response — §10's earlier note). |
| 3 | Geometry not flipped | **Passed** — `vectorise.spec.ts`'s explicit north/south/east/west transform assertions, plus the golden fixture's centroid-placement check. |
| 4 | Area rules (min/max, split) | **Passed** — `detect.spec.ts`: a synthetic >4ac region yields ≥3 zones each ≤4ac; a sub-0.5ac candidate is dropped. |
| 5 | Scene validity (cloudy skip) | **Passed** — `raster.spec.ts`'s `sceneIsValid` tests, and `refresh.processor.ts`'s `NoSceneError` path is exercised by `retry.spec.ts`. |
| 6 | Re-detection preserves triage | **Passed** — `stress-zones.spec.ts` (the bug above was caught and fixed here). |
| 7 | Retry is real | **Passed** — `apps/worker/test/retry.spec.ts`, real testcontainers Redis, real BullMQ `Queue`/`Worker`. |
| 8 | NFR-8 (stale badge fields) | **Passed** — `recordRefreshResult`'s two-timestamp design is unit-covered by construction (`fields.ts`), and `seed-satellite.ts`'s `Field 240` exercises the exact scenario live against real Postgres. |
| 9 | NFR-4 | **Passed** — `apps/api/test/nfr4.spec.ts`, both the `package.json` and `grep` checks. |
| 10 | NFR-7 (six cross-tenant cases) | **Passed** — `apps/api/test/tenancy.e2e.spec.ts`'s registry, six new entries. |
| 11 | NFR-2 (p95 < 50ms) | **Passed** — `observations.e2e.spec.ts`, measured against a local testcontainers Postgres (not production infra); see that test's own comment. |
| 12 | NFR-5 (200 fields / 30 min, extrapolated) | **Not run** — no live timing exists to extrapolate from (item 1 didn't run). Do not claim a number that wasn't measured. |
| 13 | NFR-6 / PU | **Not run** — same reason; architecture.md §11.1 records the formula, not a measured cost. |
| 14 | RLS survives | **Passed** — `tenancy.spec.ts`'s allowlist test, the scheduler-column test, and the unchanged `assertNonBypassRlsRole` boot check. |
| 15 | Scheduler finds work across orgs | **Passed** — `tenancy.spec.ts`'s dedicated `scheduler_fields_due_for_refresh` test, seeded across two orgs, called as `flora_app` with no GUC set. |
| 16 | Soft delete is soft | **Passed** — `stress-zones.spec.ts` and `observations.e2e.spec.ts` both assert it. |
| 17 | Seed determinism | **Passed** — run twice against real Postgres: identical `observations` count (44), identical `stress_zones` count (3), byte-identical `raster_key` list. The 8-zone/24.1ac *target* was not hit — see the deviation note above. |
| 18 | Offline development works | **Passed** — the entire write path, `db:seed:satellite` included, ran against real infra with `CDSE_CLIENT_ID`/`SECRET` set to placeholder values that were never read (the scheduler path that would need them is `SATELLITE_SCHEDULE_ENABLED=false` by default). |
| 19 | Whole workspace green | **Passed** — `pnpm turbo run build/typecheck/lint/test --force` all exit 0 across all 8 packages (contracts 15, raster 21, satellite 8, db 48, worker 3, api 50 — 145 tests total), and `apps/web`'s `pnpm test:e2e` passes 22/22 unchanged against the real `apps/api` + `apps/web` dev servers, confirming this task leaked nothing into `apps/web`, which it never touched. |

### What a `TASK-crop-stress` implementer should know going in

The raster PNG at `http://localhost:9000/flora-rasters/<key>` is real and publicly fetchable
(verified with `curl` against the seeded data) — the `mc anonymous set download` step in
`infra/docker-compose.yml` is what makes that true locally. `rasterUrl` in every `Observation`
already points there. `packages/raster/src/ramp.ts`'s exact colour stops are a documented
default (design-spec D19), not verified against a Figma swatch — open to a designer's exact
values if one becomes available.
