# TASK-spectral-indices — the index layer switcher

> **Status:** planned, 2026-08-16. Written against commit `cf2c0fd`. **Requested by the
> product owner**, not derived from the Figma — there is no artboard for this. The reference
> is a competitor's layer menu (NDVI · Contrasted NDVI · Satellite Image · NDMI · SMI · NDRE ·
> MSAVI · RECI · NDWI · PRI · MCARI, with Productivity map / Soil brightness / Elevation greyed
> out), supplied as a screenshot.
>
> **Phase:** slots after `TASK-weather` (Phase 5) and before `TASK-management-zones` (Phase 6).
> It is not in architecture §16's phasing and does not displace anything there.
>
> **Two findings decide the shape of this task, and both were measured, not assumed:**
>
> 1. **The marginal cost of ten more indices is one extra input band, not ten more requests.**
>    Sentinel Hub charges per *input* band, never per output (§1.3). One evalscript can emit
>    every index as a separate named output in a single Process API call — which is what the
>    pipeline already does for `index` + `scl`.
> 2. **The shipped NDVI raster is already "Contrasted NDVI".** `rampDomain()` stretches every
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

### 1.3 The cost question, answered

**Verified 2026-08-16 against CDSE's own Processing Unit documentation.** A PU is
512×512 px · **3 input bands** · 1 sample/px · ≤16-bit output. The multipliers are:

```
PU = (output area / 512×512) × (input bands / 3) × (output format) × (samples) × (surcharges)
```

> "dividing the requested number of **input** bands by 3" — **the cost depends on input bands,
> not output bands.** Minimum 0.005 PU per Process request. FLOAT32 output is a 2× multiplier.

So the honest cost table for one refresh of one field:

| Approach | Input bands | Relative PU | Verdict |
|---|---|---|---|
| Today (NDVI only) | 6 (`B02,B03,B04,B05,B08,SCL`) | 2.0× | baseline |
| **Eleven indices, one request, N outputs** | **7** (`+B11`) | **2.33×** | **+17%** |
| Eleven indices, one request per index | 6–7 each | ~22× | 11× the request count against a **10,000 req/month** tier |

**This is the whole design.** One evalscript, one Process call, every index as its own named
output — exactly the shape `TASK-satellite-pipeline` §2.2 already built for `index` + `scl`,
extended from two outputs to twelve. Adding ten indices costs **+17%**, and the free tier's
binding constraint is the *request* count, which does not move at all.

`[VERIFY: the response is already a TAR of named members (TASK-satellite-live's fix). Confirm
CDSE returns twelve members as readily as two, and that no per-response size ceiling is hit —
twelve FLOAT32 rasters at field resolution is a materially larger body than two. Measure one
real call before committing to twelve outputs; fall back to two or three grouped calls if a
ceiling exists.]`

`[VERIFY: the live PU cost per refresh is **still unmeasured** — architecture §11.1 and
`TASK-satellite-pipeline` §6 item 13 have both been open since the pipeline landed. This task
changes the multiplier, so it is the natural moment to finally read the number off CDSE's usage
dashboard, before and after. NFR-6 (stay under 60% of tier) cannot be evaluated without it.]`

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
| **PRI** | **Cannot be computed properly.** True PRI is `(R531−R570)/(R531+R570)`; **Sentinel-2 has no 531 nm band** (B02 490, B03 560, B04 665) | — | 🚩 §7 decision 4 |
| **SMI** | Soil Moisture Index — **the name covers several unrelated formulations** (an NDMI rescaling, an LST/NDVI trapezoid needing thermal data Sentinel-2 does not carry, a soil-water-content ratio) | — | 🚩 §7 decision 5 |
| *Productivity map* · *Soil brightness* · *Elevation* | Greyed out in the reference menu too | — | Out of scope (§5). Elevation is a DEM collection, a different data source entirely |

**PRI and SMI are the two that must not be quietly faked.** Every other row is arithmetic on
bands we already pay for. These two are where a plausible-looking formula would ship a number
that means nothing — and `CLAUDE.md`'s first writing rule exists for exactly this case.

---

## 2. Planned changes

### 2.1 One request, twelve outputs

`packages/satellite/src/cdse/evalscript.ts` stops being "one evalscript per index" and becomes
**one evalscript emitting every scheduled index**:

- `input.bands` gains **`B11`** → `["B02","B03","B04","B05","B08","B11","SCL"]`.
- `setup().output` returns one FLOAT32 entry per index plus the existing `scl`.
- `evaluatePixel` returns one key per output.
- `evalscriptFor(index)` is kept for the single-index path (the on-demand refresh) and joined
  by `evalscriptForAll(indices)`.

Keep the per-index function. Do not delete a working narrow path to build a wide one — the
manual refresh (`TASK-crop-stress`) can stay cheap when a user is asking for one layer.

### 2.2 Contracts and the enum

`observationIndexValues` grows: `ndmi`, `msavi`, `reci`, `mcari` (and see §7 for `pri`/`smi`).
That is a **pgEnum**, so it needs a migration — `ALTER TYPE observation_index ADD VALUE`.
Note that Postgres will not let a new enum value be used in the same transaction that adds it;
`drizzle-kit generate` does not always get this right, and `CLAUDE.md` §2.1 already requires
reviewing generated migrations by hand.

`true_color` is **not** a member of the scalar-index set. Split the type:

```
scalarIndexValues   = [ndvi, ndre, ndwi, ndmi, evi, msavi, reci, mcari]
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

- The **daily scheduled refresh** computes the full scalar set in its one call (+17%, §1.3).
- `true_color` stays **on-demand only** — it is a 3-band RGB branch with no stats, and nobody
  needs yesterday's photo daily.
- Re-check NFR-5 (200 fields in 30 min at concurrency 2): the request count does not change,
  but each response is ~6× larger and the raster stage now runs 8 decodes per scene instead of
  1. **The bottleneck moves from network to CPU.** Measure it; do not assume the existing
  headroom survives.

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

1. One real CDSE refresh returns every requested output, and the **measured PU cost** is read
   off the usage dashboard and recorded — before and after — closing architecture §11.1's open
   item.
2. Every index's golden-fixture stats match hand-computed values within tolerance.
3. A field refreshed once has N `observations` rows for that date and N distinct `raster_key`s.
4. Switching layers in a real browser changes raster, legend stops and legend domain, without
   remounting the map; NDWI's legend does not read green-is-good.
5. NFR-5 re-measured at the new per-scene cost (§2.5) — the number recorded, not assumed.
6. `apps/web` still greps clean for raw hex.
7. Docs updated; a stale-reference grep is clean.

---

## 7. Decisions this task needs before code

| # | Decision | Recommendation |
|---|---|---|
| 1 | **"Contrasted NDVI" vs "NDVI"** — what ships today is the contrasted one (§1.4) | Ship **both**, as one index with two domain modes: `NDVI` on a fixed 0…1 domain, `Contrasted NDVI` on the existing p10→p90 stretch. Same raster data, two ramps — **no extra PU at all**. It is also the cheapest way to honour the reference menu exactly |
| 2 | **Twelve outputs in one call, or grouped calls?** | Twelve, pending §1.3's `[VERIFY]` on response size. Fall back to two grouped calls if a ceiling appears |
| 3 | **`true_color` as a separate type** | Yes (§2.2) |
| 4 | **PRI** | **Do not ship it as "PRI".** Sentinel-2 lacks the 531 nm band. Either omit it, or ship it disabled with a tooltip saying it needs a hyperspectral or MODIS-class source — the same honesty the four undesigned buttons get elsewhere. `[VERIFY: whether any published, peer-reviewed Sentinel-2 PRI proxy exists and is worth offering under a clearly different name. Do not adopt a formula found only in a product's marketing page.]` |
| 5 | **SMI** | Same treatment pending a definition. `[VERIFY: which SMI the reference product means. If it is an NDMI rescaling, it is free once B11 is in the request; if it is the LST/NDVI trapezoid, it needs thermal data Sentinel-2 does not carry and belongs to a different mission (Landsat 8/9 TIRS).]` |
| 6 | **Does the daily schedule compute all eight scalar indices, or only NDVI + on-demand?** | All eight. +17% PU for a screen that feels instant on every layer, versus a spinner on ten of eleven menu items |
| 7 | **B12 (SWIR-2)** | Not now. Nothing in the requested list needs it; adding it is another +14% for zero current features |

---

## 8. Risks

1. **The enum migration.** `ALTER TYPE … ADD VALUE` cannot be used in the same transaction that
   adds it, and generated migrations get this wrong. Review by hand.
2. **Response size** (§1.3's first `[VERIFY]`) — twelve FLOAT32 rasters per call.
3. **Raster CPU** (§2.5) — 8 decodes per scene, not 1. NFR-5 is at risk, not the network.
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
