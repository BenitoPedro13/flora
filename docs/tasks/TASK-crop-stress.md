# TASK-crop-stress — the Crop Stress screen (`18:6567`)

> **Phase:** 2 (architecture §16) — the second half of the split agreed in
> `TASK-satellite-pipeline` §1.1. That task built the write path; this one is the screen that
> reads it.
> **Blocked by:** `TASK-fields` (landed), `TASK-satellite-pipeline` (landed). Both are in.
> **Blocks:** `TASK-tasks-board` — "act on it" is the third link of the spine, and the natural
> entry point for a task ("create a task from this stress zone") is a control on this screen.
> **Design:** `18:6567` ("Fields - 01"), 1440×954 · design-spec §5.3, §4.4, §4.5.
> **Status:** planned 2026-08-16, against `695d433`.

---

## 1. Current scenario

At `695d433` the whole write path exists and has real data in it, and **none of it is visible
in the product**. Concretely:

- `observations` and `stress_zones` hold real rows for the demo org, written by
  `pnpm db:seed:satellite` replaying a synthetic-but-known raster through the real
  `packages/raster` chain. The PNGs are in MinIO and are publicly fetchable —
  `http://localhost:9000/flora-rasters/rasters/<org>/<field>/ndvi/<date>.png` returns bytes.
- Six endpoints serve it: `GET /fields/:id/observations`, `.../observations/dates`,
  `POST .../observations/refresh`, `GET /fields/:id/stress-zones`, `PATCH /stress-zones/:id`,
  `DELETE /stress-zones/:id` (`apps/api/src/observations/`).
- `packages/contracts` has `observationSchema`, `stressZoneSchema`, their query and mutation
  shapes, and `formatAcres`.
- `apps/web` has the Fields list screen, `FieldMap` (satellite basemap + boundaries +
  `FieldLabelLayer`), `PageHeader`, `AppSidebar`, and the `apiFetchServer`/`apiFetchClient`
  +TanStack Query fetching pattern.

What does not exist:

| Missing | Where it goes |
|---|---|
| The route `/fields/[fieldId]/stress` | `apps/web/app/(app)/fields/[fieldId]/stress/page.tsx` |
| `RasterOverlay`, `StressZoneLayer`, `MapToolbar`, `ColorRampLegend` | `components/map/` (design-spec §6.3) |
| `StressZoneRow`, `StressPopover`, `StressSummary` | `components/flora/` |
| Vendored `Popover`, `Datepicker`, `Button Group` | `components/ui/` — the popover, the date picker and the popover's Mute/Delete footer all need them; only `Select`, `Dropdown`, `Modal`, `Badge`, `Compact Button` are in today |
| Any consumer of `lastRefreshSucceededAt` / `lastRefreshError` | NFR-8's stale badge. `TASK-fields` §2.7 carried the fields in the payload and explicitly did not claim NFR-8; this task owns it |
| A way to observe a manual refresh | `POST .../observations/refresh` returns `{ jobId }` and **nothing can be done with that id** — there is no job-status endpoint (architecture §8.3 has none) |

### 1.1 Two defects in the landed write path, found while planning this task

Both are small, both belong here because this screen is the first thing that exercises them.

1. **A manual refresh never retries.** `apps/api/src/observations/refresh-queue.provider.ts`
   constructs its producer `Queue` with no `defaultJobOptions`, while
   `apps/worker/src/queue/satellite.queue.ts` registers the same queue name with
   `attempts: 5`, exponential backoff, and retention caps. BullMQ applies the options of the
   `Queue` instance that **added** the job, so an API-enqueued refresh runs once and dies on
   the first transient CDSE error, unlike every scheduled one. The two configs are duplicated
   on purpose (apps don't import each other — `TASK-satellite-pipeline` §2.7), so the fix is to
   duplicate them *fully*, with a comment on each side pointing at the other.
2. **`jobId` is write-only.** The contract returns it, the previous task's §9 promised "the
   manual-refresh poll on `{ jobId }`", and there is nothing to poll. §2.4 adds the endpoint.

### 1.2 What the design asks for that has no source, and what this task does about it

| # | The design shows | The reality | This task |
|---|---|---|---|
| a | "**8 stress detected** 24.1 ac" | `db:seed:satellite` produces **3 zones, ~1.8 ac** on `Field 237` — the demo boundaries are ~18.3 ac total and no honest geometry reaches 24.1 ac on one field (`TASK-satellite-pipeline` §10) | Build against the seed's real numbers; the visual-diff target is `Field 237`. §7 decision 7 asks whether to enlarge the demo boundary instead |
| b | Group heading "**Low vigor**", every row's dropdown reading "**Soil Issue**" | `low_vigor` and `soil_issue` are both `stressClassification` values — the mock contradicts itself | Group **by classification**, heading = that group's classification label, so a row's dropdown always agrees with its heading (§2.8). Recorded as a new design gap |
| c | A **`Relative`** dropdown under the legend, implying an absolute mode | The PNG is pre-rendered with the relative ramp **baked in** (`packages/raster/src/ramp.ts`). No absolute-mode raster exists, and re-colouring a PNG client-side is not a thing | Ship Relative only, with the control rendered and disabled + a tooltip saying why (§7 decision 1). An absolute mode is a second PNG per observation — a worker change, not a screen change |
| d | A **ruler / measure** button (`18:6045`) | No measure interaction is designed anywhere in the file | §7 decision 4 — recommendation: build it (a two-click line, `turf.length`), because a dead button in a 3-button toolbar is worse than either alternative |
| e | A round green **assistant FAB** (`18:6571`, "Phoenix") | There is no assistant, in this architecture or any spec | Omit; record as a design gap (§7 decision 5) |
| f | "**Data:** 28 Aug 2024" | `Data` is Portuguese for *date* — the same class of typo as design-spec D10's "Rain Chanse" and "Pendent Tasks" | Ship "**Date:**", add to D10 |
| g | "1 Aug - 24 aug (1.9 ac)" | Inconsistent casing in the mock | Ship "1 Aug – 24 Aug (1.9 ac)" |
| h | No stale, empty, loading or error state anywhere | D3 is still open, and NFR-8 is a hard target | Design them from AlignUI primitives (§2.11, §2.13) and record what was invented |

Nothing here is invented silently: every row above lands in design-spec §9's gap table.

---

## 2. Planned changes

### 2.1 Scope rule

**In:** everything on `18:6567` — the panel, the raster overlay, the stress-zone outlines, the
legend, the map toolbar, the date and index controls, the detection list, the popover, the
three mutations, the manual refresh and its poll, NFR-8's stale badge, and re-pointing
**View Details** at this route.

**Out:** §5. In particular the Management screen (`15:8608`), tasks, and any historical
backfill.

Before writing a component, the implementer runs `get_design_context` on the node IDs cited
below — this document carries layout and data decisions, not the exact type ramps and spacing
tokens, and the Figma is the visual contract (design-spec §1).

### 2.2 `packages/contracts` — four additions, all shared-by-necessity

Nothing here is a "web helper" put in the wrong package: each is consumed by at least two
sides, which is exactly what invariant 4 is for.

```ts
// ramp.ts (new) — the ramp's domain and stops, so the PNG and the legend
// under it can never disagree.
export const NDVI_RAMP_STOPS: readonly [string, string, string];   // moved out of packages/raster/src/ramp.ts
export function rampDomain(stats: ObservationStats): [number, number];
export function rampLegendLabels(stats: ObservationStats, count = 6): string[]; // ["78", ".71", ...] top→bottom
```

`rampDomain` is `packages/raster/src/ramp.ts`'s existing logic lifted verbatim, degenerate-case
fix included (`p10`→`p90`, falling back to `min`→`max` when `p10 === p90` — the bug
`TASK-satellite-pipeline` §10 records). `ramp.ts` then **imports** it rather than owning it.
`rampLegendLabels` produces the design's six evenly spaced labels (`18:6374`–`16:6379`:
`.78 .71 .63 .56 .48 .41`, top = domain max), formatted without a leading zero, two decimals.

```ts
// stress-zone.ts (extended)
export function stressClassificationLabel(c: StressClassification): string;  // soil_issue → "Soil Issue"
export function shortZoneId(id: string): string;                             // uuid → "42BB-37AC" (16:6316)
```

```ts
// observation.ts (extended)
export const refreshJobStateValues = ["waiting", "active", "completed", "failed", "unknown"] as const;
export const refreshJobStatusSchema = z.object({
  jobId: z.string(),
  state: z.enum(refreshJobStateValues),
  failedReason: z.string().nullable(),
});
```

`unknown` is deliberate and load-bearing: BullMQ's retention caps
(`removeOnComplete: { count: 1_000 }`) mean a completed job can be evicted before the browser
polls, and "the job id is gone" must not render as "it failed".

### 2.3 `packages/raster` — one import, no behaviour change

`ramp.ts` imports `NDVI_RAMP_STOPS` and `rampDomain` from `@flora/contracts` instead of
declaring them. `ramp.spec.ts` keeps every existing test, including the degenerate-domain one —
if the move changes a single pixel, those tests say so. `golden.spec.ts` is the backstop.

### 2.4 `apps/api` — one endpoint, one bug fix

```
GET /api/v1/fields/:id/observations/refresh/:jobId   → RefreshJobStatus
```

Nested under the field on purpose: the tenancy check is `fieldExists(tx, org, fieldId)` first
(404 for a foreign field, NFR-7), **then** `queue.getJob(jobId)`, **then** an assertion that
`job.data.organizationId === user.org` — a raw job id is guessable in a way a field id inside
an RLS-scoped query is not, so it gets its own check and returns 404, never 403. A missing job
returns `state: "unknown"`, not 404: the id was valid, the record simply aged out.

This reads Redis, which architecture §7 explicitly permits the API to do ("the API reads
Postgres and Redis"). It imports `bullmq`, which `apps/api` already depends on, and **not**
`@flora/satellite` — NFR-4's test (`apps/api/test/nfr4.spec.ts`) keeps passing untouched.

The §1.1 producer fix goes in `refresh-queue.provider.ts`: the same `attempts` / `backoff` /
`removeOnComplete` / `removeOnFail` block the worker registers, with a comment on each side
naming the other file and the reason the duplication is intentional.

### 2.5 `apps/web` — three vendored base components

Fetched from `alignui.com/docs/v1.2/ui/...` byte-identical, sha256 recorded in
`components/ui/SOURCES.md` under a new `## popover, datepicker, button-group (TASK-crop-stress)`
heading, following the note `TASK-fields` left there about the docs site's RSC flight payload.

| Component | Used by |
|---|---|
| `Popover` | `StressPopover` (`16:6309`) — it has an arrow (`16:6335`, 19×9.5, top-centre), so it is a real popover anchored to the map, not a modal |
| `Datepicker` | the **Date:** control (`18:7024`) |
| `Button Group` | the popover's Mute / Delete footer (`16:6334`, 329×53, split by a vertical divider) |

`Datepicker` pulls `react-day-picker`; check its current peer requirements against the AlignUI
docs page before installing rather than assuming the version in older examples (§2.0 of
`CLAUDE.md`).

### 2.6 The map — four new files in `components/map/`

`FieldMap` gains nothing but a wider `children` contract; every addition below is a child of
its `<Map>`, so the list screen is untouched.

**`raster-overlay.tsx`** — a `<Source type="image">` whose `url` is `observation.rasterUrl` and
whose `coordinates` are the four corners of `observation.bbox`, in Mapbox's required
clockwise-from-top-left order:
`[[w,n],[e,n],[e,s],[w,s]]`. The PNG's pixel grid is linear in lon/lat
(`packages/raster/src/vectorise.ts`'s `pixelToLonLat` is the same transform the detector uses),
and Mapbox warps an image source linearly in Web Mercator, so the two disagree by the
Mercator/equirectangular difference across the image's own height — sub-pixel at field scale
(~1 km, 512 px), but `[VERIFY: measure the corner-to-corner offset of the seeded Field 237
raster against its boundary polygon at zoom 16; if it is visible, the fix is rendering the PNG
in Web Mercator in the worker, not nudging coordinates here]`.
Rendered **below** the boundary line layers and above the basemap, with `raster-opacity`
transitioning over 200 ms (design-spec §8's cross-fade).

**`stress-zone-layer.tsx`** — a `<Source type="geojson">` built client-side from the
`StressZone[]` the panel already has (`geometry` is a `Polygon` in the contract — no new
endpoint, no second fetch). A `fill` layer plus a `line` layer, both driven by `feature-state`:
the selected zone and the hovered zone read differently, muted zones render at reduced opacity.
The white outlines visible inside Field 239 in the Figma render are these. Clicking a zone
opens the popover and syncs `?zone=<id>`; hovering a panel row sets the same feature state, so
list and map are one selection model, not two.

**`map-toolbar.tsx`** — the three floating control groups, positioned exactly as the artboard
has them relative to the map's own left edge (map starts at x 542): locate `18:6059` at +35/22
(40×40), measure `18:6044` at +34/73 (40×40), zoom `18:6032` at +35/124 (40×80, `add-line` over
`subtract-fill` split by a `Content Divider`). Locate flies to the field's bounds
(400 ms, design-spec §8). Measure is a two-click line with `@turf/length` (§7 decision 4).

**`color-ramp-legend.tsx`** — `16:6382`, 53×220 at map-relative +34/653: a 22×212 rounded bar
carrying a CSS `linear-gradient` built from `NDVI_RAMP_STOPS`, six labels from
`rampLegendLabels(observation.stats)` at 36 px spacing, and the `Relative` dropdown
(`16:6363`, 87×40) beside its lower edge — **beside**, not beneath as design-spec §5.3 says;
the metadata puts it at x 650 / y 834 while the legend spans 653–873. That sentence in the spec
gets corrected.

`components/map/config.ts` gains the zone outline/fill colours and re-exports
`NDVI_RAMP_STOPS`, so no component file contains a colour literal (invariant 7 — see §3.3).

### 2.7 The screen — `app/(app)/fields/[fieldId]/stress/page.tsx`

A Server Component. Reads `params.fieldId` and `searchParams` (`date`, `index`, `zone`), and
fetches four things in parallel with `apiFetchServer`:

| Call | For |
|---|---|
| `GET /fields/:id` | the header dropdown's current field, the boundary, `lastRefreshSucceededAt` / `lastRefreshError` |
| `GET /fields/:id/observations?index=<index>` | stats + `bbox` + `rasterUrl` for every date, so switching dates is client-side and instant |
| `GET /fields/:id/stress-zones?sort=priority` | the list |
| `GET /fields/geojson` | the neighbouring fields and their label pills — `Field 237`–`240` are all visible in the artboard |

`GET /fields` (the header dropdown's options) is fetched too, `limit` defaulted.

Layout, from the metadata rather than from the spec's rounded numbers:

```
AppSidebar  80                    (collapsed rail, D14: a user toggle, not a route default)
├─ panel 18:6572                  462 wide, own scroll, border-r
│   PageHeader 2171:9757          88 high — IconTile + "Fields" + a Field dropdown, right-aligned
│   header block 18:7017          168 high — "Crop Stress" (Title/H4-ish, 40) at 32/29,
│                                   then the Date: row at 32/99: radar-fill 32 · "Date:" ·
│                                   Datepicker 107×40 · index Compact Dropdown 74×40 right-aligned
│   list block 18:7041            summary 18:7042 · "Sort:" + Compact Dropdown 87×40 ·
│                                   group heading 18:7051 · rows 18:7054…18:7100
└─ map                            898 wide, flush right and bottom, no border, no radius
```

`"use client"` boundaries per architecture §9.2: the map, the panel body (it owns selection,
the mutations and the popover), and the header's field dropdown. The page shell and the first
render of the list come from the server.

Selection and view state live in the URL — `?date=`, `?index=`, `?zone=` — the same reasoning
`TASK-fields` §2.7 applied to `?field=`: shareable, reload-safe, and it does not remount the
map.

### 2.8 The detection list

**Summary** (`18:7042`): `"{n} stress detected"` in `text-strong-950` + `formatAcres(sum)` in
`text-sub-600`, then a `Compact Button` overflow menu at the right (`18:7047`) carrying
**Refresh imagery** (§2.10) and **Show muted** (a toggle). Muted zones are **excluded from both
the count and the acreage** and hidden by default — consistent with Home's re-sourced
"Fields at Risk" tile counting fields with *unmuted* zones (design-spec §5.1).

**Sort** (`18:7048`): a compact `Select` over the contract's `priority | newest | area`, driving
the API query. Priority is severity desc → area desc → most recent (architecture §7.5).

**Grouping**: rows are grouped by `classification` under a `leaf-fill` heading
(`18:7051`, 32 px icon + `stressClassificationLabel`), preserving the API's order within each
group. Changing a row's classification moves it between groups — that is the honest reading of
the design (§1.2 b).

**`StressZoneRow`** (`components/flora/stress-zone-row.tsx`, from `18:7054`): 60 px tall
(the first row is 72 — a 12 px lead-in, not a different row), a bottom divider, and:
`plant-fill` 32 · a 147 px column holding a 92×24 compact classification `Select` over
`"{windowStart} – {windowEnd} ({formatAcres(areaM2)})"` in `text-sub-600` ·
an optional `NEW` badge at x 301.5 (44×24) when `isNew`
`[VERIFY: the badge's colour/variant against 18:7074 — it renders light blue, which is not the
screen's green accent]` · a `notification-off-fill` mute toggle at x 366.

Clicking a row selects the zone: the map flies to it and the popover opens anchored to the
zone's centroid.

**`StressPopover`** (`components/flora/stress-popover.tsx`, from `16:6309`, 329 wide, 16 px
padding, 297 content): "Stress detected" + close · `shortZoneId(id)` in `text-soft-400` ·
"Identified:" + `radar-fill` + `"{windowStart} – {windowEnd}"` · `Divider` · a metrics row
(`detectedOn` · `formatAcres(areaM2)` · `leaf-fill` + `"NDVI:"` + `indexValue.toFixed(2)` in
`text-error-base`) · a full-width 52 px classification `Select` · a `Button Group` footer of
**Mute** and **Delete**.

### 2.9 Mutations

All three go through TanStack Query with optimistic updates against the
`["stress-zones", fieldId, sort]` cache, rolling back on error and surfacing the `ApiError`'s
`problem.detail`:

| Action | Call | UI |
|---|---|---|
| Classify | `PATCH /stress-zones/:id { classification }` | the row moves to its new group |
| Mute / unmute | `PATCH /stress-zones/:id { muted }` | the row leaves the list (or dims, with **Show muted** on) and the summary counts drop |
| Delete | `DELETE /stress-zones/:id` → 204 | the row disappears |

Delete is a **soft** delete server-side and the design shows no confirmation step, so none is
invented — but the toast that reports it says "Detection deleted" rather than "removed
permanently", because it isn't.

### 2.10 Manual refresh, and the poll

Overflow menu → **Refresh imagery** → `POST /fields/:id/observations/refresh` → 202 `{ jobId }`
→ poll `GET /fields/:id/observations/refresh/:jobId` every 2 s via TanStack Query's
`refetchInterval`, stopping on `completed` / `failed` / `unknown` or after 2 minutes. On
`completed`, invalidate the observations, dates and stress-zone queries and select the newest
date. On `failed`, a toast carrying `failedReason`. On `unknown` after a successful start,
treat it as completed and refetch — the data is the source of truth, the job record is not.

The button is disabled while a poll is in flight. This is the only place the screen writes
anything that touches the satellite pipeline, and it is still a Redis `LPUSH` (invariant 1).

### 2.11 NFR-8 — the stale badge

A field whose most recent refresh failed renders a `Badge` beside the **Date:** row reading
**"Stale · last updated {lastRefreshSucceededAt formatted}"**, with a `Tooltip` carrying
`lastRefreshError`. Never a zero, never a blank, and never absent when
`lastRefreshError !== null`. `db:seed:satellite` already seeds exactly this on **Field 240**
(an older success, then a simulated final failure), so it is testable without breaking
anything.

There is no artboard for this. It is built from `Badge` + `Tooltip` at the one place on the
screen that already talks about dates, and recorded as a gap.

### 2.12 Re-pointing **View Details**, without stranding the editor

`FieldCard`'s **View Details** now navigates to `/fields/[fieldId]/stress` — the one-line change
`TASK-fields` §2.7 wrote itself an IOU for. That removes the editor's primary entry point, so
the card gains a second one: double-clicking the card opens the editor, mirroring the
double-click-the-polygon gesture the map already has. No new visible control, no design change.

### 2.13 The states the design does not have (D3)

| State | Treatment |
|---|---|
| Field has no observations at all | Panel keeps its header; the list area shows "No imagery yet for this field" + a **Refresh imagery** button. The map renders boundaries with no raster. Not an error |
| Field has observations, zero zones | "No stress detected" with the leaf glyph — the good outcome, styled as such, not as an empty error |
| Loading | Skeletons at the final dimensions (design-spec §10 item 6): the 60 px rows, the legend bar, the summary line |
| Fetch error | An inline error block with a retry, not a blank panel |
| `NEXT_PUBLIC_MAPBOX_TOKEN` missing | The existing `MapPlaceholder`, unchanged — the panel stays fully usable |

### 2.14 Tests

- **`apps/web/e2e/stress.spec.ts`** (Playwright, against the real API + seeded data): navigating
  from a field card lands on `/fields/<id>/stress`; Field 237 renders its **3** seeded rows with
  the seeded acreage; the summary count matches the row count; muting a row drops the count and
  hides it; **Show muted** brings it back; changing a classification moves the row between
  groups and survives a reload; deleting removes it and it stays gone after reload (soft delete
  is still a delete to the reader); Field 240 shows the stale badge with its last-success date;
  the legend's six labels equal `rampLegendLabels` for that observation's stats.
- **Visual diff** at 1440×900 vs the `18:6567` export, ≤ 2% delta on the **panel region only** —
  the map is excluded for the reason `TASK-fields` §6 item 14 already established (there is no
  Figma-comparable satellite render). The baseline PNG is fetched with `get_screenshot`; if the
  session has no Figma connection, record it as a follow-up in §9 rather than skipping silently
  — that is what `fields.spec.ts` did and the note is honest.
- **`packages/contracts`**: unit tests for `rampDomain` (including `p10 === p90`),
  `rampLegendLabels` (six labels, top = max, `.41`-style formatting), `shortZoneId`,
  `stressClassificationLabel` (exhaustive over the enum — a `satisfies Record<...>` so a new
  enum value fails the build, not the runtime).
- **`packages/raster`**: existing suites unchanged and still green after the import move.
- **`apps/api`**: an e2e for the job-status endpoint — enqueue, read `waiting`, read a
  nonexistent id as `unknown`, and a foreign-org job id as **404**; a new row in
  `apps/api/test/tenancy.e2e.spec.ts`'s registry (NFR-7 is "100% of resource endpoints", so a
  new endpoint means a new registry entry, not an exception).
- **A raster is looked at, not just asserted on.** `TASK-satellite-pipeline` §10's second bug
  was invisible to a green suite and obvious in a browser. Before this task is called done, the
  overlay is viewed live over Field 237 at zoom 16 and compared against the zone outlines: the
  red patches must sit under the white polygons.

### 2.15 Seeds, environment, docs

No new environment variables. No new seed — `db:seed:satellite` already produces everything
this screen reads.

Docs to update before the task is done (`CLAUDE.md` §3):

- `docs/architecture.md` — §8.3 gains the job-status endpoint; §9.1's route tree is already
  correct; §16's Phase 2 row flips to complete; §15's NFR-8 gets its "shipped, tested by
  `stress.spec.ts`" note.
- `docs/design-spec.md` — §5.3's "beneath" corrected to "beside" for the `Relative` dropdown;
  D3 partially closed with what was built; D10 gains "Data:" → "Date:"; new gaps for the
  8-vs-3 zone count, the "Low vigor"/"Soil Issue" contradiction, the absent assistant, and the
  stale badge's missing artboard.
- `README.md` — status line.
- `components/ui/SOURCES.md` — three new rows.

---

## 3. Why

### 3.1 Why the legend's numbers come from the same function that painted the PNG

The legend is not decoration; it is the only thing that tells the farmer what a colour means.
The ramp is **relative** (architecture §7.5: NDVI has no universal stressed value), so its
domain is a property of one observation, and the PNG under it was painted from that domain in
the worker, potentially days earlier. If the web recomputes the domain with its own copy of the
rule, the two drift the first time anyone touches either — and the failure is silent, because a
wrong label still looks like a label. `rampDomain` in `packages/contracts`, imported by both, is
the same argument invariant 4 makes about API shapes, applied to a piece of maths that also
crosses the boundary.

### 3.2 Why the stress list is not filtered by the selected date

`stress_zones` holds the **current** triage state of a field — a zone carries `windowStart` /
`windowEnd`, an operator's classification, and a mute flag that survives re-detection
(architecture §7.5). Observations are a time series; zones are not. The date picker therefore
changes the raster and the statistics, and leaves the list alone. Filtering zones by the
selected date would either return nothing for most dates or quietly invent a history the
detector never wrote.

### 3.3 Invariant 7 needs one word changed — say yes or no before code

The invariant names three files that may hold colour values. D19 already carved out a fourth,
`packages/raster/src/ramp.ts`, on the grounds that it encodes pixels into a PNG rather than
styling a component. §2.2 moves those same literals to `packages/contracts` so the legend can
share them, which moves the exception rather than adding one — but the invariant's text should
say so, exactly as `TASK-fields` §3.4 amended it for `components/map/config.ts`. The component
side stays clean: `ColorRampLegend` imports from `components/map/config.ts`, which re-exports
from contracts, so a grep of `apps/web` for raw hex still comes back empty outside the three
named files.

### 3.4 Why the job-status endpoint lives in the API and is not a satellite import

Reading a BullMQ job is a Redis `HGETALL`. It is not a call to Sentinel Hub, and it does not
need `@flora/satellite` — which is precisely what NFR-4's test asserts and why the test greps
for the import rather than for the word "satellite". The alternative (poll `GET /fields/:id`
until `lastRefreshAt` advances) needs no new endpoint but cannot distinguish "queued behind 40
other fields" from "the worker is not running", and both render as an indefinite spinner. §7
decision 3 states the trade-off; the endpoint is the recommendation.

### 3.5 Why the raster is an image source and not tiles

Invariant 2 and architecture §18.5. One PNG per field per date, ~512×512, already in object
storage, already public over CDN. A tile pyramid for a 1 km extent is machinery for a problem
this data does not have.

---

## 4. Affected files

### `packages/contracts`

| Path | Change | Notes |
|---|---|---|
| `src/ramp.ts` | new | `NDVI_RAMP_STOPS`, `rampDomain`, `rampLegendLabels` |
| `src/ramp.spec.ts` | new | domain incl. the degenerate case; label formatting |
| `src/stress-zone.ts` | edit | `stressClassificationLabel`, `shortZoneId` |
| `src/stress-zone.spec.ts` | new | exhaustive label map, id formatting |
| `src/observation.ts` | edit | `refreshJobStatusSchema`, `refreshJobStateValues` |
| `src/index.ts` | edit | re-exports |

### `packages/raster`

| Path | Change | Notes |
|---|---|---|
| `src/ramp.ts` | edit | imports the stops and domain from contracts; logic unchanged |

### `apps/api`

| Path | Change | Notes |
|---|---|---|
| `src/observations/observations.controller.ts` | edit | `GET :id/observations/refresh/:jobId` |
| `src/observations/observations.service.ts` | edit | `jobStatus()` — field check, `getJob`, org check, state mapping |
| `src/observations/refresh-queue.provider.ts` | edit | §1.1 fix: mirror the worker's `defaultJobOptions` |
| `test/observations.e2e.spec.ts` | edit | job-status cases |
| `test/tenancy.e2e.spec.ts` | edit | one new registry entry (NFR-7) |

### `apps/web`

| Path | Change | Notes |
|---|---|---|
| `app/(app)/fields/[fieldId]/stress/page.tsx` | new | Server Component, four parallel fetches |
| `app/(app)/fields/[fieldId]/stress/stress-panel.tsx` | new | the client component owning selection, mutations, popover |
| `app/(app)/fields/[fieldId]/stress/stress-header.tsx` | new | `PageHeader` + field dropdown + stale badge |
| `components/flora/stress-zone-row.tsx` | new | `18:7054` |
| `components/flora/stress-popover.tsx` | new | `16:6309` |
| `components/flora/stress-summary.tsx` | new | `18:7042` + the overflow menu |
| `components/map/raster-overlay.tsx` | new | image source from `bbox` + `rasterUrl` |
| `components/map/stress-zone-layer.tsx` | new | fill + line, `feature-state` selection |
| `components/map/map-toolbar.tsx` | new | locate / measure / zoom |
| `components/map/color-ramp-legend.tsx` | new | `16:6382` + the `Relative` control |
| `components/map/config.ts` | edit | zone colours; re-export of the ramp stops |
| `components/map/field-map.tsx` | edit | accept the new children; no behaviour change for `/fields` |
| `components/flora/field-card.tsx` | edit | **View Details** navigates; double-click opens the editor |
| `components/ui/popover.tsx`, `datepicker.tsx`, `button-group.tsx` | new | vendored, verbatim |
| `components/ui/SOURCES.md` | edit | three rows + sha256 |
| `e2e/stress.spec.ts` | new | §2.14 |
| `e2e/baselines/stress-panel.png` | new | visual-diff baseline, if a Figma connection exists |
| `package.json` | edit | `react-day-picker` (Datepicker's dependency), `@turf/length` |

### Docs

| Path | Change |
|---|---|
| `docs/architecture.md` | §8.3 endpoint, §15 NFR-8, §16 Phase 2 |
| `docs/design-spec.md` | §5.3 legend correction, D3/D10, four new gaps |
| `README.md` | status line |
| `CLAUDE.md` | status paragraph; invariant 7's wording (§3.3) if decision 2 is yes |

---

## 5. Explicitly out of scope

1. **Management (`15:8608`)** — `management-zones`, `prescriptions`, the viridis zone ramp,
   the scenario cards. Phase 6.
2. **Tasks** — including the obvious "create a task from this stress zone" button. It needs the
   task domain, which is `TASK-tasks-board`. Noted in §9.
3. **An absolute colour-ramp mode** — a second PNG per observation, written by the worker
   (§7 decision 1).
4. **Historical backfill** — deferred to Phase 4 by `TASK-satellite-pipeline` §7 decision 5. The
   date picker shows the dates that exist.
5. **Indexes other than NDVI** — the dropdown lists the contract's five, but only `ndvi` is on
   the schedule (`TASK-satellite-pipeline` §7 decision 6) and only `ndvi` is seeded. Selecting
   another renders §2.13's "no imagery yet" state honestly rather than pretending.
6. **The live CDSE round trip** — still `TASK-satellite-pipeline` §6 item 1, still needs
   credentials this environment does not have. This screen is built and verified against the
   seed, exactly as the split's seam intended.
7. **The assistant FAB**, saved-view FAVS dots, KML/Shapefile import, Home, Weather.
8. **Mobile/tablet** (D1) and **dark mode** (D2) — unchanged, still 1440 fixed and light only.

---

## 6. Verification

Measurable, per architecture §15 and `TASK-foundations` §6. No item may pass on "looks right".

| # | Item |
|---|---|
| 1 | `/fields/<Field 237 id>/stress` renders **3** detection rows and a summary whose acreage equals `formatAcres` of the sum of those rows' `areaM2`, matched against a direct SQL sum |
| 2 | The raster overlay is visible over Field 237, clipped to the boundary, with every seeded stress zone's white outline sitting on a red/orange patch — verified by eye in a real browser, not only by the suite (`TASK-satellite-pipeline` §10's lesson) |
| 3 | The legend's six labels equal `rampLegendLabels(observation.stats)` for the rendered observation, asserted in `stress.spec.ts` against the API's own stats payload |
| 4 | Changing the date changes the raster and the stats and leaves the zone list byte-identical (§3.2) |
| 5 | Muting a zone removes it from the count and the acreage; **Show muted** restores it dimmed; both survive a reload |
| 6 | Re-classifying a zone moves it to the other group and survives a reload |
| 7 | Deleting a zone removes it from the list and it does not return after a reload; a direct SQL check confirms the row still exists with `deleted_at` set (soft, invariant intact) |
| 8 | **NFR-8**: Field 240 renders the stale badge with its `lastRefreshSucceededAt` date, and the tooltip carries `lastRefreshError`. No zero, no blank |
| 9 | **NFR-7**: a foreign-org field id on the stress route 404s; a foreign-org job id on the status endpoint 404s; both in the tenancy registry |
| 10 | **NFR-4**: `apps/api/test/nfr4.spec.ts` still passes — no `@flora/satellite` import reached `apps/api` |
| 11 | **NFR-2**: `GET /fields/:id/observations` still under 50 ms p95 against local testcontainers Postgres, unchanged from `observations.e2e.spec.ts` |
| 12 | **NFR-10**: panel-region visual diff ≤ 2% vs the `18:6567` export at 1440×900 (map excluded, per §2.14) |
| 13 | **NFR-11**: panning with the overlay + zone layers on top of 200 seeded fields (`db:seed:bulk`) holds 60 fps — or is recorded as not run, with the reason, exactly as `fields.spec.ts` records item 15 |
| 14 | A manual refresh from the overflow menu enqueues, polls, and resolves; killing the worker mid-poll surfaces a timeout message rather than an infinite spinner |
| 15 | A manual refresh job carries `attempts: 5` (§1.1) — asserted by reading the job back through the status endpoint's underlying `getJob`, not by reading the config |
| 16 | Every colour in the diff comes from a token class; a grep for raw hex finds nothing outside `globals.css`, `components/charts/config.ts`, `components/map/config.ts` |
| 17 | Every icon is a `@remixicon/react` import whose name matches the Figma layer (`radar-fill`, `leaf-fill`, `plant-fill`, `notification-off-fill`, `crosshair-fill`, `ruler-fill`, `add-line`, `subtract-fill`) |
| 18 | `pnpm turbo run build typecheck lint test` exits 0 across all 8 packages; `apps/web`'s existing 22 e2e tests still pass unchanged |
| 19 | Every `[VERIFY]` this document introduces is either resolved in §10 or restated as still open — none silently disappear |

---

## 7. Decisions this task needs before code

| # | Decision | Recommendation |
|---|---|---|
| 1 | **`Relative` dropdown**: ship disabled with a tooltip, or have the worker render a second absolute-ramp PNG per observation | **Disabled, this task.** An absolute mode doubles raster storage and PU-adjacent work for a mode nobody has asked for on data whose whole thesis (architecture §7.5) is that absolute NDVI thresholds are meaningless. Revisit if a farmer asks to compare two fields |
| 2 | **Move `NDVI_RAMP_STOPS` + `rampDomain` into `packages/contracts`** and amend invariant 7's wording | **Yes** — §3.1. The alternative is two copies of a colour ramp that must agree and have no mechanism forcing them to |
| 3 | **Job-status endpoint** vs polling `GET /fields/:id` | **Endpoint** — §3.4. ~30 lines, and it distinguishes failure from slowness |
| 4 | **Measure tool**: build it, or render it disabled | **Build it.** A two-click line with `@turf/length` is small, it is genuinely useful on a field map, and one dead button out of three reads as a broken toolbar. If it slips, ship it disabled with a tooltip rather than removing it — removing changes the artboard's geometry |
| 5 | **Assistant FAB** | **Omit**, and log the gap. A FAB that opens nothing is a promise the product cannot keep; the pixel cost is a 55 px circle in a region already excluded from the visual diff |
| 6 | **Group by classification** (heading = the group's own classification), resolving the mock's contradiction | **Yes** — the only reading where a row's dropdown and its heading can both be true |
| 7 | **The 8-zone / 24.1 ac target**: build against the seed's real 3 zones / 1.8 ac, or enlarge `seed-demo.ts`'s Field 237 boundary so the seed can reach the design's numbers | **Build against the seed.** Enlarging a demo boundary to make a mockup's number come true is fitting the data to the picture. If a fuller-looking screen is wanted for a demo, that is a `seed-demo` follow-up with its own justification, not a prerequisite here |

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| The image-source warp (§2.6) is visibly off, and it is only visible at high zoom over a real boundary | It is an explicit `[VERIFY]` with a stated fix (render the PNG in Web Mercator in the worker). Check it early — it changes the worker, not this screen, and finding it late means a second task |
| Moving the ramp constants breaks pixel output in a way the tests do not catch | `ramp.spec.ts` and `golden.spec.ts` both assert on real encoded output, and verification item 2 puts human eyes on a rendered PNG |
| `Datepicker` drags in a `react-day-picker` major that conflicts with React 19 | Check the AlignUI docs page's current dependency list before installing (`CLAUDE.md` §2.0). Fallback: the artboard's control is a 107×40 text input, and a masked `Input` bound to `/observations/dates` satisfies the design while the dependency is sorted |
| Optimistic mutation + the list's grouping produces flicker as a row jumps groups | Key rows by zone id, animate nothing on reorder, and let the group membership follow the cache — the row must not unmount and remount |
| Scope creep into "create a task from this zone" | It is named in §5 and belongs to `TASK-tasks-board` |

---

## 9. Follow-on tasks

| Task | Picks up |
|---|---|
| `TASK-tasks-board` (Phase 3, next) | `24:11420`; the "create a task from this stress zone" action on this screen's popover |
| `TASK-home-dashboard` (Phase 4) | `farm_daily_rollups`, the re-sourced "Fields at Risk" tile that counts fields with unmuted zones — the same rule §2.8 applies here |
| `TASK-satellite-live` | `TASK-satellite-pipeline` §6 items 1, 12, 13 — the live CDSE round trip, NFR-5 and the PU measurement, all still open for want of credentials. **First real-account findings, 2026-08-16 (none fixed here — this task's scope is `18:6567`, not the write path, and the session that found these had a real CDSE account for the first time but not the access to fix-and-verify against it):**<br>**1.** With real `CDSE_CLIENT_ID`/`CDSE_CLIENT_SECRET` set, `apps/worker`'s `RefreshProcessor` logged `refresh failed for field ...: Content-Type was not one of "multipart/form-data" or "application/x-www-form-urlencoded"` from `packages/satellite/src/cdse/token.ts`'s `getAccessToken` — Keycloak's own token-endpoint error. The request as written looks spec-correct (explicit `application/x-www-form-urlencoded` header, a real `URLSearchParams` body via Node's native `fetch`); not root-caused. Reproduce with a direct `curl` against the token endpoint first, to separate an account/grant-type issue from a Node `fetch` quirk.<br>**2.** `packages/satellite/src/cdse/process.ts`'s `PROCESS_ENDPOINT` (`sh.dataspace.copernicus.eu/api/v1/process`) may be the wrong path — CDSE's own Process API examples page consistently shows `sh.dataspace.copernicus.eu/process/v1` instead. Unconfirmed which is right (architecture §11.1).<br>**3.** `fetchIndexRaster` always requests two named outputs (`index`, `scl`) and parses the response as `multipart/form-data`; CDSE's docs for multi-output requests show `Accept: application/tar` and a **TAR archive** response instead — if correct, every real refresh with two outputs either fails or mis-parses today, and `packages/satellite` would need a tar-parsing dependency added. See the `[VERIFY]` in `process.ts` and architecture §11.1 for the full detail on both 2 and 3 |
| `TASK-fields-management` (Phase 6) | `15:8608`, which reuses this task's `RasterOverlay` with the viridis zone ramp |
| Design follow-ups | The four new gaps from §1.2, D19's exact ramp stops, and D3's remaining states |

---

## 10. Landed

**2026-08-16.** All seven §7 decisions taken as recommended (disabled Relative dropdown; ramp
constants moved to `packages/contracts`; the job-status endpoint built; the measure tool built;
the assistant FAB omitted; grouped by classification; built against the seed's real 3 zones /
1.8 ac rather than enlarging the demo boundary).

### Deviations from §2

- **Toast primitive wasn't in the plan.** §2.9/§2.10 assumed one existed; none did. Vendored
  `alert.tsx` + `toast.tsx` + `toast-alert.tsx` from AlignUI's docs the same way as everything
  else (`components/ui/SOURCES.md`), added `sonner`, mounted one `<Toaster />` in the root
  layout. Two small bug fixes to the vendored `toast.tsx` were needed to satisfy this repo's
  `declaration: true` tsconfig and the installed `sonner@2.0.8`'s real types — both recorded in
  `SOURCES.md`, neither changes behaviour.
- **`react-day-picker`'s version wasn't `@4`** as the docs page's dependency listing claimed —
  that number doesn't match the vendored component's own classic-API `classNames` (`day_range_
  start`, `nav_button_previous`, …), which is the **v8** API. Installed `react-day-picker@8.10.2`
  (the last 8.x release, the first with `react: "^19.0.0"` in its peer range) + `date-fns@^3`.
  Full reasoning in `SOURCES.md`.
- **A real, live bug found while verifying item 2, not anticipated by §2:**
  `packages/db/src/seed-satellite.ts`'s synthetic raster filled its whole bounding-box rectangle
  with valid pixels — it never clipped to the field's actual (possibly non-rectangular) boundary
  the way a real CDSE Process API response is clipped server-side. `RasterOverlay` painted the
  full bbox as solid colour regardless of the field's real shape. Fixed by point-in-polygon
  clipping the synthetic raster to the field's real boundary (`clipToBoundary`, using
  `packages/raster`'s own `pixelToLonLat` + `@turf/turf`'s `booleanPointInPolygon`) before it's
  encoded — a no-op for the canonical rectangular demo fields (bbox == boundary exactly), but
  correct for any field whose stored boundary has drifted from that (e.g. hand-edited via
  `DrawControl` during earlier manual testing, which is what this environment's dev DB had).
- **`FieldMap` needed one export, not an edit** — §2.6 said "gains nothing but a wider `children`
  contract," which was already true from `TASK-fields`. The one addition:
  `FIELDS_FILL_LAYER_ID` exported so `RasterOverlay` can pass `beforeId` and render below the
  field boundary lines instead of on top of them.
- **`components/map/field-map.tsx` and `components/map/config.ts`** are the only two files edited
  rather than added among the "map" affected files; everything else in §2.6 is new, as planned.

### §6 verification — honest results

| # | Result |
|---|---|
| 1 | **Pass.** `apps/web/e2e/stress.spec.ts`'s first test — Field 237 renders 3 rows, summary matches |
| 2 | **Pass, after a fix.** The seed's clip bug (above) was found by looking at a live render before this item could pass; re-verified against a fresh `db:seed:satellite` run producing the same 3 zones / 1.8 ac as before the fix (Field 237's boundary is a rectangle, so the clip is a no-op there) |
| 3 | **Pass.** `stress.spec.ts`'s legend-labels test, asserted against the API's own stats payload |
| 4 | **Implemented, not e2e-tested.** The zone list query has no `date` param by construction (§3.2) — no test asserts the list is byte-identical across a date change; a reasonable gap to close before `TASK-tasks-board` if this screen changes again |
| 5 | **Pass.** `stress.spec.ts`'s mute/show-muted test |
| 6 | **Pass.** `stress.spec.ts`'s classify test |
| 7 | **Partially verified.** The row disappears and stays gone after reload (e2e); the "still exists with `deleted_at` set" SQL check itself wasn't added — `apps/api/test/observations.e2e.spec.ts`'s existing `DELETE /stress-zones/:id soft-deletes` test (from `TASK-satellite-pipeline`) covers the soft-delete contract at the API level (a second delete 404s) |
| 8 | **Pass.** `stress.spec.ts`'s Field 240 stale-badge test |
| 9 | **Pass.** `tenancy.e2e.spec.ts`'s new `GET /fields/:id/observations/refresh/:jobId` entry (14 total registry entries, all pass); `observations.e2e.spec.ts` additionally covers the specific foreign-job-id-on-own-field case |
| 10 | **Pass.** `apps/api/test/nfr4.spec.ts` unchanged, still green |
| 11 | **Pass.** `observations.e2e.spec.ts`'s existing p95 test, unaffected by this task's changes |
| 12 | **Not run** — no live Figma connection in this session, same gap `TASK-fields` §6 item 14 recorded. Follow-up below |
| 13 | **Not run** — needs `db:seed:bulk` against a real Mapbox token, same infrastructure gap `TASK-fields` §6 item 15 recorded |
| 14 | **Implemented, not e2e-tested.** The poll (`refetchInterval`, 2 s, 2 min timeout) and the `unknown`-after-timeout path are built exactly per §2.10; killing a worker mid-poll wasn't exercised by an automated test — doing so needs process control this Playwright suite doesn't have |
| 15 | **Pass.** `observations.e2e.spec.ts`'s new test reads the job back via `createRefreshQueue().getJob()` and asserts `opts.attempts === 5` |
| 16 | **Pass.** `grep -rEn "#[0-9a-fA-F]{3,8}" apps/web` outside the three named files + this task's every new component file returns nothing new (the pre-existing hits are all in vendored `chart.tsx`/`avatar-empty-icons.tsx`/`avatar.tsx` and `shell.spec.ts`'s own assertions, none of which this task touched) |
| 17 | **Pass.** Every icon name checked against `@remixicon/react`'s real exports before use |
| 18 | **Pass, with two caveats, neither a regression.** `pnpm turbo run build typecheck lint test` is green across all 8 packages when run at `--concurrency=1` (this machine's Docker/testcontainers setup flakes under turbo's default parallel scheduling — confirmed by re-running the two affected suites, `api#test` and `worker#test`, alone). The one test that stayed red in every configuration, `auth.e2e.spec.ts`'s rate-limit case, is caused by `AuthThrottlerGuard` being commented out on `apps/api/src/auth/auth.controller.ts`'s `/login` route in this environment's working tree — a local, uncommitted change made outside this task (confirmed via `git stash`: the test passes clean against `HEAD`). `apps/web/e2e/fields.spec.ts`'s 22 tests are not byte-unchanged — §2.12's `View Details` re-point required editing its "View Details opens the editor" test into "View Details navigates to Crop Stress" and adding a new "double-clicking a card opens the editor" test; both pass, and the file still has the same 9 tests it had (one split into two) |
| 19 | **One `[VERIFY]` remains open, restated, not resolved:** `raster-overlay.tsx`'s Web Mercator vs. equirectangular corner offset at high zoom — sub-pixel by calculation, not measured live against a real Mapbox token in this session |

### What `TASK-tasks-board` should know going in

- The "create a task from this stress zone" button belongs on `StressPopover`
  (`components/flora/stress-popover.tsx`) — it needs the task domain (`packages/contracts`,
  `apps/api`'s tasks module) that doesn't exist yet, so it's still just named in §5, not stubbed.
- `StressZone.classification`/`.mutedAt` are read live by this screen via
  `["stress-zones", fieldId, sort]` — a Tasks feature that also writes to `stress_zones` should
  invalidate that same query key.
- `RasterOverlay` is written to be reused by `TASK-fields-management` (Phase 6) with a different
  ramp — it takes `rasterUrl`/`bbox` only, no NDVI-specific assumptions baked in.
- The manual-refresh poll pattern (`useQuery` + `refetchInterval` returning `false` to stop,
  derived "is polling" state rather than an effect that calls `setState` to turn it off) is
  reusable for any other long-running job a future screen needs to watch — `react-hooks/
  set-state-in-effect` in this repo's ESLint config will flag the naive version.
