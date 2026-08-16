# TASK-spectral-indices — the index layer switcher

> **Status:** planned, 2026-08-16. Written against commit `cf2c0fd`. **Requested by the
> product owner**, not derived from the Figma — there is no artboard for this. The reference
> is a competitor's layer menu (NDVI · Contrasted NDVI · Satellite Image · NDMI · SMI · NDRE ·
> MSAVI · RECI · NDWI · PRI · MCARI, with Productivity map / Soil brightness / Elevation greyed
> out), supplied as a screenshot.
>
> **Phase:** **built next, before `TASK-weather`** (product owner's call, 2026-08-16). It is
> not in architecture §16's phasing and displaces nothing there — Weather is untouched and
> stays ready to build. Nothing in this task depends on Weather, or the reverse.
>
> **Status: ready to build. All seven §7 decisions are taken and every `[VERIFY]` is closed
> against the real CDSE account or a published source** — §7 and §10 have the measurements.
>
> **Three findings decide the shape of this task. All three are measured, none assumed:**
>
> 1. **Extra outputs are free. Literally zero.** A controlled A/B/C against the live account
>    (§1.3) shows an 11-output request costs **exactly** what a 2-output request with the same
>    input bands costs, to the last decimal. Cost is a function of *input bands* only. One
>    evalscript emits every index in one Process call — the shape the pipeline already uses for
>    `index` + `scl`, widened from 2 outputs to 11.
> 2. **The whole feature costs +17%**, all of it the one extra SWIR band: **4.0 → 4.667 PU**
>    per refresh, measured off CDSE's own `x-processingunits-spent` header.
> 3. **The shipped NDVI raster is already "Contrasted NDVI".** `rampDomain()` stretches every
>    raster to that scene's own p10→p90. The plain, fixed-domain NDVI in the reference menu is
>    the variant this codebase *doesn't* have (§1.4).

---

## 0. Prerequisites

`docs/architecture.md` §5.3 (`observations`, and its `(field_id, captured_on, index)` primary
key), §7 (the write path), §11.1 (Processing Units, and the **still-unmeasured** live PU cost),
§5.5 (what the daily refresh covers). `docs/tasks/TASK-satellite-pipeline.md` §2.2 (the
evalscript), §10 (the flat-ramp bug — read it before touching a ramp).
`docs/tasks/TASK-crop-stress.md` §2.2 (the legend/ramp contract). `CLAUDE.md` invariants 1, 2,
5, 7.

---

## 1. Current scenario

### 1.1 What exists

`ObservationIndex` is **already an enum**, already a primary-key column, and already a query
parameter. This feature was anticipated by the schema; nothing about it requires reshaping the
data model.

| Piece | State |
|---|---|
| `packages/contracts/src/enums.ts` | `observationIndexValues = ["ndvi", "ndre", "ndwi", "evi", "true_color"]` |
| `packages/db/src/schema/observation.ts` | `observation_index` pgEnum built from that array (invariant 4); **PK `(field_id, captured_on, index)`** — many indices per field per date is the existing grain |
| `packages/satellite/src/cdse/evalscript.ts` | `INDEX_FORMULAS` for all five, one evalscript per index, `input.bands = ["B02","B03","B04","B05","B08","SCL"]`, two named outputs (`index` FLOAT32, `scl` UINT8) |
| `packages/raster/` | decode → stats → PNG → stress polygons, all against a single float32 band |
| `packages/contracts/src/ramp.ts` | `NDVI_RAMP_STOPS` (red→yellow→green) + `rampDomain(stats)` = p10→p90, `min`→`max` on collapse |
| `apps/web/.../[fieldId]/stress/` | The screen: raster overlay, stress-zone layer, `ColorRampLegend`, detection list |
| `GET /fields/:id/observations?index=` | Already accepts the parameter, already defaults to `ndvi` |

### 1.2 What does not exist

- **No index is scheduled except NDVI.** The other four enum members have formulas and no
  caller — `true_color`'s formula is explicitly a placeholder (`(B04+B03+B02)/3`, with a
  comment saying so) and no code path invokes it.
- **No layer switcher** anywhere in the UI.
- **One ramp for everything.** `NDVI_RAMP_STOPS` is the only stop set, and `rampDomain` is the
  only domain rule. Nine of the eleven requested indices have a different natural range, and
  three are not even sign-symmetric.
- **No SWIR band.** `B11` is not in the evalscript's input list, so NDMI cannot be computed
  from a stored observation today.
- **`true_color` has no real path.** A true-colour composite is a 3-band RGB PNG with no scalar
  statistics and no stress polygons — a different pipeline branch, not a different formula.

### 1.3 The cost question, answered — measured, not estimated

CDSE's documented formula: 1 PU = 512×512 px · **3 input bands** · 1 sample/px · ≤16-bit output.

```
PU = (output area / 512×512) × (input bands / 3) × (output format) × (samples) × (surcharges)
```

FLOAT32 output is a **2×** multiplier. The documentation says the band factor divides the
requested number of **input** bands by 3 — nothing about outputs.

**Verified 2026-08-16 against the real CDSE account**, three requests, same field, same scene,
reading `x-processingunits-spent` off each response. The C run exists solely to isolate output
count from band count:

| Run | Input bands | Outputs | Body | **Measured PU** |
|---|---|---|---|---|
| **A** — today's shape | 6 (`B02,B03,B04,B05,B08,SCL`) | 2 (`ndvi`,`scl`) | 99 KB | **4.0** |
| **B** — proposed | 8 (`+B11,B12`) | **11** | 976 KB | **5.3333** |
| **C** — control | 8 (`+B11,B12`) | 2 | 99 KB | **5.3333** |

**B and C are identical to the last decimal.** Ten extra outputs and ten times the payload cost
**exactly zero** additional PU. Cost is a pure function of input bands, and the measurements
match the formula exactly (6/3 × 2 = 4.0; 8/3 × 2 = 5.333).

**Both `[VERIFY]`s on this path are closed by that run:**

- **CDSE returns 11 named TAR members as readily as 2** — HTTP 200, `application/x-tar`,
  2.7 s, 976 KB, one `.tif` member per output, no ceiling hit at 512×512. The grouped-calls
  fallback this document planned for is unnecessary.
- **The live PU cost per refresh is 4.0 PU** — open since `TASK-satellite-pipeline` §6 item 13
  and architecture §11.1, now closed. The production request is a fixed 512×512
  (`RASTER_WIDTH_PX`), so this *is* the production number, not a proxy for it.

**Final shape: 7 input bands (`+B11` only, not B12 — §7 decision 7) = 4.667 PU, or +17%.**

#### NFR-6, evaluated at last

The free tier is **10,000 PU/month and 10,000 requests/month**
([CDSE quotas](https://documentation.dataspace.copernicus.eu/Quotas.html)) — note that this is
**PU**, and architecture §7.1 currently mentions only the request ceiling.

The refresh processor already **skips the Process call entirely when that scene date is already
stored** (`refresh.processor.ts`, "the cheapest possible quota saving"). So the daily schedule
does *not* buy a scene per day — it buys one per *new* scene, and Sentinel-2's revisit is ~5
days. At 200 fields:

| | PU/refresh | New scenes/field/month | PU/month | % of tier |
|---|---|---|---|---|
| Today | 4.0 | ~6 | 4,800 | 48% |
| **This task** | **4.667** | ~6 | **5,600** | **56%** ✅ |
| If B12 were added too | 5.333 | ~6 | 6,400 | 64% ❌ |

**56% clears NFR-6's 60% budget — and it is the reason §7 decision 7 rejects B12.** Adding a
band nothing needs would push a passing budget into an alerting one.

**The lever, if it ever binds:** FLOAT32 output is a 2× multiplier that buys precision nobody
uses — UINT16 gives 65,536 steps across an index bounded in [−1, 1]. Switching output
`sampleType` would **halve** every number above (7 bands → 2.33 PU, 28% of tier), at the cost
of a documented scale/offset convention and a clamp range for the unbounded indices (RECI,
MCARI). **Not in this task** — recorded because it is the obvious first move if field count
grows, and because it means the ceiling is much further away than these numbers suggest.

### 1.4 The eleven requested layers, honestly classified

Not all eleven are indices, and two of them are not computable from Sentinel-2 as named.

| Menu item | What it actually is | Bands | Status |
|---|---|---|---|
| **NDVI** | `(B08−B04)/(B08+B04)` | 10 m | ✅ built |
| **Contrasted NDVI** | **Not a new index — a render option.** A per-scene percentile stretch of NDVI | — | ⚠️ **already what ships.** `rampDomain()` is p10→p90. The *missing* variant is plain NDVI on a fixed domain |
| **Satellite Image** | True-colour RGB composite (B04/B03/B02) | 10 m | ⚠️ enum member exists, formula is a documented placeholder; needs a real 3-band branch |
| **NDMI** | `(B08−B11)/(B08+B11)` — moisture | B11 is **20 m** | ❌ needs `B11` added to the input list |
| **NDRE** | `(B08−B05)/(B08+B05)` | B05 20 m | ✅ formula exists, unscheduled |
| **NDWI** | `(B03−B08)/(B03+B08)` — McFeeters, surface water | 10 m | ✅ formula exists, unscheduled |
| **MSAVI** | MSAVI2: `(2·B08+1 − √((2·B08+1)² − 8·(B08−B04)))/2` | 10 m | ❌ new formula, no new band |
| **RECI** | `(B08/B05) − 1` — red-edge chlorophyll | B05 20 m | ❌ new formula, no new band |
| **MCARI** | `((B05−B04) − 0.2·(B05−B03))·(B05/B04)` | B05 20 m | ❌ new formula, no new band |
| **PRI** | True PRI is `(R531−R570)/(R531+R570)` and **Sentinel-2 has no 531 nm band** (B02 490, B03 560, B04 665). A blue/green substitution has published use, with explicitly acknowledged trade-offs | 10 m | ⚠️ ships as **`pri_proxy`** — §7 decision 4 |
| **SMI** | The bare name covers several unrelated formulations, one of which (LST/NDVI trapezoid) needs thermal data Sentinel-2 does not carry. **Resolved to VSDI** (Zhang et al. 2013) — a published, single-scene, optical soil *and* vegetation moisture index on Blue/Red/SWIR | B11 20 m | ⚠️ ships as **`vsdi`**, labelled "SMI" — §7 decision 5 |
| *Productivity map* · *Soil brightness* · *Elevation* | Greyed out in the reference menu too | — | Out of scope (§5). Elevation is a DEM collection, a different data source entirely |

**PRI and SMI are the two that must not be quietly faked**, and neither is shipped under a name
that overstates it. Every other row is arithmetic on bands we already pay for.

---

## 2. Planned changes

### 2.1 One request, eleven outputs

`packages/satellite/src/cdse/evalscript.ts` stops being "one evalscript per index" and becomes
**one evalscript emitting every scheduled index**:

- `input.bands` gains **`B11` only** → `["B02","B03","B04","B05","B08","B11","SCL"]`. **Not
  B12** (§7 decision 7).
- `setup().output` returns one FLOAT32 entry per index plus the existing `scl`.
- `evaluatePixel` returns one key per output.
- `evalscriptFor(index)` is kept for the single-index path (the on-demand refresh) and joined
  by `evalscriptForAll(indices)`.

A working evalscript of exactly this shape was run against the live account while planning
(§1.3) — 11 outputs, 200 OK. The formulas in §1.4 are the ones it used; they are known to
compile under evalscript V3, including `Math.sqrt`/`Math.pow` in MSAVI2.

Keep the per-index function. Do not delete a working narrow path to build a wide one — the
manual refresh (`TASK-crop-stress`) can stay cheap when a user is asking for one layer.

### 2.2 Contracts and the enum

`observationIndexValues` grows by six: `ndmi`, `msavi`, `reci`, `mcari`, `pri_proxy`, `vsdi`.
The last two are named for what they actually are (§7 decisions 4 and 5) — the *menu labels*
"PRI (proxy)" and "SMI" live in the UI layer, and the honest name lives in the data. That is a
**pgEnum**, so it needs a migration — `ALTER TYPE observation_index ADD VALUE`.
Note that Postgres will not let a new enum value be used in the same transaction that adds it;
`drizzle-kit generate` does not always get this right, and `CLAUDE.md` §2.1 already requires
reviewing generated migrations by hand.

`true_color` is **not** a member of the scalar-index set. Split the type:

```
scalarIndexValues     = [ndvi, ndre, ndwi, ndmi, evi, msavi, reci, mcari, pri_proxy, vsdi]
renderableLayerValues = [...scalarIndexValues, "true_color"]
```

The stats/detection pipeline accepts only the former. This keeps "a layer you can look at" and
"a number you can threshold" from being the same type, which is the actual reason `true_color`
has been an awkward enum member since it was added.

### 2.3 Per-index ramps — the real work

`packages/contracts/src/ramp.ts` today holds one stop set and one domain rule. It becomes a
per-index registry: `{ stops, domain: "relative" | [min, max], unit, higherIsBetter }`.

- **NDVI, NDRE, NDMI, NDWI, MSAVI** are bounded −1…1 in principle and roughly 0…1 over crops.
- **RECI** is unbounded above (typically 0…10); **MCARI** is unbounded and not sign-symmetric.
  A relative (p10→p90) domain is the only sane default for these two.
- **NDWI is inverted in meaning** — high is water, not health. Its ramp must not be the same
  red→yellow→green that implies "green is good", or a flooded field will read as thriving.
  `higherIsBetter` exists for this.
- `rampDomain`'s p10→p90 collapse fallback stays exactly as is. `TASK-satellite-pipeline` §10's
  flat-ramp bug lives here.

**Invariant 7 note:** `ramp.ts` is already the documented single exception holding raw stops
(amended for `TASK-crop-stress`). Adding stop sets to that same file extends the existing
exception; it does not create a new one. `apps/web` must still grep clean for hex.

### 2.4 Write path and storage

No schema change beyond the enum: one `observations` row per `(field, date, index)` is already
the grain, and one PNG per index in R2 is already the pattern (object keys, invariant 2 — never
signed URLs). The refresh processor writes N rows and N PNGs per scene instead of one.

**Stress detection stays NDVI-only.** `stress_zones` is a crop-health concept; running polygon
detection over NDWI would produce "stress zones" wherever there is water. This is a one-line
guard and a comment, not a feature.

### 2.5 Scheduling and cost control

- The **daily scheduled refresh** computes all ten scalar indices in its one call
  (§7 decision 6; +17% PU, §1.3).
- `true_color` stays **on-demand only** — it is a 3-band RGB branch with no stats, and nobody
  needs yesterday's photo daily.
- Re-check NFR-5 (200 fields in 30 min at concurrency 2): the request count does not change and
  the call itself took 2.7 s for 11 outputs, but the raster stage now runs **10 decodes per
  scene instead of 1** against a ~10× larger body. **The bottleneck moves from network to
  CPU.** Measure it; do not assume the existing headroom survives.

### 2.6 The switcher UI

A dropdown on the Crop Stress screen (`/fields/[fieldId]/stress`), built from AlignUI
primitives — the reference screenshot is a competitor's UI and is **reference, not a spec to
pixel-match**. Ship it in Flora's own light theme, not the screenshot's dark panel.

- Grouped: **Vegetation** (NDVI, Contrasted NDVI, NDRE, RECI, MCARI, MSAVI) · **Water &
  moisture** (NDMI, NDWI) · **Imagery** (Satellite Image).
- Unavailable entries (Productivity map, Soil brightness, Elevation) render **disabled with a
  tooltip naming why** — the standing treatment across four screens now. They are greyed out in
  the reference too.
- Each index gets an **info tooltip** (the `(i)` in the reference): one sentence on what it
  measures and what high/low means. This is the difference between a menu of acronyms and a
  tool. Source each sentence; do not write them from memory.
- Switching layer swaps the raster source, the legend's stops **and** its domain, and must not
  remount the map (`TASK-crop-stress` established the pattern).
- A layer with no observation for the selected date shows the existing no-imagery state, not a
  blank map.

### 2.7 Tests

Golden-fixture coverage per index (`CLAUDE.md` §Tests): the committed float32 GeoTIFF gets
known expected values for each new formula, asserted within tolerance. One recorded CDSE
response with twelve TAR members replayed through the provider. A ramp test per index asserting
the domain rule and that NDWI's ramp is not the health ramp. E2E: switching layers changes the
legend's numbers and the raster URL.

---

## 3. Why

**Why one request with many outputs.** Because the PU formula says input bands, and the free
tier's scarce resource is requests (10,000/month). Eleven separate calls would multiply the
scarce thing by eleven to save nothing.

**Why `true_color` gets split out of the index enum.** It has no scalar value, no percentile
domain, no stress polygons and no legend. It has been an uncomfortable enum member since it was
added, with a comment apologising for its placeholder formula. A menu that includes "Satellite
Image" is the moment to stop pretending it is an index.

**Why PRI and SMI get a decision instead of a formula.** Sentinel-2 does not have the band PRI
is defined on, and SMI names several different things. Shipping either as a plausible number
would be inventing provider behaviour — the one thing `CLAUDE.md`'s writing rules prohibit
outright.

---

## 4. Affected files

| Path | Change |
|---|---|
| `packages/contracts/src/enums.ts` | Split scalar indices from renderable layers; add the four new members |
| `packages/contracts/src/ramp.ts` | Per-index ramp registry; `higherIsBetter` |
| `packages/db/migrations/00NN_index_enum.sql` | `ALTER TYPE observation_index ADD VALUE` ×4, hand-reviewed |
| `packages/satellite/src/cdse/evalscript.ts` | `B11`; `evalscriptForAll`; new formulas |
| `packages/satellite/src/cdse/process.ts` | Extract N named TAR members instead of 2 |
| `packages/raster/src/*` | Per-index domains; detection guarded to NDVI |
| `apps/worker/src/satellite/refresh.processor.ts` | Write N observations + N PNGs per scene |
| `apps/web/components/map/*`, `components/flora/stress-header.tsx` | The switcher, the legend's per-index domain |
| `docs/architecture.md` §5.5, §11.1 · `docs/design-spec.md` §9 · `CLAUDE.md` | Scope, the PU finding, the new UI with no artboard |

---

## 5. Explicitly out of scope

1. **Productivity map, Soil brightness, Elevation** — greyed out in the reference. Elevation is
   a DEM collection (a different data source and cost), not a Sentinel-2 index.
2. **Backfilling history.** New indices exist from their first refresh forward. Recomputing the
   archive means re-requesting every scene and paying for it twice.
3. **Per-index stress detection and thresholds** (§2.4).
4. **A time-series chart per index.** The screen shows one date.
5. **Index comparison / swipe / split view.**

---

## 6. Verification

1. One real CDSE refresh returns every requested output, and `x-processingunits-spent` reads
   **4.667** (7 bands × FLOAT32 at 512×512). If it reads higher, an unintended band is in the
   request. The header is on every Process response — there is no need to open a dashboard.
2. Every index's golden-fixture stats match hand-computed values within tolerance.
3. A field refreshed once has N `observations` rows for that date and N distinct `raster_key`s.
4. Switching layers in a real browser changes raster, legend stops and legend domain, without
   remounting the map; NDWI's legend does not read green-is-good.
5. NFR-5 re-measured at the new per-scene cost (§2.5) — the number recorded, not assumed.
6. `apps/web` still greps clean for raw hex.
7. Docs updated; a stale-reference grep is clean.

---

## 7. Decisions — all seven taken, 2026-08-16

Taken by the product owner (6) and resolved against the live account or published sources
(1–5, 7). **Sonnet should build to the "Decision" column and not reopen these.**

| # | Question | **Decision** |
|---|---|---|
| 1 | **"Contrasted NDVI" vs "NDVI"** — what ships today is the contrasted one (§1.4) | **Ship both**, as one index with two domain modes: `NDVI` on a fixed 0…1 domain, `Contrasted NDVI` on the existing p10→p90 stretch. Same stored raster, two ramps, **zero extra PU and zero extra storage** — and it honours the reference menu exactly |
| 2 | **Many outputs in one call, or grouped calls?** | **One call, all outputs. Measured, not assumed** (§1.3): 11 outputs returned 200 OK in 2.7 s as an 11-member TAR, and cost **exactly** what 2 outputs cost with the same bands. The grouped-call fallback is unnecessary; delete the idea |
| 3 | **`true_color` as a separate type** | **Yes** (§2.2). It has no scalar value, no domain, no polygons and no legend — it has never belonged in the index enum |
| 4 | **PRI** | **Ship it, named `pri_proxy`, labelled "PRI (proxy)" in the menu.** Sentinel-2 has no 531 nm band; the blue/green substitution (B03/B02) has published use in CO₂-flux work adapted to Sentinel-2 and PlanetScope, with authors explicitly noting the trade-off against hyperspectral. The info tooltip must say it substitutes B02/B03 for 531/570 nm and is not comparable to true PRI. **A user must never see the bare word "PRI" and assume the real thing** |
| 5 | **SMI** | **Ship VSDI** (Zhang et al. 2013) in the SMI slot: `1 − [(ρSWIR − ρblue) + (ρred − ρblue)]` over **B11/B04/B02**. It is published, peer-reviewed, computable from a **single scene**, and it targets soil *and* vegetation moisture — which is what the menu item promises. The two alternatives both fail: the LST/NDVI trapezoid needs thermal data Sentinel-2 does not carry (that is Landsat 8/9 TIRS), and OPTRAM needs dry/wet edges fitted across a long time series, so it is not a per-scene formula at all. Tooltip names VSDI and cites it |
| 6 | **All indices daily, or NDVI + on-demand?** | **All of them, daily** — product owner's call, 2026-08-16. §1.3 makes it cheap: +17% PU, no change in request count, and every layer is instant instead of ten of eleven showing a spinner |
| 7 | **B12 (SWIR-2)** | **No.** Confirmed by resolving decision 5: VSDI's SWIR term is **1565–1655 nm = B11 (1610 nm)**, not B12 (2190 nm). Nothing in the requested list needs B12, and adding it would take the NFR-6 budget from a passing **56%** to an alerting **64%** (§1.3) |

**Sources to cite in the code, not in a commit message:** Zhang, Hong et al., [*VSDI: a visible
and shortwave infrared drought index*](https://www.tandfonline.com/doi/abs/10.1080/01431161.2013.779046),
Int. J. Remote Sensing 34(13), 2013; [CDSE Processing Unit
definition](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Overview/ProcessingUnit.html)
and [quotas](https://documentation.dataspace.copernicus.eu/Quotas.html).

---

## 8. Risks

1. **The enum migration.** `ALTER TYPE … ADD VALUE` cannot be used in the same transaction that
   adds it, and generated migrations get this wrong. Review by hand.
2. ~~**Response size.**~~ **RETIRED** — measured at 976 KB for 11 outputs, 200 OK in 2.7 s
   (§1.3). No ceiling.
3. **Raster CPU** (§2.5) — **now the only real scaling risk.** 10 decodes per scene instead of
   1, and the network cost did not rise with it. NFR-5 (200 fields in 30 min at concurrency 2)
   was measured against a single-index pipeline and must be re-measured, not assumed.
4. **Ramp semantics.** Reusing the health ramp for NDWI or MCARI produces a picture that is
   confidently wrong rather than obviously broken — the most expensive kind of bug this project
   has hit twice already (the flat ramp, the unclipped seed raster).
5. **Scope creep from a competitor screenshot.** The reference is a menu, not a product spec.
   Productivity maps and DEM overlays are separate products; §5 draws the line.

---

## 9. Follow-on tasks

| Task | Picks up |
|---|---|
| `TASK-index-timeseries` | A per-index chart over the season — the obvious next ask once eight indices exist |
| `TASK-farm-settings` | Unrelated, still open (`TASK-weather` §10) |
| Design | This whole screen area has **no artboard**. The switcher, the info tooltips and the per-index legends all need a designer's pass — log as a new gap |
| `TASK-pu-budget` *(only if field count grows)* | The FLOAT32 → UINT16 lever (§1.3) — halves every PU number, needs a scale/offset convention and clamp ranges for RECI/MCARI |

---

## 10. Decisions and `[VERIFY]`s resolved

**Resolved at plan time, 2026-08-16, against the live CDSE account and published sources.**
Nothing below was inferred from documentation alone, and two of the findings contradict what
this document originally assumed.

- **Output count is free — proved by a control, not by reading the docs.** Runs B and C (§1.3)
  differ only in output count and returned **identical** `x-processingunits-spent`
  (5.3333…) for a 976 KB and a 99 KB body. The documentation says cost divides *input* bands by
  3; the control is what turns that into a fact this project can build on.
- **The live PU cost of one refresh is 4.0 PU** — open since `TASK-satellite-pipeline` §6
  item 13 and architecture §11.1, closed here. It needed no usage dashboard: CDSE returns
  `x-processingunits-spent` on every Process response, which no previous task noticed.
- **The free tier is 10,000 PU/month *and* 10,000 requests/month.** Architecture §7.1 currently
  cites only the request ceiling — **the PU ceiling is the binding one** and §7.1 should say so.
- **NFR-6 is evaluable for the first time, and it passes at 56%** — but only because
  `refresh.processor.ts` already skips a scene it has stored, so a daily schedule buys ~6
  scenes a month, not 30. Had it re-fetched daily, today's pipeline alone would sit at 240% of
  the tier. That guard is doing more work than its one-line comment suggests.
- **B12 is not needed** — resolving SMI to VSDI settled it: VSDI's SWIR term is 1565–1655 nm,
  which is **B11**. This document had listed B12 as an open question with a "+14% for zero
  features" recommendation; the answer turned out to be a fact about a formula, not a
  preference.
- **11 outputs return a clean 11-member TAR** in 2.7 s / 976 KB at 512×512. The grouped-call
  fallback was never needed.
- **PRI and SMI both got real answers instead of omissions** (§7 decisions 4 and 5), and both
  ship under names that do not overstate what they are.

**A cost fact worth carrying into every future satellite task:** FLOAT32 output is a flat **2×**
PU multiplier. Half of every PU number this project has ever paid was buying precision past the
fifth decimal of a ratio bounded in [−1, 1].
