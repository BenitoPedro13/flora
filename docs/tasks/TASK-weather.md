# TASK-weather — the Weather screen (`3:5274`)

> **Phase 5** (architecture §16). The fifth and last screen of the v1 scope
> (Energy `3:5920` and Carbon Offset `3:6566` stay deferred — architecture §4.3).
>
> **Status:** planned, 2026-08-16 — **ready to build**. Written against commit `cf2c0fd`
> (`TASK-home-dashboard` complete, phases 0–4 done). All ten §7 decisions are **taken**, every
> `[VERIFY]` is **closed against a live Open-Meteo response and published sources**, and §10
> records what changed as a result. Nothing here is waiting on an answer.
>
> **Shape of this task:** a screen over a write path that already exists — the same shape
> `TASK-crop-stress` had, and for the same reason. `TASK-home-dashboard` §2.6 deliberately
> pulled the Open-Meteo ingest forward a phase and stored the full daily payload while
> building only the two-day Home card. That decision pays off here: `weather_snapshots` is
> already populated hourly for every farm, `packages/weather` already exists, and the
> scheduler already runs.
>
> **But it does not pay off completely.** §1.2 is the honest part of this document: three of
> the six instrument cards on `3:5274` read values the current ingest never requests. This
> task extends the *request*, not the architecture — one more query-string block on the same
> call, into the same table, behind the same provider interface.

---

## 0. Prerequisites and reading order

1. `docs/architecture.md` §11.3 (Open-Meteo — parameter names, licence, the polling design),
   §5.3 (`weather_snapshots`), §8 (`GET /api/v1/farms/:id/weather?days=7`, already declared,
   not built), §9.1 (`weather/page.tsx` in the route tree), §9.2 (server vs client).
2. `docs/design-spec.md` §5.6 (the screen), §7.2 (per-chart assignment — **one row of it is
   wrong, see §1.3 note 4**), §7.3 (`components/charts/config.ts`), §9 gap **D5**.
3. `docs/tasks/TASK-home-dashboard.md` §2.6 (what the write path was scoped to) and §10 (what
   was found live — read this before writing any chart).
4. `CLAUDE.md` invariants 1, 4, 5, 6, 7, 8 — invariant 7 is under real pressure on this
   screen and §2.5 explains why it nonetheless does not need a new exception.

---

## 1. Current scenario

### 1.1 What exists

| Piece | State |
|---|---|
| `packages/weather/` | `WeatherProvider` interface · `OpenMeteoProvider` · `FixtureWeatherProvider` · `open-meteo/client.ts` (`fetchOpenMeteoDaily` + `parseDailyResponse`). **Daily block only**, `forecast_days=8` |
| `packages/weather/test/fixtures/open-meteo-daily-forecast-2026-08-16.json` | A real captured response — the fixture `client.spec.ts` replays (`CLAUDE.md` §Tests: recorded HTTP, never hand-built mocks) |
| `weather_snapshots` | Created by migration `0009_rollups.sql` + RLS in `0010_rollups_rls.sql`. PK `(farm_id, observed_at, horizon)`, `horizon` a `weather_horizon` enum `'0'`–`'7'`, JSONB `payload` typed `WeatherSnapshotPayload` |
| `packages/db/src/queries/weather.ts` | **Write only** — `upsertWeatherSnapshots`. The only read of this table lives in `rollups.ts` (`DISTINCT ON (horizon) … WHERE horizon IN ('0','1')`, Home's two days) |
| `apps/worker/src/weather/` | `WeatherSchedulerService` (one BullMQ Job Scheduler per farm, `0 * * * *`, gated on `WEATHER_SCHEDULE_ENABLED`) + `WeatherIngestProcessor` (one call per farm, 8 rows written per run) |
| `packages/db/src/seed-weather.ts` | `db:seed:weather` — a real keyless Open-Meteo call per farm, once, for a demo environment that doesn't want to wait on the scheduler |
| `apps/web/components/flora/weather-day-card.tsx` | The rebuilt `Schedule Cards [Schedule] [1.0]` block — 368 wide × 143 tall, 64 px WMO-code glyph, right-aligned day name, `+29 ºC`, short date |
| `apps/web/components/charts/arc-gauge.tsx` | A **180°** `RadialBarChart` gauge, kept generic specifically so "Weather's Rain Chance (Phase 5) can reuse it" |
| `apps/web/components/flora/app-sidebar.tsx` | Already links `{ href: "/weather", label: "Weather", icon: RiSunCloudyLine }` — **the nav entry points at a 404 today** |
| `apps/web/components/flora/page-container.tsx` | `max-w-[1168px] px-8` → 1104 px of content, corrected once already (`TASK-tasks-board` §7 decision 5). Its own doc comment already names Weather as an adopter |

`apps/web/app/(app)/weather/` does not exist. `apps/api/src/weather/` does not exist.
`packages/contracts/src/weather.ts` does not exist — the weather schemas live inside
`dashboard.ts` today, because Home was their only consumer.

### 1.2 What does not exist — the honest gap

The daily block currently requested is:

```
daily = temperature_2m_max, temperature_2m_min, weather_code,
        precipitation_sum, wind_speed_10m_max, uv_index_max, sunrise, sunset
```

Against the six instrument cards on `3:5274`:

| Card | Needs | Stored today? |
|---|---|---|
| **This Week** (7 stacked day cards) | date · weather code · temperature | ✅ all 8 horizons |
| **Sunrise & Sunset** | sunrise, sunset | ✅ |
| **UV Index** | a UV value + a band label | ⚠️ `uv_index_max` is the day's max, the design shows an instantaneous reading at `10:23` |
| **Wind Status** (19 bars, `56 Km/h`, `10pm23`) | an **hourly** wind-speed series | ❌ only the daily max |
| **Rain Chanse** (`Low`, `24%`) | a precipitation **probability** | ❌ only `precipitation_sum` (mm) |
| **Pressure** (`720 hpa`) | pressure (**mean-sea-level**, §2.1) | ❌ not requested at all |
| **Wind Status** (compass, `8 km/h`) | a wind **direction** | ❌ not requested at all |

So the write path needs one more query-string block (`hourly=`) and two more daily
parameters. That is the entire delta — no new table, no new provider, no new job, no change
to the schedule. §2.1 and §3 argue for that shape over the alternative.

### 1.3 Measured geometry — `3:5274`

Read off the Figma (`hY3Nd3BBbJsjpihPnfZgpd`, node `3:5274`) with `get_metadata`, not off the
render. Artboard 1440×900, sidebar 272, `Page Header [1.0]` 1168×88 at x=272.

**The content column is a 3-column grid**, x=305 → 1415, **width 1110**: three 352-wide
columns with **27 px** gaps (352×3 + 27×2 = 1110). Column 1 is one tall card; columns 2–3 are
a 2×3 grid of instrument cards.

| Card | Node | Position | Size |
|---|---|---|---|
| **This Week** | `24:12443` | (305, 92) | 352 × **767** |
| **Wind Status** (bars) | `102:6173` | (684, 92) | 352 × 254 |
| **UV Index** | `2224:5002` | (1063, **94**) | 352 × 250 |
| **Rain Chanse** | `2029:27112` | (684, 369) | 352 × 262 |
| **Sunrise & Sunset** | `2029:27139` | (1063, 369) | 352 × 259 |
| **Pressure** | `2031:27343` | (684, 655) | 352 × 278 |
| **Wind Status** (compass) | `2224:4975` | (**1067**, 655) | **345** × 278 |

**Every instrument card is the same three-part skeleton**, which is the single biggest reuse
opportunity on this screen (§2.6):

- `Header` 320×32 at (16, 16): a 24 px icon at y+4, the title at x=32 (`Label/Large`), and a
  `Buttons [1.0]` instance **66×32 at x=254** — labelled **See All**, not Home's "Details".
- A body frame 320 wide at y=64, height 130–198 depending on the instrument.
- A second `Header` 320×24–28 near the bottom: a **left value** (`56 Km/h`, `24%`, `720 hpa`,
  `5:50AM`, `2`) and a **right timestamp** (`10pm23`, `10:23`, `6:30PM`) right-aligned at
  x=258–278. The Sunrise card puts `6:30PM` there instead of a timestamp.

**The instruments themselves:**

| Instrument | Measurement |
|---|---|
| **Wind bars** `102:6216` | 320×130 plot at (16, 64). **19 bars**, each **3.9024 wide**, **17.5610 px pitch**, rounded caps, baseline-aligned at y=130. Heights 21–130; bar 10 (index 9) is the full-height **highlighted** one and is rendered in a darker green than its neighbours |
| **UV track** `2224:5030` | 320×130 at (16, 64). Value block 32×60 at (0, 22.5): `2` 25×28 over `Low` 32×24 at y+36. Track 320×**9** at y=98.5, a green→yellow→red gradient, with an **18×18** white thumb ellipse at x=69 (centre ≈ 21.9% along) |
| **Rain gauge** `2029:27267` | 132×138 at (110, 64) — **a full 132 px circle** (`Ellipse 21`) with a 66×66 arc vector over it, `Low` centred 72×28 at (30, 52) |
| **Sun arc** `2029:27198` | 236×139 at (58, 64). The arc frame is 210×116 at x+13; `Sunrise` 40×28 and `Sunset` 37×28 sit at y=111 at the two ends. Dotted stroke, amber gradient fill under the arc, a sun glyph near the apex |
| **Pressure dial** `2031:27342` | 144×136 at (104, 74.87). A fine radial tick fan (~60 ticks) with a needle and a hub circle |
| **Compass** `2224:4975` | `Group 2` 198.5×198 at (73.25, 64). Ring ellipse 197.94 across; N/E/S/W glyphs; 8 px tick marks at W/S/E; an 11 px `Polygon 1` at due N; a green `Arrow 1` vector with a 20 px dot at its head; centre frame 82×82 holding `8` 17×38 over `km/h` 39×24 |

**The This Week card** `24:12443` is a `Widgets [HR Management] [1.0]` instance — the third
one in this codebase after `TaskCard` and `RegenerationCard`:

- `Top` 352×136: header (`sun-cloudy-line` + "This Week" + `See All` 66×32), then a
  **`Day Selection [Schedule] [1.0]`** instance **320×56 at (16, 64)** — the ‹ › pager, five
  day columns (`Fri 31 · Sat 01 · Sun 02 · Mon 03 · Tue 04`), the selected one a **green
  pill**.
- `Schedule Detail Tabs [Schedule - Menu] [1.0]` at y=136, whose `Menu Tab Bar` is
  **`hidden="true"`** — do not build the tabs; the same "hidden layers in a PRO instance"
  situation `TASK-tasks-board` and `TASK-home-dashboard` §6.2 both hit.
- `Content`: five `Schedule Cards [Schedule] [1.0]`, **320 wide**, at y = 16, 167, 311, 462,
  613 — heights **143, 136, 143, 143, 119**.

**Five things the metadata reveals that the render does not:**

1. **The screen scrolls.** 655 + 278 = **933 > 900**. Third screen in a row where this is
   true, and the third chance to get it wrong — `TASK-tasks-board` §10 recorded "the page not
   scrolling" as a live-found bug and `TASK-home-dashboard` §1.3 note 1 recorded it again.
2. **The card sizes are inconsistent by 1–12 px** in ways nothing explains: 254/250 in row 1,
   262/259 in row 2, and a compass card that is 345 wide at x=1067 instead of 352 at x=1063.
   These are drawing slips, not design. §7 decision 8 normalizes them.
3. **The content column starts at x=305**, not Home's x=298 — same 1110 width, shifted 7 px.
   `PageContainer` (`max-w-[1168px] px-8` inside a 272 px sidebar) lands at **x=304**, which
   is *closer* to this artboard than to Home's. Do not touch `PageContainer`; note the
   inconsistency and move on. 1 px is 0.07% of the frame.
4. **Rain Chance is not a 180° arc.** design-spec §7.2 assigns it to the same `ArcGauge` Home
   built, and `arc-gauge.tsx`'s own doc comment says it was kept generic for exactly this.
   The metadata says otherwise: a **full 132 px circle** with a partial sweep, i.e. a
   circular-progress ring, not a half-gauge. §2.5 handles it; §2.10 corrects design-spec §7.2.
5. **The palette is not green.** This is the first screen whose data marks are mostly *not*
   the brand green: the rain ring and the pressure dial are light blue, the sun arc is amber,
   the compass ring is grey with a single green vector, and the UV track is an explicit
   green→yellow→red gradient. §2.5 covers what that means for invariant 7 (short version: the
   AlignUI CLI already generated full `blue`/`orange`/`yellow`/`red` primitive ramps in
   `globals.css`, so this needs **no new raw hex and no new exception**).

### 1.4 What the design asks for that has no source

| # | The design shows | The reality | This task |
|---|---|---|---|
| 1 | A **See All** button on all six instrument cards **and** on This Week | There is no weather detail screen anywhere in the file — this is gap **D5**, open since the spec was written | §7 decision 9: **disabled with a tooltip naming why**, the treatment `TASK-crop-stress` §7, `TASK-tasks-board` §7 decision 1 and `TASK-home-dashboard` §7 decision 9 have each already chosen |
| 2 | Header **`+ Create Request`** and a **`Schedule`** date-range button | No request domain (gap **D27**, resolved on Home by relabelling to `+ Create Task`); `Schedule` has no destination | §7 decision 10 — reuse Home's `CreateTaskButton`, disable `Schedule` |
| 3 | Footer timestamps **`10pm23`** and **`10:23`** on the same screen | `10pm23` is not a time format in any locale. Almost certainly `10pm` + a stray `23` | §7 decision 6 — render the hour the value belongs to, in the farm's timezone. New gap **D29** |
| 4 | **`720 hpa`** on the Pressure dial | The dial has no printed scale, and 720 hPa is ~2,800 m of altitude. **Resolved by measurement (§2.1):** at this farm's real 1,132 m, `surface_pressure` is 889–898 hPa and `pressure_msl` is 1016–1018 — the mock's number is neither, just a number picked without a farm | §7 decision 5 — **`pressure_msl`** on a standard 950–1050 hPa band, real value, needle clamped. Gap **D30** narrows to "print the scale" |
| 5 | **`Rain Chanse`** `Low` / `24%` | Typo (**D10**), and "Low" is a band with no thresholds defined anywhere | Ship as "Rain Chance" (D10 precedent). Bands are invented → §7 decision 4, new gap **D31** |
| 6 | **UV Index `2` / `Low`** | The band names here are *not* invented — WHO/WMO publishes them | §7 decision 3: use the published bands and cite them, exactly the `TASK-home-dashboard` §2.4 precedent (a sourced scale beats a plausible one) |
| 7 | **Two cards both titled "Wind Status"** | One is an hourly bar chart, the other a direction compass | §7 decision 7 — the second ships as **"Wind Direction"**, logged as a design defect fix like "Pendent Tasks" → "Pending Tasks" |
| 8 | The **day strip** selects `Sun 02` while the cards below read `Monday … Thursday` | The strip's selection and the day list disagree in the mock itself | §7 decision 1 — the strip drives the **instrument cards**; the list stays the week. New gap **D32** |
| 9 | The **5th day card** is a different variant (119 tall, 52 px glyph, temperature on the right, day name below) | Nothing distinguishes that day from the other four | §7 decision 8 — one variant for all seven days |

---

## 2. Planned changes

### 2.1 `packages/weather` — extend the request, not the architecture

**`packages/weather/src/open-meteo/client.ts`:**

**All parameter names and units below are RESOLVED — verified 2026-08-16 against a live
Open-Meteo response at this project's own farm coordinates** (the capture is §2.1's new
fixture). No `[VERIFY]` remains on this path.

- Two more daily parameters, confirmed accepted and echoed back in `daily_units`:
  `precipitation_probability_max` (**%**) and `wind_direction_10m_dominant` (**°**).
- An `hourly=` block: `temperature_2m` (**°C**), `wind_speed_10m` (**km/h**),
  `wind_direction_10m` (**°**), `pressure_msl` (**hPa**), `uv_index` (dimensionless),
  `precipitation_probability` (**%**).
- **Wind is km/h by default** — the 3.6× risk §8 flagged does not exist; Open-Meteo returns
  `"wind_speed_10m": "km/h"` in `hourly_units` without asking.
- **`pressure_msl`, not `surface_pressure`** — see the box below. This is a change from the
  parameter this document originally proposed.
- The response returns **`forecast_days × 24` flat hourly entries** (192 confirmed) as local
  ISO strings with no zone suffix (`"2026-08-16T00:00"`), which is what makes the per-day
  grouping in the next bullet necessary rather than an index calculation.

> **Why `pressure_msl` and not `surface_pressure` — found by running the real request.**
> This farm sits at **1,132 m** (Open-Meteo returns `elevation` on every response). Its
> `surface_pressure` reads **889–898 hPa**; its `pressure_msl` reads **1016–1018 hPa** for the
> same hours. A fixed 950–1050 hPa dial — which is what §7 decision 5 originally recommended —
> would have pinned the needle at the floor permanently and looked broken, and *no* fixed band
> can serve both a sea-level farm and a plateau farm on `surface_pressure`. Mean-sea-level
> pressure is also what a barometer, a weather report and a synoptic chart all mean by
> "pressure": it is the quantity that actually moves with highs, lows and fronts, whereas
> surface pressure at a fixed site is that signal plus a large constant altitude offset. MSL
> makes the standard band correct everywhere. **This is also the explanation for the mock's
> `720 hpa`** — not a typo, just a number picked without a farm.
- `parseDailyResponse` gains a sibling that **splits the flat hourly arrays per day**.
  Open-Meteo returns `hourly.time` as one flat array of `forecast_days × 24` ISO local
  timestamps; group by the `YYYY-MM-DD` prefix and attach each group to the day whose `date`
  matches. Do not assume 24 entries per group and do not assume the first group is index 0 —
  derive it from the timestamps. DST days have 23 or 25 hours and the farm timezone is the
  farm's own, not the server's.
- Bump the committed fixture: a **new real capture** at the new parameter set, committed as
  `packages/weather/test/fixtures/open-meteo-hourly-forecast-2026-08-16.json`. One is already
  taken — it is in this session's scratchpad and is the response every unit above was read
  from; re-take it at commit time if it has gone stale. Keep the existing daily fixture:
  `client.spec.ts` must prove the parser still handles a response with **no `hourly` block**,
  because that is exactly what every row already in the table came from.

**`FixtureWeatherProvider`** needs no interface change: `FetchDailyForecastResult` is already
`WeatherSnapshotPayload[]`, and the payload is what grows.

**Rejected alternative — a `weather_hourly` table.** One row per farm per hour per horizon is
8 × 24 = 192 rows per farm per ingestion run, 4,608 per farm per day, against 8 today. It buys
nothing: nothing queries an hour across days, the screen reads exactly one day at a time, and
the hours are only ever read as a whole series. A JSONB array on the row that already exists
is the same data, one insert, no new PK, no new RLS policy, no new entry in
`tenancy.spec.ts`'s catalog. The payload grows to roughly 2–4 KB per row — the observation
`stats` blob set that precedent already (architecture §5.3).

### 2.2 `packages/contracts/src/weather.ts` — a new module, and a move

Weather schemas live in `dashboard.ts` today only because Home was the first consumer. Move
them to their own module now that a weather domain exists, and **re-export from
`dashboard.ts`** so no import in `apps/api`, `apps/worker` or `packages/db` breaks:

- Moved: `weatherHorizonValues` / `weatherHorizonSchema` / `WeatherHorizon`,
  `weatherSnapshotPayloadSchema` / `WeatherSnapshotPayload`.
- Kept in `dashboard.ts`: `weatherDaySchema` (the reduced `{ date, tempC, weatherCode }` Home
  reads) and `dashboardWeatherSchema`. **Do not rename these** — the new full-fidelity day is
  a *different* schema and must not shadow them.

**Extended — `weatherSnapshotPayloadSchema`.** Every new field is `.optional()`:

```
precipProbabilityMaxPct?: number   // 0–100
windDirectionDominantDeg?: number  // 0–360
hours?: weatherHourSchema[]
```

and `weatherHourSchema` = `{ time: string (ISO local), temperatureC?, windSpeedKmh?,
windDirectionDeg?, surfacePressureHpa?, uvIndex?, precipProbabilityPct? }`.

**Optionality is load-bearing, not laziness.** `upsertWeatherSnapshots` runs
`weatherSnapshotPayloadSchema.parse` on write (a deliberate choice — `TASK-home-dashboard`
§10 records the rollup payload's write-time validation catching a real defect). Every row
already in the table was written without these fields. Making them required turns the *read*
path into a runtime error for every pre-existing row, and the screen has to render against
those rows until the next hourly run.

**New — the API's own shape:**

```
farmWeatherDaySchema  = { date, horizon, tempMaxC, tempMinC, weatherCode,
                          precipitationMm, precipProbabilityPct?, windSpeedMaxKmh,
                          windDirectionDeg?, uvIndexMax?, sunrise?, sunset?, hours[] }
farmWeatherSchema     = { farmId, timezone, observedAt, isStale, days: farmWeatherDaySchema[] }
```

`isStale` is computed server-side (§2.4), not by the client — the same reason NFR-8's stale
badge is a server fact on Crop Stress.

### 2.3 `packages/db/src/queries/weather.ts` — the read (invariant 5)

Add `getFarmWeek(tx, organizationId, farmId, days)`:

```sql
SELECT DISTINCT ON (horizon) horizon, observed_at, payload
FROM weather_snapshots
WHERE organization_id = $1 AND farm_id = $2 AND horizon::text::int < $3::int
ORDER BY horizon, observed_at DESC
```

Three things to get right, each of which this project has already been bitten by:

1. **`::int` on the bound parameter.** `TASK-home-dashboard` §10 defect 2: an uncast bound
   parameter next to a typed column gets inferred to that column's type and silently changes
   the operator. Here the column is an *enum*, which makes the trap worse, not better — cast
   both sides explicitly.
2. **`DISTINCT ON (horizon) … ORDER BY horizon, observed_at DESC`** is the "latest ingestion
   run per horizon" idiom `rollups.ts` already uses. Reuse it verbatim; do not invent a
   `MAX(observed_at)` subquery.
3. **Parse the payload on read** with `weatherSnapshotPayloadSchema`, and let a row that
   fails parse be *dropped with a log*, not throw the request. A partially-written or
   pre-extension row must degrade one card, not the screen.

Return `{ observedAt, days }` where `observedAt` is the newest across the rows.

**Extend `packages/db/src/queries/weather.spec.ts`** (integration, real PostGIS via
testcontainers — never a mocked db, `CLAUDE.md` §Tests): write two ingestion runs an hour
apart, assert `getFarmWeek` returns the newer payload for every horizon, assert `days=3`
returns exactly horizons 0–2 in order, and assert a row written **without** the new optional
fields still round-trips.

### 2.4 `apps/api/src/weather/` — `GET /api/v1/farms/:id/weather?days=7`

The route is already declared in architecture §8; build it exactly as declared. Mirror
`apps/api/src/dashboard/` — `weather.controller.ts` / `weather.service.ts` /
`weather.module.ts`, `@TenantTx()` + `@CurrentUser()`, `ParseUUIDPipe` on `:id`.

- `days` validated 1–8, default **7**. (The store holds 8 horizons; the screen shows 7.)
- The service reads `getFarmWeek` plus `getFarm` (for `timezone`), and computes
  `isStale = now - observedAt > 2h` — the schedule is hourly, so two missed runs is the
  signal. Render, never hide: NFR-8's rule is "a stale badge with the last-success date,
  never a zero or a blank."
- **Invariant 1 / NFR-4 by construction:** this service imports `@flora/db` and nothing else.
  `@flora/weather` must not appear in `apps/api/package.json` — extend the existing NFR-4-style
  test to assert that for `@flora/weather` as it already does for `@flora/satellite`.
- **NFR-7:** add the route to the cross-tenant suite — org A authenticated, org B's farm id,
  **404 not 403**.

### 2.5 `apps/web/components/charts/` — five new charts

design-spec §7.2 promises "three hand-rolled SVG" on this screen. It is really **five new
components**, three of them SVG:

| File | Build with | Notes |
|---|---|---|
| `wind-bars.tsx` | shadcn/Recharts `BarChart` | The selected day's hourly `windSpeedKmh`. **24 bars, not the mock's 19** (§7 decision 2) — re-pitch to the same 320×130 box. The bar for the current hour gets `--chart-1`; the rest `--color-green-300`. `radius` on the bar for the rounded caps, no axes, no grid |
| `radial-gauge.tsx` | shadcn/Recharts `RadialBarChart` | **New, not `ArcGauge`** — a full-circle ring (§1.3 note 4). Either add `startAngle`/`endAngle`/`trackColor` props to `arc-gauge.tsx` and export a second preset, or write a sibling. Prefer extending: one gauge component, two presets, is less surface than two components |
| `uv-track.tsx` | plain SVG/CSS | A 320×9 rounded track with an SVG `linearGradient` (green → yellow → red) and an 18 px thumb positioned by `uvIndex / 12` |
| `sun-arc.tsx` | **custom SVG** | 210×116. A dotted semicircular `path` (`stroke-dasharray`), an amber gradient `fill` under it, and a sun marker at `t = (now − sunrise) / (sunset − sunrise)` clamped to `[0,1]`. For a non-today day, park the marker at the apex and drop the fill |
| `pressure-dial.tsx` | **custom SVG** | 144×136. ~60 ticks around a ~270° sweep, a needle at `(hPa − 950) / 100`, clamped, plus the hub circle |
| `wind-compass.tsx` | **custom SVG** | 198×198. Dotted ring, N/E/S/W labels, three 8 px ticks, the 11 px north polygon, and a green vector rotated to `windDirectionDeg` with a 20 px head dot. Centre value + `km/h` |

**Invariant 7 — why this screen does not need a new exception.** Mapbox needed one
(`components/map/config.ts`) because its style parser is JSON and cannot resolve
`var(--color-*)`. **Inline SVG is DOM**, and SVG presentation attributes accept CSS custom
properties: `fill="var(--color-orange-400)"` and `stroke="var(--color-blue-300)"` resolve
normally, as do Tailwind token classes on the SVG elements. The AlignUI CLI already generated
the full `blue` / `orange` / `yellow` / `red` primitive ramps in `app/globals.css`
(`--color-blue-300` … `--color-orange-400` …). **A grep for raw hex under `apps/web` must
still come back clean** — that is criterion 2 of design-spec §10 and this task must not be the
one that breaks it. Any non-green value used by more than one chart goes in
`components/charts/config.ts`, which is already the sanctioned second home.

**Read `TASK-home-dashboard` §10 before the first `ChartTooltipContent`.** The vendored
`components/ui/chart.tsx` defaults to shadcn's `bg-background`/`text-muted-foreground`, which
AlignUI never defines — the tooltip renders fully transparent. Override per call site with the
theme-invariant `--color-static-*` pair; do **not** reach for the semantic
`--color-bg-strong-950` (it inverts under dark mode), and do not edit the vendored file
(invariant 8). Note that `components/charts/config.ts`'s `chartTooltipStyle` still holds the
`--color-bg-strong-950` form that §10 identified as wrong — fixing that one constant is a
legitimate ride-along (it has exactly the call sites Home created), the vendored-file fix is
not.

### 2.6 `apps/web/components/flora/` — the composites

| File | What |
|---|---|
| `instrument-card.tsx` | **The reuse win.** All six instrument cards are one skeleton (§1.3): `{ icon, title, children, footerValue, footerMeta }` inside a 352-wide bordered card, with the disabled `See All` button and its tooltip built in once. Six cards, one chrome, one tooltip string |
| `day-selection-strip.tsx` | The `Day Selection [Schedule] [1.0]` rebuild — 320×56, five visible days, ‹ › paging over the available horizons, the selected day a green pill. Keyboard: ← / → move selection; the pager buttons are real `<button>`s. Disable ‹ at horizon 0 and › at the last page — there is no stored past (§7 decision 1) |
| `weather-week-card.tsx` | The 352×767 `Widgets [HR Management]` instance: header + strip + the seven day cards |
| `weather-day-card.tsx` | **Edit, don't fork.** It already renders 143 tall at whatever width the parent gives; here that is 320, not Home's 368. Verify the internal offsets against §1.3's measurement and add a prop only if one is genuinely needed. Do **not** reproduce the mock's odd 5th variant (§7 decision 8) |
| `weather-board.tsx` | `"use client"` — owns `selectedHorizon` and renders the strip + the six instrument bodies. **All 8 days arrive as props**; selecting a day is local state, never a refetch (architecture §9.2) |
| `stale-badge.tsx` *(check first)* | Crop Stress already ships a stale indicator (NFR-8). If it is a reusable component, reuse it; if it is inline in the stress header, extract it rather than writing a second one |

### 2.7 `apps/web/app/(app)/weather/page.tsx`

A Server Component, following Home's shape exactly:

1. `getSession()` → `redirect("/login")` if absent.
2. `apiFetchServer("/api/v1/farms", z.array(farmSchema))`; empty → the same "Add a farm" empty
   state Home renders.
3. `apiFetchServer(`/api/v1/farms/${farm.id}/weather?days=8`, farmWeatherSchema)`.
4. `PageHeader` with `+ Create Task` (`CreateTaskButton`, reused) and a disabled `Schedule`,
   search and bell — identical treatment to Home's.
5. `PageContainer` → a grid: `grid-cols-[352px_352px_352px] gap-x-[27px]` with the week card
   spanning all three rows of column 1, **`items-start`** on the instrument cells.
6. **The page must scroll** (933 > 900). `PageContainer`'s own doc comment explains the
   `min-h-0` flex chain that makes that work — read it before fighting the layout.

Empty state: a farm whose ingest has never run has zero rows. Render the card chrome with an
em-dash body and the "no forecast yet" line `WeatherCard` already uses on Home — do not render
a blank screen and do not fabricate a forecast.

### 2.8 Worker and seeds

No new job, no new schedule, no new env var. Two small things:

- `WeatherIngestProcessor` needs no change if `fetchDailyForecast` returns the richer payload
  — verify that is true rather than assuming it, and extend its test to assert an ingested row
  now carries `hours`.
- `db:seed:weather` inherits the new parameters for free. **Re-run it after migrating** so the
  demo environment has hourly data; say so in the README quickstart. Rows written before this
  task keep parsing (§2.2) but will render em-dashes on three cards until a run replaces them.

### 2.9 Tests

| Test | Where | Asserts |
|---|---|---|
| Hourly parse | `packages/weather/src/open-meteo/client.spec.ts` | Against the **new real capture**: hours group to the right days, count per day is derived not assumed, and the **old daily-only fixture still parses** with `hours` absent |
| `getFarmWeek` | `packages/db/src/queries/weather.spec.ts` | Integration, real PostGIS. Latest run wins per horizon; `days` clamps; a pre-extension row round-trips |
| NFR-4 | `apps/api` | `@flora/weather` is not a dependency of `apps/api` and is not imported under `apps/api/src` — extend the existing `@flora/satellite` assertion |
| NFR-7 | cross-tenant suite | `GET /farms/:foreignId/weather` → **404** |
| Screen | `apps/web/e2e/weather.spec.ts` | The week card renders 7 days; selecting a day in the strip changes the instrument values; ‹ is disabled at the first day; the six `See All` buttons are disabled; the stale badge appears when `observedAt` is old; the page scrolls |
| NFR-10 | `apps/web/e2e/weather.spec.ts` | Screenshot vs `apps/web/e2e/baselines/weather.png` at 1440×900 |

**`playwright.config.ts`'s `testMatch` regex must gain `weather\.spec\.ts`.** This is called
out as its own line because `tasks.spec.ts` was written, documented *in that file's own
comment*, and never actually added — it was undiscoverable for a whole task until
`TASK-home-dashboard` found it live. Adding the file is not the same as wiring it.

**The NFR-10 baseline** is a real Figma export, not a hand-made crop: `get_screenshot` on
`hY3Nd3BBbJsjpihPnfZgpd` node `3:5274` renders **natively at 1440×900** (`original_width`
1440, `original_height` 900 — no scaling artefacts), committed to
`apps/web/e2e/baselines/weather.png`. Figma is reachable from this environment
(`TASK-tasks-board` established that).

**Set the threshold to the measured floor, and record the measurement.** Do not start at 2%
and loosen until it passes. Home measured 9% and shipped at 12%; the sidebar shipped at 5%/3%.
This screen's floor will be dominated by real forecast values against the mock's illustrative
ones (`+29 ºC` on four cards, `56 Km/h`, `720 hpa`, `8 km/h`, `24%`) — expect it to be closer
to Home's than to Fields'. **Do not try `mask`** — `TASK-home-dashboard` §10 already measured
that it makes an external-baseline diff *worse* (62%), because Playwright paints the live page
only and never the stored baseline.

### 2.10 Documentation (`CLAUDE.md` §3)

| Doc | Change |
|---|---|
| `docs/architecture.md` §11.3 | Record the hourly block and the two new daily parameters, with their `[VERIFY]`s resolved against Open-Meteo's docs and the new capture — and correct the line that says the full payload is "ingested and stored but unread until the Phase 5 Weather screen" |
| `docs/architecture.md` §5.3 | `weather_snapshots.payload` now carries `hours[]` — say why it is a JSONB array and not a table (§3) |
| `docs/architecture.md` §8 | Mark `GET /api/v1/farms/:id/weather` **built** |
| `docs/architecture.md` §16 | Phase 5 → complete; the phase table's Weather row gets its measured NFR-10 number, like Phase 4's |
| `docs/design-spec.md` §5.6 | Rewrite with §1.3's measured geometry — it is currently prose read off a render |
| `docs/design-spec.md` §7.2 | **Correct the Rain Chance row**: a full-circle ring, not the 180° `ArcGauge`. Add the UV gradient track, which the table omits entirely |
| `docs/design-spec.md` §9 | **D5 resolved** (See All → disabled + tooltip). **D10** — "Rain Chanse" shipped fixed. New **D29** (footer timestamps), **D30** (pressure scale), **D31** (rain-chance bands), **D32** (what the day strip selects) |
| `CLAUDE.md` | Status paragraph: Phase 5 complete, what was found live, what stays open |
| `README.md` | Status line; add `db:seed:weather` re-run to the quickstart |
| `.env.example` | Only if a variable is added — `OPEN_METEO_BASE_URL` and `WEATHER_SCHEDULE_ENABLED` already exist. Verify, don't assume |

Then grep `docs/*.md` for `weather_snapshots`, `3:5274`, `D5`, `ArcGauge` and `Phase 5` to
catch stale references.

---

## 3. Why

**Why extend the payload rather than add a table.** The hourly series is only ever read as a
whole, for one day, alongside that day's daily values. Nothing joins across hours, nothing
aggregates them server-side, nothing indexes them. A `weather_hourly` table would be 4,608
rows per farm per day to serve a query that is always "give me this one day" — plus a
migration, an RLS policy, a `tenancy.spec.ts` catalog entry, and a join on every read. The
payload grows to a few KB on a row that already exists. `observations.stats` set this
precedent (architecture §5.3) and it has held.

**Why every new field is optional.** The table is already populated. A required field turns
every existing row into a parse error on read, and the screen must render against those rows
until the hourly job replaces them. This is the difference between a migration and an outage.

**Why the strip's selection is client state.** All eight days are ~30 KB of JSON. Refetching
per selection would be a network round trip to change a number the browser already has, and
would make the screen's snappiness depend on the API. Architecture §9.2's rule — server
components fetch, client islands hold interaction state — gives the right answer directly.

**Why the UV bands are sourced and the rain bands are not.** WHO/WMO publishes the UV index
categories; using them is free correctness. Nobody publishes "Low/Moderate/High" for
precipitation probability, so any threshold is an invention — and `TASK-home-dashboard` §2.4
established what to do with an invented scale: pick a defensible one, put it in one named
constant, and **log it as a design gap** rather than letting it look authoritative. The
Regeneration Score is the standing example of the alternative (invent a composite, then have
to replace it).

**Why the second Wind Status becomes Wind Direction.** Two identical titles on one screen is a
usability defect, not a style. This project has fixed exactly this class of thing before
("Pendent Tasks" → "Pending Tasks", "Data:" → "Date:", "Rain Chanse" → "Rain Chance") and
logged each one under D10 rather than silently shipping it.

**Why this closes the phase honestly.** Everything on `3:5274` will read a real Open-Meteo
value or an em-dash. No card invents a number, and the four undefined ones (rain bands,
pressure scale, timestamps, strip semantics) are shipped with a decision and a numbered gap,
not with a shrug.

---

## 4. Affected files

| Path | Change | Notes |
|---|---|---|
| `packages/weather/src/open-meteo/client.ts` | edit | Hourly block, two daily params, per-day hour grouping |
| `packages/weather/src/open-meteo/client.spec.ts` | edit | New capture + the old daily-only fixture still passing |
| `packages/weather/test/fixtures/open-meteo-hourly-forecast-<date>.json` | **new** | A real capture, not hand-built |
| `packages/contracts/src/weather.ts` | **new** | Horizon + snapshot payload (moved) + `farmWeatherSchema` |
| `packages/contracts/src/dashboard.ts` | edit | Re-export the moved schemas; `weatherDaySchema` stays |
| `packages/contracts/src/index.ts` | edit | Export the new module |
| `packages/db/src/queries/weather.ts` | edit | `getFarmWeek` |
| `packages/db/src/queries/weather.spec.ts` | edit | Integration cases |
| `apps/api/src/weather/weather.{controller,service,module}.ts` | **new** | Mirrors `dashboard/` |
| `apps/api/src/app.module.ts` | edit | Register `WeatherModule` |
| `apps/api/test/*` | edit | NFR-4 extension + NFR-7 case |
| `apps/worker/src/weather/weather-ingest.processor.spec.ts` | edit | Asserts `hours` is persisted |
| `apps/web/components/charts/wind-bars.tsx` | **new** | Recharts |
| `apps/web/components/charts/arc-gauge.tsx` | edit | Full-circle preset (or a `radial-gauge.tsx` sibling) |
| `apps/web/components/charts/uv-track.tsx` | **new** | Gradient track |
| `apps/web/components/charts/sun-arc.tsx` | **new** | Custom SVG |
| `apps/web/components/charts/pressure-dial.tsx` | **new** | Custom SVG |
| `apps/web/components/charts/wind-compass.tsx` | **new** | Custom SVG |
| `apps/web/components/charts/config.ts` | edit | Non-green values used by 2+ charts; fix `chartTooltipStyle` |
| `apps/web/components/flora/instrument-card.tsx` | **new** | The shared card chrome |
| `apps/web/components/flora/day-selection-strip.tsx` | **new** | `Day Selection [Schedule]` rebuild |
| `apps/web/components/flora/weather-week-card.tsx` | **new** | The 352×767 left column |
| `apps/web/components/flora/weather-board.tsx` | **new** | `"use client"` — selection state |
| `apps/web/components/flora/weather-day-card.tsx` | edit | Verify at 320 wide |
| `apps/web/app/(app)/weather/page.tsx` | **new** | The screen |
| `apps/web/e2e/weather.spec.ts` | **new** | Functional + NFR-10 |
| `apps/web/e2e/baselines/weather.png` | **new** | Figma export of `3:5274` |
| `apps/web/playwright.config.ts` | edit | **`testMatch` regex** |
| `docs/architecture.md`, `docs/design-spec.md`, `CLAUDE.md`, `README.md` | edit | §2.10 |

No migration. No new environment variable. No new queue, schedule, or SECURITY DEFINER
function — `tenancy.spec.ts`'s allowlist stays at three.

---

## 5. Explicitly out of scope

1. **Historical weather.** Open-Meteo's archive is a different endpoint with a different
   contract. The ‹ pager stops at today; there is no stored past.
2. **Per-field weather.** One farm point, as ingested. Field-level interpolation is not a
   thing the current write path can do.
3. **Soil moisture** (gap **D15** — the Fields card's unsourced metric). Open-Meteo *does*
   publish soil-moisture parameters and this task is the obvious place to notice that, which
   is precisely why it needs its own decision rather than a drive-by. It would change what a
   different screen renders. Its own task.
4. **A farm switcher.** Weather uses the first farm, like Home. Multi-farm navigation is
   unbuilt everywhere and should be built once, not here.
5. **A weather detail screen.** That is what `See All` would open, and D5 stays open.
6. **Weather-driven task suggestions** ("don't irrigate, rain tomorrow"). Not designed.
7. **Energy (`3:5920`) and Carbon Offset (`3:6566`).** Still deferred (architecture §4.3).
8. **Patching `components/ui/chart.tsx`** (invariant 8) — the vendored-tooltip follow-up
   `TASK-home-dashboard` §9 named stays its own task. Fixing the `config.ts` constant is in
   scope; editing the vendored file is not.

---

## 6. Verification

Measurable, per architecture §15. No criterion here says "works".

1. `pnpm build`, `pnpm lint`, `pnpm typecheck` clean across the workspace.
2. `packages/weather` tests pass against **both** fixtures — the new hourly capture and the
   pre-existing daily-only one.
3. `packages/db` integration tests pass against real PostGIS (testcontainers), including a
   payload written without the new optional fields.
4. `GET /api/v1/farms/:id/weather?days=7` returns 7 days, each with `hours.length ≥ 23`, from
   a farm seeded by `db:seed:weather`; `days=99` is rejected 400; a foreign-org id returns
   **404** (NFR-7).
5. NFR-4: `@flora/weather` appears in neither `apps/api/package.json` nor any import under
   `apps/api/src`.
6. `/weather` renders in a real browser against real seeded data — not only in Playwright.
   Every one of the six instrument cards shows a number traceable to a stored value, or an
   em-dash. **`TASK-home-dashboard` §10 and `TASK-crop-stress` both found their worst defects
   this way and neither would have been caught by inspection.**
7. Selecting `Tue` in the strip changes the wind bars, the compass bearing, the UV value, the
   rain percentage and the pressure needle. Selecting `Today` puts the highlighted wind bar on
   the current hour.
8. The page scrolls to the bottom of the Pressure and Wind Direction cards at 1440×900.
9. `weather.spec.ts` runs **through `playwright.config.ts`** (prove it: `pnpm test:e2e` lists
   the file) and passes.
10. NFR-10: `weather.png` diff **measured and recorded** in the spec file's own comment, with
    the threshold set at that floor plus headroom — not loosened until green.
11. `grep -rE '#[0-9a-fA-F]{3,8}' apps/web --include=*.tsx --include=*.ts` returns nothing
    outside `app/globals.css`, `components/charts/config.ts`, `components/map/config.ts`.
12. Every icon is a `@remixicon/react` import whose name matches the Figma layer. Two are
    named in the file and must be used as drawn: **`RiSunCloudyLine`** (This Week) and
    **`RiWindyFill`** (both Wind cards). The other four headers are unnamed `Group` vectors,
    so they are chosen semantically — **resolved 2026-08-16 against the installed
    `@remixicon/react` catalogue** (not guessed, the `TASK-home-dashboard` §1.3 note 4
    precedent): **`RiSunLine`** (UV Index), **`RiShowersLine`** (Rain Chance),
    **`RiSunLine`** (Sunrise & Sunset), **`RiSpeedLine`** (Pressure — a gauge face, a closer
    match than `RiDashboard3Line`). All six exist in the installed package.
13. Docs updated per §2.10, and a grep for the changed names finds no stale reference.

---

## 7. Decisions — all ten taken, 2026-08-16

Taken in this document before any code, the same way `TASK-home-dashboard` §7 took its ten.
Three of them changed under research rather than being rubber-stamped (3, 4, 5) — each is
marked. **Sonnet should build to the "Decision" column and not reopen these**; the reasoning
is in §3 and §2.1.

| # | Question | **Decision** |
|---|---|---|
| 1 | **What does the day strip select?** The mock's strip and its day list disagree (§1.4 item 8) | **The strip drives the six instrument cards**; the week list below stays the whole week. It is the only reading under which the right-hand column means anything. ‹ clamps at today — there is no stored past (§5 item 1). Log as **D32** |
| 2 | **19 bars or 24?** | **24** — one per hour of the selected day, re-pitched into the same 320×130 box (13.33 px pitch, same 3.9 px bar). The mock's 19 is arbitrary, and matching it would mean dropping five real hours to match a drawing. Costs a little NFR-10 delta, which §2.9 already expects to measure rather than assume |
| 3 | **UV bands** | **CHANGED under research.** The WHO/WMO/UNEP/ICNIRP *Global Solar UV Index: A Practical Guide* (WHO/SDE/OEH/02.2) defines five categories with **continuous** boundaries: **Low <3 · Moderate 3–<6 · High 6–<8 · Very high 8–<11 · Extreme ≥11**. This document originally wrote them as integer buckets (0–2 / 3–5 / 6–7 / 8–10 / 11+) — **that form is wrong for this data**: Open-Meteo returns fractional UV (this farm's week peaks at 7.7–8.05), and the integer form has no answer for 7.7. Use the continuous boundaries, cite the guide in the constant |
| 4 | **Rain-chance bands** | **CHANGED under research — they can be sourced after all.** This document assumed no published scale existed and proposed inventing `<30/30–70/>70`. The **US National Weather Service's published PoP terminology** is exactly this scale: **<20 none · 20 slight chance · 30–50 chance · 60–70 likely · ≥80 categorical**. Take the NWS *thresholds* verbatim; shorten the *labels* to fit the 132 px ring (`None · Slight · Chance · Likely · Very likely`). **D31 shrinks from "sign off on invented numbers" to "sign off on shortened wording"** |
| 5 | **Pressure dial scale** | **CHANGED under measurement — see §2.1's box.** Use **`pressure_msl`**, not `surface_pressure`, on a **950–1050 hPa** band, needle clamped, real value printed. The originally-proposed `surface_pressure` + fixed band would have pinned this farm's needle at the floor forever (1,132 m ⇒ 889–898 hPa) and no fixed band can serve both a sea-level and a plateau farm on that parameter. **D30** narrows to "the dial should print its scale" |
| 6 | **Footer timestamps** | Render the hour the displayed value belongs to, in the **farm's** timezone (`10 PM`), and the observation time on the Sunrise card. `10pm23` is not a format in any locale. Log as **D29** |
| 7 | **Two "Wind Status" titles** | The compass ships as **"Wind Direction"**. Same class of fix as "Pendent Tasks" → "Pending Tasks" and "Data:" → "Date:", logged under **D10** |
| 8 | **Card size inconsistencies** (254/250, 262/259, the 345-wide compass) and the odd 5th day-card variant | Normalize: 352 wide everywhere, one height per row (the taller of each pair — 254 / 262 / 278), one day-card variant for all seven days. These are drawing slips, not design |
| 9 | **Seven `See All` buttons with no destination** | **Disabled with a tooltip naming why** — the standing treatment across three previous screens. Keeps **D5** open rather than inventing a screen to satisfy a button |
| 10 | **Header actions** | `+ Create Request` → **`+ Create Task`**, reusing Home's `CreateTaskButton` (D27's resolution). `Schedule`, search and bell disabled with tooltips |

**Sources for 3 and 4** — cite these in the constants, not in a commit message:
WHO/WMO/UNEP/ICNIRP, [*Global Solar UV Index: A Practical Guide*](https://www.who.int/publications/i/item/9241590076)
([ICNIRP mirror](https://www.icnirp.org/cms/upload/publications/ICNIRPWHOSolarUVI.pdf));
NOAA/NWS, [Forecast Terms](https://www.weather.gov/ajk/ForecastTerms) (PoP terminology).

---

## 8. Risks

1. ~~**The hourly parameter names are unverified.**~~ **RETIRED 2026-08-16** — every name and
   unit was verified against a live response at this project's own farm (§2.1), which is the
   `TASK-satellite-live` lesson applied *before* the code rather than after it: that task lost
   a session to a response-shape assumption that had looked fine for two tasks, and the fix
   was one header.
2. ~~**Wind units.**~~ **RETIRED** — `hourly_units` returns `"wind_speed_10m": "km/h"`
   unprompted. Still assert a plausible range in the parser test: the unit is a default, and
   defaults change.
3. **DST and the farm timezone — still live, and no longer theoretical.** Brazil abolished DST
   in 2019, so `America/Sao_Paulo` will not produce a 23- or 25-hour day and **this farm cannot
   surface the bug**. Any code that assumes 24 entries per day will pass every local test and
   break for the first farm in a DST country. Derive the grouping from the timestamps and
   write the test with a fixture that has a 23-hour day in it.
4. **Three hand-rolled SVG charts is the largest block of bespoke rendering in the project.**
   Build them one at a time against real data in a real browser. `TASK-home-dashboard` §10's
   Gathering Rate tooltip bug — an ~11 px hover target nobody noticed by reading the code — is
   what happens when a chart is only ever verified by inspection.
5. **Payload size.** ~2–4 KB per row × 8 rows × N farms per hour. Fine at demo scale; worth a
   sentence in architecture §5.3 rather than a silent assumption.
6. **NFR-10 will not hit 2%.** Expect a Home-like floor. Measure it, record it with the
   reasoning in the spec file, set the threshold at the floor plus headroom. Do not mask.

---

## 9. Follow-on tasks

| Task | Picks up |
|---|---|
| `TASK-stress-to-task` | The Crop Stress popover's create-task button — the oldest deferred item, and a create path now exists to hang it off |
| `TASK-task-detail` | Comments, subtasks, assignees (**D21**) |
| `TASK-soil-moisture` | **D15** — Open-Meteo's soil-moisture parameters at the field centroid, feeding the Fields card's unsourced metric. This task's write path makes it a small change; the decision is not small |
| — (unnamed, small) | The vendored `chart.tsx` tooltip default (invariant 8, `TASK-home-dashboard` §9) |
| — (unnamed, small) | Per-card NFR-10 screenshots instead of full-page diffs — needs `data-testid`s on the composites |
| `TASK-farm-settings` | Editing a farm at all — name, location, timezone. Today the only farm in the database was put there by a seed script and can only be changed with SQL (§10). Should probably derive location from the fields' centroid rather than storing an independent point |
| `TASK-management-zones` (Phase 6) | `15:8608` |
| Design follow-ups | **D5**, D24–D28, and this task's new D29–D32 |

---

## 10. Decisions and `[VERIFY]`s resolved

**Resolved at plan time, 2026-08-16 — before any code, which is the point.** Every `[VERIFY]`
this document introduced is closed, and three of the ten §7 decisions changed as a result.
None of that came from reading the plan harder; it came from making one real request and two
searches.

- **All Open-Meteo parameter names and units (§2.1)** — verified against a **live response at
  this project's own farm coordinates**, not against docs alone. `precipitation_probability_max`
  (%), `wind_direction_10m_dominant` (°), and the hourly `temperature_2m` / `wind_speed_10m`
  (km/h) / `wind_direction_10m` (°) / `pressure_msl` (hPa) / `uv_index` /
  `precipitation_probability` (%). 192 flat hourly entries for `forecast_days=8`, local ISO
  strings with no zone suffix.
- **`surface_pressure` → `pressure_msl` (§7 decision 5)** — the single most consequential
  finding, and it was **invisible until the request ran against a real place**. The farm is at
  1,132 m; `surface_pressure` there is 889–898 hPa against `pressure_msl`'s 1016–1018. The
  originally-planned parameter plus a fixed band would have shipped a dial pinned at its floor.
  This is the same lesson `TASK-crop-stress` recorded for its flat-ramp bug and
  `TASK-home-dashboard` for its 11 px hover target: **the defect was in a plausible-looking
  constant, and only real data at a real location exposed it.**
- **UV bands (§7 decision 3)** — the WHO/WMO/UNEP/ICNIRP guide's five categories use
  continuous boundaries (<3, 3–<6, 6–<8, 8–<11, ≥11). This document's first draft wrote them as
  integer buckets, which cannot classify the fractional values Open-Meteo actually returns
  (this farm's week: 6.4–8.05).
- **Rain-chance bands (§7 decision 4)** — this document asserted "no published scale exists"
  and planned to invent one. **That assertion was wrong.** NOAA/NWS publishes PoP terminology
  with exactly these thresholds. A sourced scale replaced an invented one, and the design gap
  shrank from a numbers question to a wording question. Worth remembering as a class of error:
  *"nobody has standardised this"* is a claim that deserves a search, not an assumption.
- **Remix icon names (§6 item 12)** — resolved against the installed catalogue.

**Environment finding — the farm was in the wrong hemisphere-ish, and it matters to this
screen.** `farms.location` was still the seed's Amazonas point (4.58° S, 59.13° W,
`America/Manaus`) while every real field in the database sits **1,600 km away** at
15.94° S, 48.59° W — **Alexânia, Goiás**. Weather is fetched at `farm.location`, so every
stored forecast, and Home's weather card with it, was describing a place with no fields in it.
Corrected 2026-08-16: the farm row now carries the centroid of its own fields,
`America/Sao_Paulo`, and the name *Flora Farm — Alexânia*; `db:seed:weather` was re-run and
now writes real Alexânia forecasts (verified: today's high 30.9 °C, matching the live API
capture exactly). Three consequences for this task:

1. **The farm timezone is `America/Sao_Paulo`, which has no DST** — see §8 risk 3.
2. **The demo will show 0 % rain probability all week** (Goiás in August is the dry season).
   The Rain Chance ring reading "None" for seven straight days is correct, not a bug, and
   should not be "fixed" by inventing data. Verify that card against a wet-season fixture.
3. **Two footguns are still open and are *not* this task's to close:** `packages/db/src/seed.ts`
   still hardcodes the Amazonas point for a fresh `db:seed`, and **there is no way to edit a
   farm anywhere in the product** — no screen, no endpoint. The durable fix is probably to
   derive the farm's effective location from its fields' centroid (the precedent exists:
   `FieldEditor`'s camera was changed to do exactly this, `TASK-tasks-board`), keeping the
   column only as the seed value a farm needs before its first field is drawn. That is
   `TASK-farm-settings`, not a drive-by here — it changes what a write path does.
