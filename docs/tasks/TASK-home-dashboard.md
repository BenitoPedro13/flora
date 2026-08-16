# TASK-home-dashboard — the Home screen (`1:12913`)

> **Phase:** 4 (architecture §16). The spine (Phases 1–3) is complete and shippable; Home is
> the first screen that *reads across* it rather than owning a domain of its own.
> **Blocked by:** `TASK-fields`, `TASK-satellite-pipeline`, `TASK-crop-stress`,
> `TASK-tasks-board` — all landed. Nothing blocks this.
> **Blocks:** nothing. Phase 5 (`TASK-weather`) is independent of it (architecture §16), but
> §2.6 pulls that phase's *write path* forward, so Phase 5 starts as a screen over a populated
> table rather than as a screen-and-pipeline task.
> **Design:** `1:12913` ("Home"), 1440×900 · design-spec §5.1, §4.1, §4.5, §6.2, §6.3, §7.2.
> **Status:** planned 2026-08-16, against `e44aac4`. All ten §7 decisions taken 2026-08-16.
> **Part A (the write path, §2.1–§2.9, §2.12) is complete and landed** across three commits
> (`8f5748a` rollup data layer, `38f9554` weather ingest + dashboard endpoint + worker jobs,
> `6aa6570` seed scripts) — 95 `@flora/db` tests, 3 `@flora/weather` tests, 70 `apps/api` e2e
> tests (one pre-existing unrelated failure), 3 `apps/worker` tests, all green; `pnpm turbo run
> typecheck build` clean across all 9 packages. Part B (§2.10–§2.14, the screen) is next.
>
> **Every geometry figure in §1.3 is measured** off `get_metadata`/`get_screenshot` on
> `1:12913` (file `hY3Nd3BBbJsjpihPnfZgpd`), the same way `TASK-tasks-board` §1.3 measured the
> board. Where design-spec §5.1's prose disagrees, §1.3 is right and §2.15 corrects the prose.
>
> **Read §7 before writing code.** This screen has more undefined data than any screen so far
> — seven widgets, of which two (Regeneration Score, Gathering Rate) had no formula and no
> source anywhere in the architecture, and one (Weather) depends on a provider nobody has
> integrated yet. §7 has ten decisions. **Three are already taken (2026-08-16):** decision 0
> (one document, two commits), decision 2 (build the Open-Meteo ingest now), and decision 3
> (the Regeneration Score — §2.4 settles architecture §17 **Q2** against *published*
> agri-environmental indicators rather than an invented composite). The rest still need your
> sign-off.

---

## 1. Current scenario

### 1.1 What exists

- **`apps/web/app/(app)/page.tsx`** is still the one-line session sentence from
  `TASK-auth-tenancy` — "Logged in as … — … (owner)" inside a `PageContainer`. It is the
  **only** consumer of `PageContainer` that predates `TASK-tasks-board` §7 decision 5's width
  correction, and it is deleted by this task.
- **Every domain Home aggregates is built and populated**: `crop_cycles.quantity_kg` and the
  `fields` geometry (Phase 1), `stress_zones` with `muted_at` (Phase 2), `tasks` with
  `status`, `progress_pct`, `activity`, assignees and `water_volume_m3` (Phase 3).
- **`components/flora/`** already has `Card`/`CardHeader` (design-spec §4.5's anatomy),
  `TaskCard`, `ActivityTag`, `PageHeader` (slot-based: `leading`/`title`/`subtitle`/`actions`
  — Home's avatar + greeting needs no change to it), `PageContainer` at the corrected
  `max-w-[1168px] px-8`, and `TaskEditor` (the create-task modal, reachable from anywhere).
- **`components/ui/`** already has everything this screen's chrome needs — `Badge`, `Button`,
  `Compact Button`, `Button Group`, `Divider`, `Tooltip`, `Avatar`, `Avatar Group`,
  `Progress Circle`. **No new vendored component is required** (§7 decision 8 revisits this).
- **`components/ui/chart.tsx`** (shadcn over **Recharts 3.10.1**, already a dependency) and
  **`components/charts/config.ts`** (the green ramp, gridline stroke, axis label class, dark
  tooltip, `chartConfigFromKeys`) were both built by `TASK-design-system-shell` and have
  **never had a consumer**. This task is the first. Recharts v3 tokens are `var(--chart-1)`,
  never `hsl(var(--chart-1))` (design-spec §7.1).
- **The worker has one queue and one scheduler** — `SATELLITE_QUEUE_NAME`,
  `SchedulerService.upsertJobScheduler` per field at `0 3 * * *` in the farm's timezone, and
  `RefreshProcessor` running every job inside `withOrganization`. `scheduler_fields_due_for_refresh()`
  is the pattern for a cross-org read from a job: a `SECURITY DEFINER` function returning ids
  and a timezone only, named in `tenancy.spec.ts`'s **two-entry allowlist**.
- **`db:seed:demo`** creates 4 fields, **all four growing `Corn`**, 1900 kg each, 8 non-`done`
  tasks + `done` tasks with `water_volume_m3 = 4.5` on the watering one, 2 teammate
  memberships, comments and subtasks. `db:seed:satellite` replays a synthetic raster through
  the real `packages/raster` pipeline to produce `observations` and `stress_zones`.

### 1.2 What does not exist

| Missing | Where it goes |
|---|---|
| `farm_daily_rollups` (architecture §7.6 names it; no migration ever created it) | `packages/db/src/schema/rollup.ts` + migration |
| `farm_scores` (architecture §5.4 names it; likewise) | same |
| `weather_snapshots` (architecture §5.3 names it; likewise) | same |
| The Regeneration Score formula | architecture §17 **Q2** — **closed by §2.4**, which sources it from published indicators instead of inventing one. `packages/db/src/scoring/` |
| Any rollup query or aggregate | `packages/db/src/queries/rollups.ts` — all SQL (invariant 5) |
| Any rollup job, queue or schedule | `apps/worker/src/rollups/` |
| Any weather client | `packages/weather/` — §2.6 |
| `GET /api/v1/farms/:id/dashboard` | `apps/api/src/dashboard/` — architecture §8.3 reserves the route, nothing built |
| A dashboard contract | `packages/contracts/src/dashboard.ts` |
| Every chart on the screen | `components/charts/` — the directory holds `config.ts` and nothing else |
| `KpiTile`, `KpiRow`, `DeltaBadge`, `WeatherDayCard`, `ArcGauge`, `CropDonut` | `components/flora/`, `components/charts/` (design-spec §6.2, §6.3) |
| A compact `TaskCard` | the Home card is **156** tall, the board's is **184** — §2.11 |
| 12 months of history to plot | the demo data is ~100 days old and single-crop — §2.12 |

### 1.3 Measured geometry — `1:12913`

Artboard 1440×900. Sidebar 272, page header 1168×88, content column **x=298, width 1110**
(design-spec §4.1). `PageContainer` gives **1104** of content at `max-w-[1168px] px-8`; every
width below is measured at 1110 and scales by 0.995 — inside NFR-10's 2%.

**Row 1** — `2308:30802` at (298, 94), **1110 × 218**. **One bordered container**, radius 16,
with internal dividers — not four cards. Three KPI cells of **214.33** then one **467** cell.

| Element | Measurement |
|---|---|
| KPI icon tile | 56×56 `bg-weak-50` rounded frame at (24, 24); 42 px fill glyph inset 7 |
| KPI label block | at (24, 139), 166.33 × 55 |
| Label row | 20 tall: `Label/Small` + a **16 px `info-custom-fill`** at y+2, 1 px after the text |
| Value row | at y+23, 32 tall: `Label/X Large` value, then a `Badge` **48×16** at value width + 8, y+8 |
| Crops Stocked cell | 467 wide at x=643. Header 467×**66**: `plant-line` 24 at (16, 21), title at x=48, `Buttons` **66×32** at (385, 17). Horizontal divider at y=66 |
| Donut cell | 221 wide. Ring frame 113×113 at (54, 19.5); the ellipse is **103** across at (5, 4.5); centred text box 63×48 at (25, 32.5) — `277T` 32 tall over `Crops` 16 tall |
| Legend | 246 wide, a **2×2 of 123×76 cells** with dividers. Each: 8 px dot at (16, 20), name 16 tall at (34, 16), value 24 tall at (16, 53) |

**Row 2** — y=328, height **270**, two cards, **16 px** gap.

| Card | Measurement |
|---|---|
| **Regeneration Score** `2307:18162` | (298, 328) **335 × 270**. It is a `Widgets [HR Management] [1.0]` instance. Header 303×28 at (16,16): `heart-add-line` 24 + title, `Buttons` **66×28** at x=237. Gauge frame 303×141 at (16, 60): the arc vector is **204.32 × 102.16** at (49.84, 20) — an exact 2:1 box, i.e. a **180° arc** of radius ~102. Centre text at (109.5, 57): `95` 85×40 over `total score` 85×16 at +43.93 (rendered **uppercase** — a style, not the string). Divider, then the "Rejected" row 303×37 at (16, 217): 37×37 icon tile with `heart-add-fill` 27.75, text at x=45 (`86` 18×20 over the sentence 167×16), `Compact Button` 28×28 at x=275 |
| **Planting Productivity** `2314:5882` | (649, 328) **759 × 270** → right edge 1408. Header 727×32 at (16,16): **`settings-4-line`** 24 + title, `Buttons` 66×28 at x=661. Chart 727×190 at (16, 64): y-axis labels `100% 75% 50% 25% 0%` in a 31-wide column, **40 px apart**; plot 688 wide from x=39, 6 gridlines; **12 bars, 40 wide, 55.36 px pitch**, each built of **4 stacked segments**; x-axis labels 16 tall at y=174, `Dec … Nov` |

**Row 3** — y=613, three cards of **unequal height**, gaps **24** then **16**.

| Card | Measurement |
|---|---|
| **Weather** `2314:9257` | (298, 613) **400 × 384**. Inner 368 at (16,16). Header 28: `sun-cloudy-line` + `Buttons` 66×28 at x=302. Two `Schedule Cards [Schedule] [1.0]` **368 × 143** at y=44 and y=203 (**16 gap**), each a filled `bg-weak-50` surface: 64×64 glyph at (16,16), day name 256×28 at (80,18) **right-aligned**, `+29 ºC` 79×32 at (16, 111), date 46×16 at the right edge |
| **Gathering Rate** `2307:30092` | (722, 613) **335 × 362.02** — 24 px after Weather. Inner 303. Header 28 (`shopping-basket-line`). Value row at y=32: `1,23T` 58×32 + `/day` 39×28 at y+2 + `Badge` 51×20 at (105, 6). `Button Group [1.0]` **303 × 24** at y=80 (`1D 1W 1M 3M 1Y`, **1M** selected). Chart 303×138.02 at y=120: plot 115.02 with 5 vertical + 3 horizontal gridlines and **two** area vectors, x labels 12 tall at y=126 (`Feb mar apr may jun jul` — rendered uppercase). Channel rows at y=274: two 20-tall rows 36 apart, each `icon 20 + label at x=26`, right cluster at x=170 width 133 (value 44 wide, then arrow 20 + delta at x=70) |
| **Pendent Tasks** `2308:30462` | (1073, **614** — one px lower than its neighbours) **335 × 396** → right edge 1408. Inner 303. Header 28 (`task-line`). List 303×320 at y=44: two cards **303 × 156**, **8 px** apart. Card rows: `Field:` at 16, divider at 44, title 24 tall at 56, `Progress Circle` 16 + `25%` at 92, then `user-3-line` 16 + `Avatar Group` 29.33 at x=20 + `ActivityTag` at x=53.33 at y=120 |

**Four things the metadata reveals that the screenshot cannot:**

1. **Row 3 overflows the artboard** — 613 + 396 = **1009 > 900**. The screen scrolls. So does
   Tasks; `TASK-tasks-board` §10 records that "the page not scrolling" was a live-found bug.
2. **The three row-3 cards hug their content** (384 / 362 / 396) and are **top-aligned**. The
   board hit exactly this: "columns stretching to unequal heights" was another live-found bug.
   `items-start`, not `items-stretch`.
3. **The Pendent Tasks card is the same `Widgets [HR Management]` block as the board's**, with
   the same three layers hidden (`Buttons`, `Stacked Progress Bar`, `Chart Legends`) — plus it
   drops the footer row entirely, which is the whole 184 → 156 difference.
4. **`info-custom-fill` is not a Remix Icon name.** Every other glyph on this artboard is
   (`plant-fill`, `drop-fill`, `heart-add-line/fill`, `sun-cloudy-line`, `task-line`,
   `store-2-line`, `arrow-up-line`, `user-3-line`, `settings-4-line`, `shopping-basket-line`,
   `instagram-line`, `plant-line`, `lightbulb-flash-fill`). `[VERIFY: the intended Remix name
   for the 16 px KPI info glyph — `information-fill` is the near-certain match; confirm against
   the @remixicon/react catalogue before shipping, design-spec §10 criterion 3.]`

### 1.4 What the design asks for that has no source

This is the longest such table in the project. Nothing below is a detail — each one changes
what ships.

| # | The design shows | The reality | This task |
|---|---|---|---|
| 1 | KPI **Energy Generated `63,3 MW`** | Energy is deferred (architecture §4.3); no meter exists | Replaced by **Fields at Risk** per §4.4 — §7 decision 1 |
| 2 | KPI deltas `↗14% ↘8% ↗14%` | A delta needs a previous value; no history table exists | §2.3 builds one; the badge is **hidden** when there is no comparison row, never faked |
| 3 | **Crops Stocked 277 T**, split Corn 35 / Wheat 28 / Soy 25 / Rice 12 | `crop_cycles.quantity_kg` exists, but the demo grows **Corn on all four fields** — the donut would be one slice | §7 decision 4 defines "stocked"; §2.12 seeds the history it implies |
| 4 | **Regeneration Score 95**, secondary **86** | **No formula anywhere.** Architecture §5.4 proposes a 3-component weighted mean and §17 **Q2** is open | §2.4 — **resolved 2026-08-16 against published indicators**, not invented |
| 5 | **Planting Productivity** — 12 months, 4 stacked segments, 0–100% | No definition of "productivity", no series, no history | §2.5, §7 decision 5 |
| 6 | **Weather**, today + tomorrow | Open-Meteo is Phase 5. No provider, no table, no job | §2.6 — the ingest is pulled forward, the screen is not |
| 7 | **Gathering Rate `1,23T/day`**, 6-month area, `1D…1Y` | Plausible from harvest volumes — but the two **channel rows (`Online Store $52.12`, `Instagram $37.75`)** are e-commerce. Flora has no orders, no money, no channels | §2.7, §7 decision 6 |
| 8 | **Pendent Tasks**, 2 cards | Real. `tasks` is populated | §2.11 — and it is the one widget that **must not** come from a daily rollup (§3) |
| 9 | Header **`+ Create Request`** | There is no request domain | §7 decision 7 |
| 10 | A **Details** button on all six cards, plus the score row's chevron | Two have destinations (`/fields`, `/tasks`); four have none — `/weather` is Phase 5, and Regeneration/Productivity/Gathering have no screen at all | §7 decision 9 |
| 11 | Header **search icon** and **bell with an unread dot** | Shell furniture. `TASK-tasks-board` §5 item 8 already recorded the bell as unbuilt | Rendered disabled with a tooltip, like every other undesigned control |

---

## 2. Planned changes

**Build in two parts.** Part A (§2.1–§2.9) is the write path and the endpoint: independently
verifiable with `curl` and integration tests, with no UI at all. Part B (§2.10–§2.14) is the
screen. This mirrors Phase 2's own split (`TASK-satellite-pipeline` then `TASK-crop-stress`)
and gives a real checkpoint halfway. §7 decision 0 asks whether they should also be two
commits, or two task documents.

### 2.1 Migration — three tables (Part A)

`packages/db/src/schema/rollup.ts`, generated by `drizzle-kit generate`, hand-reviewed
(`CLAUDE.md` §2.1 — it sees neither the RLS policies nor the composite FKs):

| Table | Shape | Notes |
|---|---|---|
| `farm_daily_rollups` | `organization_id`, `farm_id`, `day date`, `payload jsonb`, `computed_at` · **PK (`farm_id`, `day`)** | Exactly architecture §7.6's shape plus the `organization_id` every tenant table carries |
| `farm_scores` | `organization_id`, `farm_id`, `computed_on date`, `score numeric`, `components jsonb`, `formula_version text` · **PK (`farm_id`, `computed_on`)** | Exactly architecture §5.4's shape plus `formula_version`, so a formula change is visible in the data and not just in git |
| `weather_snapshots` | `organization_id`, `farm_id`, `observed_at timestamptz`, `horizon text`, `payload jsonb` · **PK (`farm_id`, `observed_at`, `horizon`)** | Architecture §5.3's shape (§2.6) |

All three: composite FK `(organization_id, farm_id)` → `farms`, `ON DELETE CASCADE`; standard
RLS `organization_id = app_current_org()`. `tenancy.spec.ts`'s catalog test will fail until
each has a policy — that is the point of it.

`payload` is JSONB rather than columns for the same reason `observations.stats` is
(architecture §5.3): adding a widget must not need a migration. It is validated on write and
on read against §2.8's zod schema, never trusted because it came out of our own table.

### 2.2 `packages/db/src/queries/rollups.ts` — all SQL (invariant 5, Part A)

One module, two public functions and one aggregate per widget:

- **`buildFarmRollup(tx, organizationId, farmId, day)`** — computes every aggregate below,
  upserts one `farm_daily_rollups` row and one `farm_scores` row, returns the payload. Called
  by the worker job (§2.9) **and** by the API's miss path (§2.8) — one implementation, the
  same precedent as `packages/raster/src/detect.ts` being shared by the worker and the seed
  (`TASK-satellite-pipeline` §2.11).
- **`getFarmRollup(tx, organizationId, farmId)`** — the latest row, plus the row from **7 days
  earlier** for §2.3's deltas, in one query.

Aggregates, each its own exported function so each is its own test:

| Aggregate | SQL |
|---|---|
| `cropsStockedByCrop` | `SUM(crop_cycles.quantity_kg) GROUP BY crop`, filtered per §7 decision 4; share % computed from the same sum |
| `fieldsAtRisk` | `COUNT(DISTINCT field_id)` over `stress_zones` where `muted_at IS NULL AND deleted_at IS NULL` |
| `waterUsedM3` | `SUM(tasks.water_volume_m3)` where `activity = 'watering' AND status = 'done'`, over the trailing **30 days** (§7 decision 1) |
| `plantingProductivity` | 12 monthly buckets × crop, per §7 decision 5 — a `generate_series` of months LEFT JOINed to `crop_cycles` overlapping each month, with area from `ST_Area(fields.boundary)` (invariant 3: derived, never stored) |
| `gatheringRate` | daily/weekly harvested kg from `crop_cycles` per §7 decision 6, plus the same window offset back one period for the second series |
| `regenerationComponents` | the inputs §2.4's formula consumes — mean NDVI from `observations.stats`, stress-free area share, water per tonne |

Every function takes `organizationId` and filters on it — tenancy enforced twice
(invariant 6), never RLS alone.

### 2.3 KPI deltas — real or absent (Part A)

Each KPI's delta is `(today − 7 days ago) / 7 days ago`, read from the rollup row seven days
back. **When that row does not exist the badge does not render.** The design always draws it;
drawing `↗0%` or a fabricated number on a farmer's landing screen is worse than a 48 px gap,
and hiding it moves nothing (the badge is the last element in its row).

The window is a decision (§7 decision 1) and it is **not** invisible: the design already puts a
16 px info icon beside every KPI label, so the tooltip that explains "vs. 7 days ago" is a
designed affordance, not an invention. That tooltip also carries the rollup's own `day`, which
is how a farmer can tell yesterday's number from today's — the same honesty NFR-8 demands of
the stale badge.

### 2.4 The Regeneration Score — published indicators, not an invented composite (Part A)

Architecture §5.4 is explicit that this "**is a product decision and must not be invented in
code**", and §17 Q2 has been open since day one. **Resolved 2026-08-16 by using existing,
published agri-environmental indicators** rather than either inventing a composite or shipping
a single component — the decision the architecture was really asking for was "whose formula",
and the answer is that three of the four pieces already exist in the literature.

**The scale is not ours.** Agriculture and Agri-Food Canada's agri-environmental **performance
index** is 0–100 in five 20-point classes: **At risk 0–19 · Poor 20–39 · Moderate 40–59 ·
Good 60–79 · Desired 80–100**. The design's gauge is already 0–100 and reads **95**, which on
that scale is *Desired* — so the card gets a real class name under the number instead of
"total score" meaning nothing, and "an increase over time indicates improvement" is that
framework's own reading of the secondary **86**.

**The components**, each normalised to 0–100 and area-weighted across the farm's fields:

| # | Component | Weight | Definition | Source |
|---|---|---|---|---|
| 1 | **Soil cover** | 0.50 | Flora's analogue of AAFC's **Soil Cover Days (SCD)** — "the total equivalent number of days that soils are covered" (100% cover for 1 day = 50% for 2 days = 1 SCD). Computed by integrating fractional vegetation cover over time between consecutive NDVI observations in the trailing 365 days (trapezoid), then `days / 365 × 100`. Fractional cover from NDVI uses the **dimidiate pixel model**, `fc = clamp((NDVI − NDVI_soil) / (NDVI_veg − NDVI_soil), 0, 1)` | AAFC Soil Cover Indicator; Gutman & Ignatov (1998), linear form. Carlson & Ripley (1997) square the same ratio — §7 decision 3 picks the linear form and records why |
| 2 | **Crop diversity** | 0.25 | Normalised **Shannon evenness** over crop cycles in the trailing 3 years, weighted by field area: `H' = −Σ pᵢ ln pᵢ`, score `= H' / ln(S) × 100`, where `S` = distinct crops. `S = 1` scores **0**, honestly | Standard Shannon–Wiener index, the usual instrument for rotation diversity |
| 3 | **Vegetation health** | 0.25 | Share of field area free of unmuted, non-deleted `stress_zones` × 100 | Flora's own Phase 2 output — architecture §7.5's rules |

**What is ours, and is labelled as ours:** the three **weights**. The components and their
normalisations are published; nothing in the literature says regenerative performance is
50/25/25. That split is a defensible product judgement — soil cover is the one principle every
regenerative framework agrees on, and it is the component with the most data behind it — and
`formula_version` exists precisely so `v2` is a visible upgrade rather than a silent one.

**Two honest limitations to state on the card, not bury:**

- **AAFC's SCD counts crop canopy, crop residue *and snow*.** Flora sees only what the
  satellite sees, so component 1 is the **canopy-cover subset** of SCD. It is a lower bound on
  the real indicator, not the indicator itself.
- `NDVI_soil = 0.15` / `NDVI_veg = 0.85` are the conventional endpoints for the dimidiate
  model, not per-crop calibrations. `[VERIFY: these two endpoints are commonly cited in the
  0.05–0.20 and 0.80–0.95 ranges and are properly calibrated per sensor and per land cover.
  Confirm the pair chosen against a Sentinel-2 source before shipping, and record them as
  constants next to the formula, not inline.]`

**Missing components do not become zeros.** A farm with fewer than two observations in the
window has no soil-cover figure; the remaining weights renormalise, and `components jsonb`
records which ones were present so the card can say what the number is actually based on. A
score computed from one component is labelled as such — the honesty rule architecture §5.4's
own fallback was reaching for.

`packages/db/src/scoring/regeneration.ts` exports `REGENERATION_FORMULA_VERSION` and a pure
`computeRegenerationScore(components) → { score, class, components }`, where `class` is the
AAFC five-class rating. Every stored row carries the version string.

Sources: [AAFC Soil Cover Indicator](https://agriculture.canada.ca/en/environment/resource-management/indicators/soil-cover-indicator) ·
[Risk to soil and water quality — data sources and methods](https://www.canada.ca/en/environment-climate-change/services/environmental-indicators/publications/risk-soil-water-data-methods/chapter-2.html) ·
[Improving and evaluating the soil cover indicator for agricultural land in Canada](https://www.sciencedirect.com/science/article/abs/pii/S1470160X1400315X) ·
[Analysis of NDVI and scaled difference vegetation index retrievals of vegetation fraction](https://www.sciencedirect.com/science/article/abs/pii/S0034425706000290) (Carlson & Ripley / Gutman & Ignatov comparison) ·
[Standardized Metrics in Regenerative Agriculture](https://www.mdpi.com/2077-0472/15/21/2278) ·
[Shannon diversity index](https://www.foodsystemsdashboard.org/indicators/food-supply-chains/production-systems-and-input-supply/shannon-diversity-food-supply)

**Deviation from architecture §5.4, which places this in `apps/worker/src/scoring/`:** the API
recomputes on a rollup miss (§2.8), so the function cannot live in the worker without being
duplicated. Same situation, same resolution, same precedent as `detect.ts`. §2.15 amends §5.4
rather than leaving the document wrong.

The secondary **86** is the previous stored score (yesterday's `farm_scores` row), and the
sentence beneath it is chosen from the comparison — up, down, or equal. If there is no previous
row, the row renders the score's own components instead of a comparison. Nothing invented.

### 2.5 Planting Productivity (Part A)

§7 decision 5 chooses the definition. The recommendation — **share of the farm's field area
under an active crop cycle in each month, stacked by crop** — is the only candidate that
matches every measured property of the chart at once: a 0–100% axis, four stacked segments,
and totals that vary month to month rather than always summing to 100.

It needs 12 months of `crop_cycles` history the demo does not have; §2.12 seeds it.

### 2.6 Weather (Part A — decided: build it)

§7 decision 2, **decided 2026-08-16: yes**. This task builds the **write path only**, tightly
scoped:

- `packages/weather/` — an `OpenMeteoProvider` behind a `WeatherProvider` interface, mirroring
  `packages/satellite`'s shape. **Tested from recorded HTTP fixtures** (`CLAUDE.md` §Tests),
  never hand-built mocks.
- One hourly repeatable BullMQ job per farm, writing `weather_snapshots` (architecture §11.3).
- Architecture §11.3's `[VERIFY]` on parameter names must be **resolved against Open-Meteo's
  current docs** before the code ships (`CLAUDE.md` §2.0), and its licence terms recorded.

Home reads only `{ date, tempC, weatherCode }` for today and tomorrow. The 7-day forecast, wind,
UV, pressure and sunrise/sunset are fetched and stored (they are the same request) but **no
screen** is built — that stays Phase 5, which then becomes a screen over an existing write path
exactly as `TASK-crop-stress` was.

### 2.7 Gathering Rate (Part A)

§7 decision 6. The top half of the card — a rate in T/day, a delta badge, a range group and a
two-series area chart — has a real source in harvested `crop_cycles`. The two channel rows do
not, and no amount of squinting turns `$52.12` from an Instagram store into farm data.

The recommendation keeps the row *geometry* (icon · label · value · delta) and fills it with
the **top two crops by harvested volume in the window, with their own period-over-period
delta** — same shape, same pixels, real numbers, no invented commerce domain. It is a
substitution and §2.15 logs it as one (new gap **D26**).

### 2.8 `packages/contracts/src/dashboard.ts` + `apps/api/src/dashboard/` (Part A)

`dashboardSchema` covers the whole payload — `kpis`, `cropsStocked[]`, `regeneration`,
`plantingProductivity[]`, `gatheringRate`, `pendingTasks[]` (reusing `taskSchema` from
`TASK-tasks-board`), `weather`, and the meta `{ day, computedAt }` §2.3's tooltips read.
Invariant 4: one schema, both sides.

`GET /api/v1/farms/:id/dashboard` (architecture §8.3 already reserves it), `createZodDto()`,
registered in `app.module.ts`, in the cross-tenant registry (NFR-7 → a foreign farm id is
**404**, not 403).

**The endpoint issues three queries, not one — deliberately.** Architecture §7.6 says Home
reads one materialised row. That is right for six of the seven widgets and **wrong for
Pendent Tasks**: a task completed at 09:00 would keep showing as pending until tomorrow's
rollup. So the endpoint is: one rollup read (+ its 7-day-old sibling), one live indexed read of
the task queue head, one live read of the latest weather snapshot. Two of the three are single
index lookups. §2.15 corrects §7.6 to say this rather than leaving the document describing
something we knowingly didn't build.

**On a rollup miss** — a farm that has never been rolled up, i.e. every farm on the first
deploy — the endpoint calls `buildFarmRollup` inline and persists it. The alternative (return
"pending" and let a job catch up) makes a farmer's first-ever login look broken. This is
aggregate SQL against the tenant's own small dataset, and invariant 1 is untouched: it forbids
**Sentinel Hub** on a request path, not `GROUP BY`. NFR-1's 300 ms p95 is measured on the hit
path; §6 item 4 measures the miss path separately and states its number.

### 2.9 `apps/worker/src/rollups/` (Part A)

A second queue (`ROLLUP_QUEUE_NAME = 'rollups'`), a processor, and a scheduler service that
mirrors `SchedulerService` exactly: one Job Scheduler per **farm** at `30 3 * * *` in the
farm's own timezone — 30 minutes after the satellite wave, so a rollup sees the night's fresh
observations. Every job body runs inside `withOrganization`.

It also enqueues **on demand** at the end of `RefreshProcessor` (architecture §7.6: "rebuilt by
a job after the satellite refresh completes"), deduplicated with `jobId: rollup:${farmId}:${day}`
so a 200-field farm produces one rollup, not 200.

Cross-org enumeration needs a third `SECURITY DEFINER` function,
**`scheduler_farms_due_for_rollup()`**, returning `(organization_id, farm_id, timezone)` and
nothing else — the same minimal shape `tenancy.spec.ts` already asserts for its sibling. That
test's allowlist goes from **two entries to three**, and the change must be made in the
allowlist deliberately, not by loosening the assertion.

### 2.10 `components/charts/` — four charts, first consumers of `config.ts` (Part B)

Per design-spec §7.2, all four from shadcn/Recharts:

| File | Chart | Notes |
|---|---|---|
| `crop-donut.tsx` | `PieChart` + `innerRadius` | 103 px ring, centred `277T` / `Crops` label |
| `planting-productivity-chart.tsx` | stacked `BarChart` | 12 categories × 4 series, 40 px bars, 0–100% axis in 25% steps |
| `gathering-rate-chart.tsx` | `AreaChart` + gradient | two series (current window, previous window), 5+3 gridlines |
| `arc-gauge.tsx` | `RadialBarChart` | 180° (`startAngle 180 / endAngle 0`), rounded cap, centred label — design-spec §6.2 maps `Gauge Bar [Time Off] [1.0]` to this |

All colours come from `config.ts`'s `--chart-*` ramp; no chart file gets a raw hex
(invariant 7). `ArcGauge` is reused by Weather's Rain Chance in Phase 5 — keep its props
generic (`value`, `max`, `label`), not score-specific.

### 2.11 `components/flora/` — the composites (Part B)

`KpiTile` and `KpiRow` (the single bordered container with its dividers — §1.3 is explicit
that these are not four cards), `DeltaBadge` (arrow direction and success/error colour from the
sign; renders nothing for `null` per §2.3), `WeatherDayCard` (design-spec §6.2's rebuild of
`Schedule Cards [Schedule] [1.0]`), `RegenerationCard`, `GatheringRateCard`, `PendingTasksCard`.

**`TaskCard` gains a `compact` variant** rather than a second component: same block, footer row
omitted, 184 → 156. The board must render byte-identically afterwards — `tasks.spec.ts` and the
`tasks-board.png` diff are the guard.

### 2.12 `db:seed:demo` and a new `db:seed:rollups` (Part A/B seam)

Home is the first screen that needs **history**, and the demo data is 100 days old and
single-crop. Two additions:

- **`db:seed:demo`** gains 12 months of **harvested** `crop_cycles` across all four seeded
  crops (Corn, Wheat, Soy, Rice already exist as reference rows since `TASK-auth-tenancy`),
  spread over the four demo fields with varied `quantity_kg`. The partial unique index only
  constrains `status = 'growing'`, so historical harvested cycles coexist with the four growing
  Corn cycles.
  **Constraint, inherited from `TASK-tasks-board` §2.10:** the four *growing* Corn cycles, the
  eight non-`done` tasks and their activity tags are what `fields.spec.ts`,
  `fields-list.spec.ts` and `apps/web/e2e/fields.spec.ts` assert on. **Add rows; never
  repurpose the existing ones.** §6 item 14 is the guard.
- **`db:seed:satellite`** gains a **12-month history mode**. §2.4's soil-cover component
  integrates fractional cover *between consecutive observations over 365 days*, and the current
  seed writes a handful of recent dates — which would score a well-managed demo farm near zero
  and make the gauge look broken when it is in fact correct. The history must be produced the
  same way the existing seed produces its single date: **synthetic rasters replayed through the
  real `packages/raster` pipeline**, on a realistic ~5-day Sentinel-2 revisit cadence with a
  seasonal NDVI curve, never hand-written `observations` rows. `TASK-crop-stress` §10's lesson
  applies — a seed that skips the real code path hides real bugs (its rectangle-vs-boundary
  clipping bug was exactly that).
- **`db:seed:rollups`** runs the **real** `buildFarmRollup` for each of the last 30 days —
  replaying the real code path, exactly as `db:seed:satellite` replays the real raster
  pipeline. That is what makes §2.3's deltas real instead of hand-written JSON, and it means a
  bug in the aggregate shows up in the seed rather than hiding behind fixture data.

### 2.13 `apps/web/app/(app)/page.tsx` (Part B)

A Server Component: resolve the session, pick the farm (§7 decision 9's note on multi-farm
orgs), fetch the dashboard through `lib/api-client.server.ts`, render the three rows. Only the
four charts and the `TaskEditor` trigger are `"use client"` (architecture §9.2).

Two things the board learned live and this screen must get right the first time (§1.3 notes 1
and 2): **the content column scrolls**, and **row 3 is `items-start`**, not stretched.

Loading and empty states have no artboard (design-spec D3, still open for every screen but
Crop Stress). Skeletons occupy final dimensions (design-spec §10 criterion 6); a farm with no
fields renders each widget's own zero state rather than a blank card.

### 2.14 Tests (Part A and B)

- `packages/db/src/queries/rollups.spec.ts` — testcontainers, real PostGIS. Every aggregate
  against known seeded rows: the donut's shares sum to 100, `fieldsAtRisk` ignores muted and
  deleted zones, `waterUsed` ignores non-`watering` and non-`done` tasks, the 12-month series
  has 12 buckets including empty ones, and `buildFarmRollup` is **idempotent** for a given day.
- `packages/db/src/scoring/regeneration.spec.ts` — the formula as a pure function, including
  its clamp at 0 and 100 and its behaviour when a component is missing.
- `apps/api` e2e — the endpoint, the miss path (empty table → 200 with a persisted row), and
  the cross-tenant 404 (NFR-7).
- `packages/weather` — recorded-fixture tests, never hand-built mocks (§2.6).
- `apps/web/e2e/home.spec.ts` — every KPI, the donut shares, the gauge number and the two task
  cards match a direct SQL query; the delta badge is **absent** when no 7-day-old rollup exists.
- **NFR-10**: fetch the `1:12913` export via the Figma MCP, commit it as
  `e2e/baselines/home.png`, diff at 1440×900 ≤ 2%. Figma is reachable from this environment —
  `TASK-tasks-board` §2.11 proved it and committed the first baseline.
- **NFR-1**: TTFB < 300 ms p95 and LCP < 1.5 s p95 on the rollup **hit** path, measured, not
  asserted by eye. The miss path gets its own recorded number (§6 item 4).

### 2.15 Documentation (`CLAUDE.md` §3)

| Doc | Change |
|---|---|
| `docs/design-spec.md` §5.1 | Replace the prose with §1.3's measured tables |
| `docs/design-spec.md` §9 | **D11** resolved or restated per §7 decision 1; new gaps **D24** (the Regeneration Score's number and its `total score` caption — §2.4 gives it a real formula and a real class name, so the caption and the secondary row's copy need a designer's eye), **D25** (Planting Productivity undefined), **D26** (the Gathering Rate channel rows have no domain — what replaced them), **D27** (`+ Create Request` has no request domain), **D28** (four of six Details buttons have no destination). Add "Pendent"→"Pending" to D10's list if §7 decision 7 changes the copy |
| `docs/design-spec.md` §6.2 | `Gauge Bar [Time Off]` → `ArcGauge` and `Schedule Cards [Schedule]` → `WeatherDayCard` both built; note that the Home instance of `Widgets [HR Management]` also drops the footer row |
| `docs/architecture.md` §4.4 | Q3's `[VERIFY]` — resolved or restated with what shipped |
| `docs/architecture.md` §5.3 | Record the three new tables as created |
| `docs/architecture.md` §5.4 | **Rewrite.** Its proposed composite is superseded by §2.4's published-indicator definition (AAFC performance index · Soil Cover Days · Shannon evenness · stress-free share), with the sources cited, the weights marked as Flora's own, the version string, and the **move to `packages/db/src/scoring/`** and its reason |
| `docs/architecture.md` §7.6 | Correct "Home therefore issues one query" — three, and why (§2.8) |
| `docs/architecture.md` §8.3 | Mark `/farms/:id/dashboard` built; note `/farms/:id/weather`'s ingest exists but its route is Phase 5 |
| `docs/architecture.md` §11.3 | Resolve the Open-Meteo parameter-name `[VERIFY]` and record the licence terms |
| `docs/architecture.md` §16, §17 | Phase 4 status; **Q2 closed** (§2.4 — a real formula, sourced); **Q3** closed or restated |
| `CLAUDE.md` | Status paragraph; next is Phase 5 |
| `README.md` | Status line |

---

## 3. Why

**Why a rollup table at all.** Home is the most-visited screen and the only one that touches
six domains. Six live aggregates — two of them spatial, one over 12 months of history — on
every page load makes the landing screen the slowest thing in the product, which is exactly
what architecture §7.6 predicted and what NFR-1's 300 ms budget forbids.

**Why the task queue is *not* in the rollup.** Everything else Home shows is a slow-moving
aggregate; the pending-task head changes the moment a farmer drags a card. A rollup would show
completed work as pending for up to a day, and the one screen meant to tell you what to do
next would be the one screen that lies about it. Two extra index lookups is the right price.

**Why compute-on-miss instead of a pending state.** Every farm starts with no rollup. A "your
summary is being prepared" screen on first login is a worse first impression than 400 ms of
aggregation that then never happens again. The cost is bounded and the function is the same one
the worker calls.

**Why the delta badge disappears rather than reading 0%.** A farm dashboard is a decision
surface. A fabricated trend is not a cosmetic problem — it is the exact failure mode
architecture §13 condemns in the prototype's tests ("assertions on values they fed their own
mocks"), moved to the UI. NFR-8 already made this call for the stale badge.

**Why the Gathering Rate channel rows get real crop data instead of being disabled.** The
precedent set twice (`TASK-crop-stress` §7, `TASK-tasks-board` §7) is: disable an undesigned
*control*, don't remove it, because removing it moves everything to its right. But these are
not controls, they are two rows of *data*, and there is no farm-domain reading of "Instagram
$37.75" to disable. A same-shape row filled with a real number keeps the geometry the diff
depends on and tells the truth. Where a genuinely empty slot remains, disabled-with-tooltip
still wins over an empty state — an empty state promises a feature nobody designed.

**Why the score formula lives in `packages/db` and not `apps/worker`.** Because two callers
need it, and the one lesson `TASK-satellite-pipeline` §2.11 already paid for is that a
worker-private function becomes a duplicated function the moment anything else legitimately
needs to run it.

---

## 4. Affected files

| Path | Change | Notes |
|---|---|---|
| `packages/db/src/schema/rollup.ts` | new | §2.1 — three tables |
| `packages/db/migrations/0009_*.sql` | new | `drizzle-kit generate`, hand-reviewed; RLS + composite FKs added by hand |
| `packages/db/migrations/0010_*.sql` | new | `scheduler_farms_due_for_rollup()` (§2.9) |
| `packages/db/src/queries/rollups.ts` | new | §2.2 — all SQL (invariant 5) |
| `packages/db/src/queries/rollups.spec.ts` | new | Testcontainers |
| `packages/db/src/scoring/regeneration.ts` (+`.spec.ts`) | new | §2.4 — the published-indicator formula and its constants |
| `packages/db/src/queries/tenancy.spec.ts` | edit | Allowlist two → **three** (§2.9) |
| `packages/db/src/seed-demo.ts` | edit | §2.12 — add rows only |
| `packages/db/src/seed-satellite.ts` | edit | §2.12 — 12-month history mode, through the real pipeline |
| `packages/db/src/seed-rollups.ts` | new | §2.12 — replays the real builder |
| `packages/db/package.json` | edit | `db:seed:rollups` |
| `packages/contracts/src/dashboard.ts` (+ `index.ts`) | new/edit | §2.8 |
| `packages/weather/**` | new | §2.6 — provider + recorded fixtures |
| `apps/api/src/dashboard/` | new | Module, controller, service, DTO |
| `apps/api/src/app.module.ts` | edit | Register |
| `apps/worker/src/rollups/` | new | Queue, processor, scheduler (§2.9) |
| `apps/worker/src/satellite/refresh.processor.ts` | edit | Enqueue a deduplicated rollup on completion |
| `apps/worker/src/app.module.ts` | edit | Register the queue and both services |
| `apps/web/app/(app)/page.tsx` | edit | §2.13 — replaces the session sentence |
| `apps/web/components/charts/{crop-donut,planting-productivity-chart,gathering-rate-chart,arc-gauge}.tsx` | new | §2.10 |
| `apps/web/components/flora/{kpi-tile,kpi-row,delta-badge,weather-day-card,regeneration-card,gathering-rate-card,pending-tasks-card}.tsx` | new | §2.11 |
| `apps/web/components/flora/task-card.tsx` | edit | `compact` variant (§2.11) |
| `apps/web/e2e/home.spec.ts` | new | §2.14 |
| `apps/web/e2e/baselines/home.png` | new | The `1:12913` export |
| `.env.example` | edit | Any variable §2.6 reads (Open-Meteo needs no key; a base-URL override for the fixture tests is likely) |
| `docs/*`, `CLAUDE.md`, `README.md` | edit | §2.15 |

---

## 5. Explicitly out of scope

1. **The Weather screen (`3:5274`)** — Phase 5. §2.6 builds the ingest; there is no screen, no
   `/weather` route, no 7-day UI.
2. **Energy (`3:5920`) and Carbon Offset (`3:6566`)** — deferred by architecture §4.3. The KPI
   tile swap in §7 decision 1 is *not* a step toward building Energy.
3. **A farm switcher.** The design has none and every seeded org has one farm. Multi-farm orgs
   get the first farm by name and a logged gap; nothing is invented in the page header.
4. **Notifications and search** — the bell and the magnifier are rendered, disabled, with
   tooltips. Building either is a task nobody has written.
5. **A task detail view** — still `TASK-task-detail`. Home's task cards are not links to a
   drawer that does not exist; the card's Details button goes to `/tasks`.
6. **`TASK-stress-to-task`** — unchanged, still next in line, still not this.
7. **Backfill of historical satellite observations** (architecture §7.3's deferred item) — the
   Regeneration Score reads whatever `observations` exist and says so; it does not trigger a
   historical fetch. The `[VERIFY]` on backfill sizing stays open.
8. **Mobile/tablet (D1) and dark mode (D2)** — 1440 fixed, light only. Note D1 names "the
   4-across Home row" specifically as undefined below ~1280; that stays undefined.

---

## 6. Verification

Measurable, per architecture §15. No item passes on "looks right".

| # | Item |
|---|---|
| 1 | Every KPI value equals a direct SQL aggregate for the demo org — checked against SQL, not against the design's `277 T / 63,3 MW / 22 kL` |
| 2 | The donut's four shares sum to 100% and each matches `SUM(quantity_kg) GROUP BY crop`; a single-crop org renders one slice without breaking the ring |
| 3 | `buildFarmRollup` run twice for the same day produces one row and identical payload (idempotent), asserted in `rollups.spec.ts` |
| 4 | **NFR-1**: TTFB < 300 ms p95 and LCP < 1.5 s p95 on the rollup hit path. The **miss** path is measured separately and its number recorded in §10 — not assumed |
| 5 | With no 7-day-old rollup, **no delta badge renders** — and the layout does not shift when one later appears |
| 6 | The Regeneration Score equals `computeRegenerationScore` over the same components computed in SQL, carries its `formula_version`, lands in the right AAFC class, and the secondary number is a real previous row (or the row renders its components instead) |
| 6a | `regeneration.spec.ts` covers the published parts against hand-worked examples: a field covered at `fc = 1.0` for exactly half the year scores **50** on soil cover; a single-crop farm scores **0** on diversity; a farm with two equal-area crops scores **100** on it (`H'/ln 2 = 1`); and a farm with no observations renormalises to the remaining weights instead of scoring 0 |
| 7 | Planting Productivity has 12 buckets including months with no cycle, and no bucket exceeds 100% |
| 8 | Pendent Tasks reflects a task completed **one minute ago** — proving it is not read from the daily rollup (§3) |
| 9 | **NFR-7**: another org's farm id 404s (not 403) on `/farms/:id/dashboard` against real RLS, and the route is in the cross-tenant registry |
| 10 | `tenancy.spec.ts` passes with a **three-entry** allowlist, and `scheduler_farms_due_for_rollup()` returns ids and a timezone only — nothing a leak would be interesting about |
| 11 | A rollup job enqueued twice for the same farm and day runs **once** (the `jobId` dedup, §2.9) |
| 12 | **NFR-10**: visual diff ≤ 2% vs the `1:12913` export at 1440×900, baseline committed |
| 13 | The page scrolls to the bottom of row 3 (content is 1009 px tall at 900 px viewport), and the three row-3 cards keep their measured unequal heights (384 / 362 / 396 ±2%) |
| 14 | `fields.spec.ts`, `fields-list.spec.ts`, `tasks.spec.ts` and both e2e suites pass **unchanged** — §2.12's seed additions disturbed nothing, and `TaskCard`'s `compact` variant left the board byte-identical (`tasks-board.png` still ≤ 2%) |
| 15 | Every colour is a token class; a grep for raw hex under `apps/web` finds nothing outside `globals.css`, `components/charts/config.ts`, `components/map/config.ts` (invariant 7) |
| 16 | Every icon is a `@remixicon/react` import whose name matches the Figma layer, with §1.3 note 4's `info-custom-fill` resolved and recorded |
| 17 | **Invariant 1 holds**: NFR-4's test still passes — nothing under `apps/api/src` imports `@flora/satellite`, and the same test is extended to `@flora/weather`, which is likewise worker-only |
| 18 | `pnpm turbo run build typecheck lint test` exits 0 across every package |
| 19 | Every `[VERIFY]` this document introduces is resolved in a §10 or restated as still open — none silently disappear |

---

## 7. Decisions this task needs before code

**Decision 0 — one task or two? DECIDED 2026-08-16: one document, two commits.** Part A (write
path, §2.1–§2.9) is independently verifiable and is roughly the size of
`TASK-satellite-pipeline`; Part B is roughly the size of `TASK-crop-stress`. Part A's tests
must be green before any component is written. Splitting the *document* would separate each
aggregate from the widget that motivates it, which is the pairing that keeps both honest.

| # | Decision | Taken |
|---|---|---|
| 1 | ~~**The KPI row (architecture §4.4 / design-spec D11, Q3).**~~ — **DECIDED 2026-08-16: take the swap** | Energy Generated → **Fields at Risk** — already documented, the data exists, and `TASK-tasks-board` §2.3 shipped the column for it. Icon `alert-fill`, no unit suffix. **Water Used = trailing 30 days**, in m³ stored, displayed as **kL** (1 m³ = 1 kL exactly, so `units.ts` gains a rename, not a conversion). Deltas **week-over-week**, stated in the info tooltip. Closes Q3 |
| 2 | ~~**Weather: build the Open-Meteo ingest now, or leave the card empty until Phase 5?**~~ — **DECIDED 2026-08-16: build it now** | §2.6 as written. Open-Meteo needs no key and no quota, the table shape is already specified (architecture §5.3), and the alternative is a blank 400×384 quarter of the landing screen. Phase 5 then inherits a populated table — the same split that made `TASK-crop-stress` a screen task instead of a screen-and-pipeline task. Cost: one package, one job, one `[VERIFY]` (architecture §11.3's parameter names) to resolve |
| 3 | ~~**The Regeneration Score formula (Q2)**~~ — **DECIDED 2026-08-16: use published indicators.** §2.4 has the full definition | **AAFC's 0–100 five-class performance index** over three components: **Soil Cover Days** (0.50, from the NDVI time series via the dimidiate pixel model), **normalised Shannon evenness** of crop rotation (0.25), and **stress-free area share** (0.25, Flora's own Phase 2 output). Only the weights are ours, and they are labelled as ours. This replaces architecture §5.4's proposal, whose other two components needed an expected-NDVI curve per crop (nobody has one) and a water-per-tonne baseline (needs a season of history) — both would have been invented baselines wearing a plausible face. **The linear (Gutman & Ignatov) fractional-cover form, not the squared (Carlson & Ripley) one** — the squared form is more accurate against in-situ measurements but drives the component toward 0 on a partly-covered field, which would make a real regenerative farm read "At risk"; the choice is recorded next to the constant |
| 4 | ~~**What does "Crops Stocked" mean — standing or harvested?**~~ — **DECIDED 2026-08-16: harvested** | `SUM(quantity_kg)` over `crop_cycles` with `status = 'harvested'` in the trailing 12 months. "Stocked" reads as inventory, not standing biomass; and it is the only reading that leaves the four growing Corn cycles (which `fields.spec.ts` and `e2e/fields.spec.ts` assert on) untouched while still producing the four-crop mix the donut draws |
| 5 | ~~**What is "Planting Productivity"?**~~ — **DECIDED 2026-08-16** | **Share of the farm's field area under an active crop cycle per month, stacked by crop** (§2.5). Matches all three measured properties (0–100% axis, four segments, varying totals). Alternatives considered and rejected: yield vs. expected (no expected-yield data), mean NDVI (not a percentage of anything), tasks completed (not "planting") |
| 6 | ~~**The Gathering Rate channel rows**~~ (`Online Store $52.12`, `Instagram $37.75`) — **DECIDED 2026-08-16** | Replace with the **top two crops by harvested volume and their period-over-period delta** (§2.7) — identical row geometry, real data, no invented commerce. The card's top half (T/day + range group + two-series area) is built from harvested `crop_cycles`. Logged as gap **D26**. Rejected: disabling two rows of *data* (there is nothing to disable), and inventing an orders domain |
| 7 | ~~**The header's `+ Create Request`**~~ — **DECIDED 2026-08-16** | **Relabel to `+ Create Task`** and open the existing `TaskEditor`. It is the only creatable thing on this screen, the modal already exists, and a disabled primary CTA at the top of the landing screen is the worst of the options. The width delta is a few px, well inside NFR-10. Logged as gap **D27**. Also: ship the card title as "**Pending** Tasks", per D10's existing typo list |
| 8 | ~~**Do any AlignUI components still need vendoring?**~~ — **DECIDED 2026-08-16: no** | §1.1 checked the whole screen against `components/ui/`. If the implementer finds a gap, vendor it byte-identically with an `SOURCES.md` sha256 row (invariant 8) and note it; do not hand-roll a lookalike |
| 9 | ~~**The four Details buttons with no destination**~~ (Regeneration, Productivity, Gathering, Weather) — **DECIDED 2026-08-16** | **Disabled with a tooltip naming why** — the treatment `TASK-crop-stress` §7 and `TASK-tasks-board` §7 both chose, for exactly this situation. Crops Stocked → `/fields`, Pendent Tasks → `/tasks`, both real. Logged as gap **D28** |

**All ten decisions are now taken.** Implementation proceeds per §2, Part A first (§7 decision 0).

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| **Scope.** Seven widgets, three tables, two queues, four charts, a new provider package and a 12-month seed history | §2's Part A / Part B split with Part A's tests green first (§7 decision 0). If it still has to be cut mid-flight, **the weather ingest is the clean cut line** — one card, and no other widget depends on it |
| The score's soil-cover component reads near-zero on the demo farm because the seed has no NDVI history, and gets "fixed" by fudging the formula | §2.12 makes the 12-month synthetic history part of the seed, through the real pipeline. The formula is not the thing to adjust when the data is thin — §2.4's renormalisation path is |
| The rollup silently goes stale (job dies, nobody notices) and Home shows week-old numbers confidently | The rollup's own `day` is in the payload and surfaced in the KPI info tooltips (§2.3). The same reasoning as NFR-8's stale badge — that pattern exists, reuse it rather than inventing a second one |
| Compute-on-miss makes the *first* Home load slow enough to look broken | §6 item 4 measures it. If it exceeds ~1 s on demo data, fall back to a skeleton + a queued build rather than shipping a slow path unmeasured |
| Enriching `db:seed:demo` breaks Fields or Tasks | §2.12 states the constraint (add rows, never repurpose); §6 item 14 is the guard. `TASK-tasks-board` §2.10 hit this exact wall and it held |
| Recharts v3's first real use in this repo surfaces token/API surprises (`hsl()` wrapping renders nothing; v3 renamed several props) | Build **`ArcGauge` first** — it is the fiddliest (180° sweep, rounded cap, centred label) and the one Phase 5 reuses. Check Recharts' own current docs before writing each chart (`CLAUDE.md` §2.0); do not copy v2-era shadcn examples |
| The score becomes a number nobody can explain three months from now | `formula_version` on every row, a pure tested function, published sources cited in §2.4 and in architecture §5.4, and an on-card class name from a real framework instead of a bare number |
| Home's `1:12913` KPI tile shows `Energy Generated` and a reviewer reads the swap as scope creep toward the Energy screen | §5 item 2 says it explicitly; architecture §4.4 already argued it |

---

## 9. Follow-on tasks

| Task | Picks up |
|---|---|
| `TASK-weather` (Phase 5) | `3:5274` — a screen over §2.6's already-populated `weather_snapshots`, plus the three hand-rolled SVG charts (design-spec §7.2) |
| `TASK-stress-to-task` | Unchanged — the Crop Stress popover's create button |
| `TASK-task-detail` | Comments, subtasks, assignees |
| `TASK-management-zones` (Phase 6) | `15:8608` |
| Design follow-ups | D24–D28, plus D11 and D3 |

---

## 10. Decisions and `[VERIFY]`s resolved

*(To be filled in as the task lands — every §7 decision as taken, every `[VERIFY]` this
document introduces either resolved or restated as still open, per §6 item 19.)*
