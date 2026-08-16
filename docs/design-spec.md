# Flora — Design Specification

> **Status:** Draft v1, 2026-08-15.
> **Source of truth:** Figma `hY3Nd3BBbJsjpihPnfZgpd` — "Flora (Product)".
> **Design system:** [AlignUI v1.2](https://www.alignui.com/docs/v1.2/introduction).
> **Companion document:** [`architecture.md`](./architecture.md) (v2 — TypeScript, NestJS,
> Sentinel Hub, Mapbox).
> **Convention:** `[VERIFY: ...]` marks anything not confirmed against a primary source.

This document is the visual contract. Where it and the Figma disagree, the Figma wins and
this document gets corrected — except where a discrepancy is called out below as a **defect**,
in which case this document wins and the Figma should be fixed.

---

## 1. What the product looks like

Flora is a **light-only, fixed-width 1440 px desktop console**. Every screen is a white
`bg-bg-white-0` canvas holding cards with a 1 px `stroke-soft-200` border and a barely-there
shadow, on a 272 px persistent left sidebar. The accent is a single saturated green
(`#1daf61`) used for primary actions, positive deltas, and every data series. Type is Inter
throughout, tight and small; the visual weight comes from generous white space and large
numerals, not from colour.

The register is **calm dashboard**, not marketing site: no gradients on surfaces, no
illustration except the crop/energy photography in cards, no more than one primary button
per screen.

---

## 2. Screen inventory

| # | Screen | Node | Size | Status |
|---|---|---|---|---|
| 1 | Home | `1:12913` | 1440×900 | Complete |
| 2 | Fields — list | `1:35172` ("Fields - 03") | 1440×900 | Complete |
| 3 | Fields — Crop Stress | `18:6567` ("Fields - 01") | 1440×954 | Complete |
| 4 | Fields — Management | `15:8608` ("Fields - 02") | 1440×1002 | Complete |
| 5 | Tasks | `24:11420` | 1440×900 | Complete (Board tab only) |
| 6 | Weather | `3:5274` | 1440×900 | Complete |
| — | Energy | `3:5920` | 1440×900 | Designed, **deferred** — see §2.4 |
| — | Carbon Offset | `3:6566` | 1440×900 | **Not designed — see §2.2** |
| — | "Frame 167" | `2043:6217` | 1440×901 | Scratch board, not a screen |

Note the Figma frame names are ordered opposite to the user flow: `Fields - 03` is the entry
list, `Fields - 01` is the deepest detail view. Renaming them in Figma would help.

### 2.1 Navigation model

The sidebar as designed carries five destinations — **Home, Fields, Tasks, Weather, Energy** —
plus Settings and Support pinned to the bottom. Carbon Offset appears in no sidebar on any
screen.

**v1 ships four**: Home, Fields, Tasks, Weather. Energy is deferred (§2.4), and a nav item
leading to an empty screen is worse than an absent one. The active-state treatment and the
green edge indicator are unchanged; restoring the fifth entry is one line.

Sub-views are tabs, not destinations:
- Tasks → `Board | List | Timeline` (segmented control, Board designed)
- Fields detail → `Zone | Productivity | Nitrogen Rx` (segmented control, Nitrogen Rx designed)

### 2.2 Carbon Offset is an unthemed template — do not build it

`3:6566` is an unmodified AlignUI PRO fintech/logistics template that has had no Flora design
pass. Evidence:

- Its primary button is **blue `#335CFF`** — AlignUI's default primary — not Flora green.
- Its content is a Mastercard "Savings Card", "Live shipment tracking" for cargo `#JT95232`
  routing Shenzhen → Tokyo, a "Recent Transactions" table of wire transfers and stock
  dividends, and "Shipping revenue" by quarter. None of it is agricultural.
- It is absent from the sidebar on every other screen.

Excluded from v1 (architecture §4.3). It needs a design pass before it can be specified.

### 2.3 Defect — the `fancy/primary` token was never re-themed

The Figma variable `fancy/primary/default` is still **`#335CFF`**, AlignUI's stock blue,
while `primary-base` is correctly `#1daf61`. This is what leaks onto the Carbon Offset
button. Any Fancy Button rendered from that token will come out blue.

**Resolution:** in code, `--primary-*` is set once by the AlignUI CLI (§3.2) and Fancy Button
derives from it, so the bug does not reach production — but the Figma variable should be
remapped so the two stay honest. Flagged, not blocking.

---

### 2.4 Energy is deferred

`3:5920` is fully designed and is **not** a defect — it is deferred by product decision
(architecture §4.3). It sits off the farmer's daily loop, and it has no data source: the cards
show named turbines with live wattage that nothing currently produces.

Consequences inside this document: the sidebar drops to four entries (§2.1), Home's KPI row
is re-sourced (§5.1), and the four Energy-only chart types leave v1's build list (§7.2).
Section 5.7 is retained in full so the screen can be picked up without re-specification.

---

## 3. Design system foundation

### 3.1 What AlignUI is, and what it costs

AlignUI is a **copy-paste** React + Radix + Tailwind component library, not an npm dependency.
Base components are free and pasted from the docs into your repo. **Blocks, sectoral
templates, and the Figma file are PRO (paid).**

The Figma composes several PRO blocks — `Sidebar [Navigation] [1.0]`, `Page Header [1.0]`,
`Widgets [HR Management] [1.0]`, `Schedule Cards [Schedule] [1.0]`, `File Upload Cards [1.0]`.
**Resolved 2026-08-15: there is no PRO seat.** All of them are rebuilt from free base
components — §6.2 maps each block to the primitives it is composed from.

### 3.2 Installation

```bash
# Tailwind CSS v4 must already be present — it is (apps/frontend has tailwindcss ^4)
npx @alignui/cli tailwind
```

The CLI prompts, and the answers for Flora are:

| Prompt | Answer | Why |
|---|---|---|
| Primary colour | **Green** | Figma `primary-base` = `#1daf61` |
| Neutral colour | **Slate** | Figma neutrals `#0e121b / #525866 / #99a0ae / #e1e4ea / #f5f7fa` are AlignUI's **slate** ramp — see the correction below |
| Colour format | **oklch** | Recommended for Tailwind v4.1 |
| Custom prefix | *(blank)* | |
| Create `tailwind.config`? | **No — CSS-only** | v4 CSS-first |
| Global CSS file | `app/globals.css` | |

> **The CLI overwrites `app/globals.css`.** That file is currently the `create-next-app`
> scaffold and is being replaced anyway (architecture §2.2), so this is safe here — but it
> must be run before any Flora-specific CSS is added to that file.

**Correction, resolved by `TASK-design-system-shell` (2026-08-15) — the neutral colour is
Slate, not Gray.** This document originally called the five Figma neutral hexes "AlignUI's
gray ramp." They are not: AlignUI's **Gray** primitive is fully achromatic (`oklch(L 0 0)` at
every step — 50 renders `#f7f7f7`), while the Figma hexes above have a faint blue tint and
convert exactly to AlignUI's **Slate** ramp (verified by converting each generated `oklch()`
value to sRGB: slate-50 → `#f5f7fa`, slate-950 → `#0e121b`, matching the Figma values to the
hex digit). Picking Gray at the CLI prompt renders every `bg-weak-50` / `text-sub-600` /
`stroke-soft-200` etc. surface a shade greyer than the Figma. The CLI was re-run with Slate;
`app/globals.css`'s `--color-neutral-*` aliases now point at the slate ramp.

**Resolved 2026-08-15 — the `[VERIFY]` on `--primary-base`.** The CLI's generated
`--color-primary-base` (`var(--color-green-600)`, `oklch(66.41% 0.1630 153.13)`) converts to
sRGB `#1daf61` exactly — no override needed. Verified in code by
`e2e/shell.spec.ts`'s "accent resolves to #1daf61" test, which clamps the computed value
through a canvas 2D context (`getComputedStyle` serializes `oklch()` back as `lab()`/`oklab()`,
not `rgb()`, so a raw string comparison is not reliable).

Then, per the AlignUI Next.js guide:
- Utilities `cn`, `tv`, `recursiveCloneChildren`, `Polymorphic` → `utils/`
- Icons: `pnpm add @remixicon/react`
- Font: Inter via `next/font/google`, bound to `--font-sans`

### 3.3 Colour tokens

Extracted from the Figma via `get_variable_defs` on `1:12913`. **Use the Tailwind class, never
the hex** — the hex column exists only to verify the CLI output.

| Figma variable | Tailwind class | Hex | Used for |
|---|---|---|---|
| `primary-base` | `primary-base` | `#1daf61` | Primary buttons, active nav, all data series |
| `bg/white-0` | `bg-bg-white-0` | `#ffffff` | Page and card background |
| `bg/weak-50` | `bg-bg-weak-50` | `#f5f7fa` | Active nav row, inset panels, table header |
| `bg/soft-200` | `bg-bg-soft-200` | `#e1e4ea` | Progress-bar track |
| `stroke/soft-200` | `border-stroke-soft-200` | `#e1e4ea` | Every card border, every divider |
| `text/strong-950` | `text-text-strong-950` | `#0e121b` | Headings, metric values |
| `text/sub-600` | `text-text-sub-600` | `#525866` | Labels, secondary text |
| `text/soft-400` | `text-text-soft-400` | `#99a0ae` | Axis labels, placeholders, units |
| `icon/sub-600` | `text-icon-sub-600` | `#525866` | Default icon |
| `icon/soft-400` | `text-icon-soft-400` | `#99a0ae` | De-emphasised icon |
| `icon/disabled-300` | `text-icon-disabled-300` | `#cacfd8` | Disabled icon |
| `state/success/base` | `bg-success-base` | `#1fc16b` | Positive delta badge text |
| `state/success/lighter` | `bg-success-lighter` | `#e0faec` | Positive delta badge fill |
| `state/error/base` | `bg-error-base` | `#fb3748` | Negative delta |
| `state/error/light` | `bg-error-light` | `#ffc0c5` | |
| `state/verified/base` | `text-verified-base` | `#47c2ff` | "Watering" activity tag |
| `state/verified/lighter` | `bg-verified-lighter` | `#ebf8ff` | "Watering" tag fill |
| `yellow/500` | `text-yellow-500` | `#f6b51e` | "Fertilization" tag |
| `yellow/200` | `bg-yellow-200` | `#ffecc0` | "Fertilization" tag fill |

**Correction, resolved 2026-08-15 (`TASK-design-system-shell`) — no `state-` infix.** This
table originally listed `bg-state-success-base` / `bg-state-error-base`. The AlignUI CLI emits
`--color-success-base`, `--color-error-base`, `--color-verified-base` etc. directly (no
`state-` segment); the hex values above are unchanged and correct, only the class names were
wrong. Confirmed by generating `app/globals.css` and converting each `oklch()` value back to
sRGB.

**Green ramp** (chart series and the crop donut):
`50 #e0faec` · `100 #d0fbe9` · `300 #84ebb4` · `500 #1fc16b` · `600 #1daf61` ·
`700 #178c4e` · `800 #1a7544` · `900 #16643b` · `950 #0b4627`

The Planting Productivity stacked bars use, from top to bottom, `900 → 600 → 500 → 300`.
The Crops Stocked donut uses `950 / 800 / 600 / 300` for Corn / Wheat / Soy / Rice.

**Activity tag palette** (used on task cards and field cards):

| Activity | Text | Fill |
|---|---|---|
| Watering | sky (`verified-base`) `#47c2ff` | `#ebf8ff` |
| Planting | green (`success-base`) `#1fc16b` | `#e0faec` |
| Fertilization | yellow (`away-base`) `#f6b51e` | `#fffaeb` |
| Pest Control | pink (`highlighted-base`) `#fb4ba3` | `#ffebf4` |
| Harvesting | orange (`warning-base`), token unconfirmed | lighter, token unconfirmed `[VERIFY: never appears on a card in 1:35172; read from 24:11420 when Tasks ships]` |

**Corrected 2026-08-16 (`TASK-fields` §2.12), against real card data (`get_design_context` on
`2158:18884`/`19459`/`19362`/`19539`):** Planting's text is `success-base` (`#1fc16b`,
green-500), not `#1daf61` (green-600/`primary-base`) as this table previously said; Fertilization's
fill is `away-lighter` (`#fffaeb`), not `#ffecc0`. Pest Control's tokens, previously an open
`[VERIFY]`, are confirmed `highlighted-base`/`highlighted-lighter`. Harvesting still never
appears on a fetched card — its row stays a best-effort match to `warning`, open until Tasks
(`24:11420`) ships a real one.

### 3.4 Typography

Families: **Inter** (body/UI), **Inter Display** (large titles), **Plus Jakarta Sans**
(observed on one `Label/Small` instance).

| Token | Family | Size / line | Weight | Tracking |
|---|---|---|---|---|
| `Title/H5` | Inter Display | 24 / 32 | 500 | 0 |
| `Label/X Large` | Inter | 24 / 32 | 500 | −1.5% |
| `Label/Large` | Inter | 18 / 24 | 500 | −1.5% |
| `Label/Medium` | Inter | 16 / 24 | 500 | −1.1% |
| `Label/Small` | Inter | 14 / 20 | 500 | −0.6% |
| `Label/X Small` | Inter | 12 / 16 | 500 | 0 |
| `Paragraph/Medium` | Inter | 16 / 24 | 400 | −1.1% |
| `Paragraph/Small` | Inter | 14 / 20 | 400 | −0.6% |
| `Paragraph/X Small` | Inter | 12 / 16 | 400 | 0 |
| `Subheading/X Small` | Inter | 12 / 16 | 500 | +4% |
| `Subheading/2X Small` | Inter | 11 / 12 | 500 | +2% |

`Subheading/*` is the uppercase micro-label — the sidebar's "MAIN"/"FAVS", and "TOTAL SCORE"
under the gauge.

> **Do not hand-transcribe tracking.** The AlignUI CLI generates the full type scale into
> `globals.css` as `--text-label-sm` etc. Use those. The table above exists to identify
> *which* token a given Figma layer uses, not to be retyped as CSS.

`[VERIFY: the tracking column is read as percent. Figma's export is unit-ambiguous — it gives
"-0.6" at 14 px and "4" at 12 px, which are only sane as percentages. Confirm against the
AlignUI generated scale; if they match, delete this note.]`

**Resolved 2026-08-15 (`TASK-design-system-shell`) — "Inter Display."** `next/font/google`'s
`Inter({ axes: ["opsz"] })` compiles and builds without error, so Google's Inter *does* ship an
optical-size axis under Next.js's font loader. `Title/H5` gets Inter at its display optical
size and the two families collapse to the one `--font-sans` variable
(`apps/web/app/layout.tsx`) — no self-hosting from rsms.me needed.

`[VERIFY: Plus Jakarta Sans appears on a single Label/Small instance. Confirm whether this is
intentional or a stray override; if stray, it should be Inter.]`

### 3.5 Radius, elevation, icons

- **Radius:** `6 · 8 · 10 · 12 · 16 · full(999)`. Cards use **16**, buttons and inputs **10**,
  tags and badges **full**, small icon tiles **8**.
- **Elevation:** one shadow only — `regular-shadow/x-small` =
  `0 1px 2px rgba(10,13,20,0.03)`. Cards are separated by their border, not by shadow.
  Popovers and dropdowns lift; nothing else does.
- **Icons:** **Remix Icon** via `@remixicon/react`. Every icon in the Figma is a Remix name
  and can be imported directly — `plant-fill`, `lightbulb-flash-fill`, `drop-fill`,
  `heart-add-line`, `shopping-basket-line`, `task-line`, `sun-cloudy-line`, `store-2-line`,
  `arrow-up-line`, `user-3-line`, `settings-4-line`. Sizes: **24** in card headers, **20** in
  list rows, **16** inline with text, **42** in the large KPI tiles.

---

## 4. Layout

### 4.1 Frame

| Region | x | width |
|---|---|---|
| Sidebar | 0 | **272** |
| Page header | 272 | 1168 (height **88**) |
| Content column | **298** | **1110** (→ right edge 1408) |

Vertical: header 88, content starts y = 94, cards flow with a **16 px** gap.

**Defect — inconsistent gutters.** The content column insets 26 px from the sidebar but 32 px
from the right edge, while the page header's own content insets 32 px from the sidebar. And
the Home grid uses a 16 px gap everywhere except one 24 px column gap (Weather → Gathering
Rate). **Build to 32 px insets and a uniform 16 px gap**; the Figma has ~6 px of drift.

### 4.2 Sidebar (272 px, expanded)

Top to bottom: 40×40 green logo tile + "Flora™" (`Label/Small`) over "Agrotechnology"
(`Paragraph/X Small`, `text-soft-400`), with a collapse toggle at the right · divider ·
`MAIN` subheading · five nav rows · spacer · Settings, Support · divider · 40 px avatar +
name with a verified tick + email + chevron.

Nav row: 40 px tall, 8 px radius, 24 px icon + `Label/Small`. **Active** = `bg-weak-50` fill,
`text-strong-950`, a green left indicator bar flush to the sidebar edge, and a trailing
chevron.

### 4.3 Sidebar (80 px, collapsed)

The three Fields screens use a collapsed icon rail — icons only, plus a `FAVS` section of
coloured dots (saved views), and no user name block. The map needs the width.

**Resolved 2026-08-15 (`TASK-design-system-shell`) — collapse is a user toggle, persisted.**
`AppSidebar` takes a `collapsed: boolean` prop and knows nothing about routes; the state lives
in a `flora_sidebar` cookie, read server-side in `app/(app)/layout.tsx` so first paint is
already the correct width (no flash, no layout shift — NFR-10's CLS budget). The three Fields
screens showing it collapsed is read as a **default for that route**, not a constraint the
component enforces — flagged as its own open question in §9's gap table rather than built
against, since Fields' data model doesn't exist yet (`TASK-fields`). The `FAVS` saved-views
dot section is likewise out of scope until then — a decorative row of dots with no data is
worse than its absence.

### 4.4 Split layouts (Fields)

| Screen | Rail | Panel | Map |
|---|---|---|---|
| Fields — list (`1:35172`) | 80 | 80 → 795 (715) | 795 → 1440 (645) |
| Crop Stress (`18:6567`) | 80 | 80 → 540 (460) | 540 → 1440 (900) |
| Management (`15:8608`) | 80 | 80 → 540 (460) | 540 → 1440 (900) |

The map is full-bleed to the right and bottom edges with no border or radius. Panel and map
scroll independently.

### 4.5 Card anatomy

The dominant unit. `bg-white-0`, `border-stroke-soft-200`, radius 16, padding 16.

```
┌─ 16 padding ───────────────────────────────┐
│ [24 icon] Title (Label/Large)   [ Details ]│  ← header row, 28 high
│ ─── 16 gap ─────────────────────────────── │
│ body                                        │
└─────────────────────────────────────────────┘
```

The trailing control is a 66×28 `Button` variant reading **Details** (or **See All** on
Weather, or a 28×28 icon `Compact Button`). It is present on nearly every card — treat it as
part of the card header component, not as per-card decoration.

---

## 5. Screen specifications

### 5.1 Home — `1:12913`

Page header: 56 px avatar · "Maria Goodpart" (`Title/H5`) over "Welcome back to Flora™ 👋"
(`Paragraph/Small`, `text-sub-600`) · right: search icon, bell with an unread dot, and a
primary **+ Create Request** button.

**Row 1** (y 94, h 218) — three KPI tiles at 214.33 px each, then one 467 px card, all
inside a single bordered container with internal dividers (not four separate cards):

- **KPI tile**: 56×56 `bg-weak-50` rounded tile holding a 42 px green fill icon at top;
  at the bottom a `Label/Small` label + a 16 px info icon, then the value in `Label/X Large`
  with a delta badge beside it. Values as designed: Crops Stocked **277 T** `↗14%`,
  Energy Generated **63,3 MW** `↘8%`, Water Used **22 kL** `↗14%`.

  > **v1 change — middle tile.** Two of these three tiles have no data source in the design.
  > With Energy deferred, the middle tile becomes **Fields at Risk** (count of fields with
  > unmuted stress zones, `alert-fill` icon, no unit suffix), and **Water Used** is re-sourced
  > from volumes logged on completed watering tasks. Layout, sizes and the delta badge are
  > untouched — only the middle tile's label, icon and source change. Rationale and sign-off
  > status in architecture §4.4.
- **Crops Stocked** card: a 103 px donut with **277T / Crops** centred, beside a 2×2 grid of
  legend cells — coloured dot + crop name + share (Corn 35%, Wheat 28%, Soy 25%, Rice 12%).

**Row 2** (y 328, h 270)

- **Regeneration Score** (335 wide): a 180° arc gauge, green fill on a light track with
  rounded caps, **95** in ~40 px type centred with `TOTAL SCORE` beneath; below a divider, a
  row with a 37 px rounded icon tile, **86**, "Nice you had a greater score!" and a chevron.
- **Planting Productivity** (759 wide): 12-month stacked column chart, 40 px bars, y-axis
  0–100% in 25% steps, gridlines `stroke-soft-200`, four green stack segments.

**Row 3** (y ~613)

- **Weather** (400 wide): two stacked day cards — 64 px weather glyph, day name right-aligned
  in `Label/Large`, temperature in `Label/X Large` with a superscript unit, date at right.
- **Gathering Rate** (335 wide): **1,23T**`/day` with a `-0.4%` badge, a
  `1D/1W/1M/3M/1Y` button group, a green gradient area chart over 6 months, then two rows of
  channel breakdown (Online Store $52.12 ↑4.5%, Instagram $37.75 ↑3.2%).
- **Pendent Tasks** (335 wide): stacked task cards — "Field: Wheat 09", a divider, the task
  title in `Label/Medium`, a 16 px progress ring + `25%`, then an avatar group and an
  activity tag.

### 5.2 Fields — list — `1:35172`

Header: 40 px icon tile + "Fields" · right: secondary **Import**, primary **+ Add Field**.
Toolbar: full-width search with a `⌘1` kbd hint, **Filter** and **Sort by** buttons.

**Field card** (2-up grid, ~285 px each): title `Title/H5` · activity tags · a Growth row
(icon + label + right-aligned %) over a full-width progress bar · a 2×2 metric grid
(Specie Planted, Crops Quantity, Soil Moisture, Carbon Ton Potential) with `Label/X Small`
labels above `Label/Medium` values · a footer with the centroid `4.5831° S / 59.1328° W` in
`Paragraph/X Small` and a primary **View Details** button. Selected card = green border.

Map: a stylised isometric plot render with floating field labels.
**Resolved 2026-08-16 (`TASK-fields` §1.1): the isometric render is an illustration, not a
renderable map style.** Built as a top-down Mapbox satellite basemap (`satellite-streets-v12`,
`pitch: 0`) carrying white field boundaries (`success-base` green when selected — confirmed
against `2158:19362`, Field 239's selected card, not `primary-base`) and label pills rendered as
a `symbol` layer with `text-halo-width` standing in for a real pill background
(`components/map/field-label-layer.tsx`). Consequence for NFR-10 (design-spec §10 item 1): the
map region has no Figma-comparable render and is excluded from the panel's visual diff — see
`TASK-fields.md` §6 item 14.

Card data (`get_design_context` on `2158:18884`/`19459`/`19362`/`19539`) shows all four cards
with `Corn` / `1.9 T`, and confirms Pest Control's colour as `state/highlighted`
(`#fb4ba3`/`#ffebf4`) — resolving §3.3's `[VERIFY]` for that row; Harvesting never appears on a
fetched card, so §3.3's `[VERIFY]` for it stays open.

### 5.3 Fields — Crop Stress — `18:6567`

Header: "Fields" + a **Field 239** dropdown.
Panel: title "Crop Stress" · a **Data:** row with a date picker (`28 Aug 2024`) and an index
dropdown (`NDVI`) · "**8 stress detected** 24.1 ac" with an overflow menu · a **Sort: Priority**
control · a group heading with a leaf glyph ("Low vigor") · then detection rows.

**Detection row**: 24 px plant icon · a classification dropdown ("Soil Issue") over its date
range `1 Aug - 24 aug (1.9 ac)` · an optional `NEW` badge · a mute (bell-off) toggle.

Map: satellite base with white field boundaries and label pills (Field 237–240); the selected
field carries the NDVI raster clipped to its boundary, red→yellow→green. Controls top-left:
locate, measure, zoom in/out. Bottom-left: a vertical colour-ramp legend labelled
`.78 .71 .63 .56 .48 .41` with a **Relative** dropdown beneath — so the ramp has both relative
and absolute modes. Bottom-right: a round green assistant FAB.

**Detection popover** (~325 px): "Stress detected" + close · the id `42BB-37AC` · an
"Identified:" row with a satellite icon and `Jul 5 - Aug 24` · a divider · a metrics row
(`24 Aug 23` · `4.5 ac` · `NDVI: 0.52` in red) · a full-width classification select · a
two-button footer split by a divider: **Mute** and **Delete**.

### 5.4 Fields — Management — `15:8608`

Panel: "Field Management" · a `Zone | Productivity | Nitrogen Rx` segmented control
(Nitrogen Rx active) · a **Recommendation** block with "Yield potential: 1.5-1.7 T/ac" and a
help icon · three scenario cards (**Max Roi / Balanced / Max yield**) sharing left-hand row
labels (Goal, Avg. Rx lbs/ac, Yield ↗); the selected card has a green border and
`bg-success-lighter` fill. Values as designed: Rx 40/40/40, Yield 21% / 56% / 71%.

Below: "Product: Urea (lbs/ac)" and a five-row table — Name (a coloured zone pill), Yield
Goal, Area (`2.5 ac (2%)`), RX. Zone pill colours are the viridis ramp and **must match the
map raster exactly**: `Zone 1` yellow, `Zone 2` light green, `Zone 3` teal, `Zone 4` blue,
`Zone 5` purple.

Map: the same satellite base, with the selected field showing a viridis-ramped zone raster.

### 5.5 Tasks — `24:11420`

Header: 40 px green check tile · "My Tasks" over "Check all the tasks you need to create" ·
right: **Import** and primary **+ Create Task**.
Toolbar: a `Board | List | Timeline` segmented control at the left; search + Filter + Sort at
the right.

**Board**: three columns (To Do 2, In Progress 3, Done 3) on a `bg-weak-50` fill with radius
16. Column header: a status dot (grey / yellow / green) + name + count, and `+` and `⋯` at the
right. Footer: a **+ Add task** ghost row.

**Task card**: "Field: Wheat 09" in `Paragraph/X Small` · divider · title in `Label/Medium` ·
a progress ring + `25%` · an avatar group (3) + an activity tag · a footer row with a comment
count `2`, a subtask count `1/5`, and a right-aligned date range `Sep 24 - Oct 4`.

Drag-and-drop between columns is implied by the board and is a hard requirement
(architecture NFR-7). List and Timeline tabs are **undesigned** —
`[VERIFY: request List and Timeline designs, or scope Phase 3 to Board only and hide the
other two tabs rather than shipping an empty state behind them.]`

### 5.6 Weather — `3:5274`

A 2-column layout: a tall **This Week** card on the left (a day strip with ‹ › paging and a
green selected pill, over stacked day cards identical to Home's), and a 2-up grid of instrument
cards on the right — **Wind Status** (a bar chart of hourly speed with one highlighted bar,
`56 Km/h`, timestamp), **UV Index** (`2` / `Low` over a green→red gradient track with a
draggable thumb), **Rain Chanse** *(sic — typo in the design, ship it as "Rain Chance")*
(a light-blue arc gauge reading `Low`, `24%`), **Sunrise & Sunset** (a dotted arc with a sun
marker, `5:50AM` / `6:30PM`), **Pressure** (a fine-tick radial dial), and a second **Wind
Status** (an N/E/S/W compass with a green vector and `8 km/h` centred).

Every card here carries a **See All** button — `[VERIFY: what "See All" opens. There is no
weather detail screen in the file.]`

### 5.7 Energy — `3:5920` — **deferred (§2.4), retained for reference**

Header adds a **Last month** date-range picker beside the primary **+ Add Regeneration**.

Row 1: three **asset cards** — a `Eolic`/`Solar` tag plus a green `Regenerative` tag, an
overflow menu, the asset name in `Paragraph/Small`, the output in `Label/X Large` with a delta
badge, and a photographic cutout of the turbine/panel bleeding to the card's right edge.

Row 2: **Energy Generated** (a smooth green gradient area chart over a month, y-axis 0–1K,
with a hover tooltip showing `Sep 20, 2024 / 609,41 watts` and a point marker) and
**Energy Map** (`219,3 W/day`, a `Less ▁▂▃▄ More` legend, and a weekday × hour heatmap in five
green steps).

Row 3: **Energy Fonts** (a Monthly dropdown; three horizontal bars — Eolic, Solar, Normal —
on a 0–1K axis with a dark tooltip reading `800 W`) and **Energy Storage**
(`7352 W / 10.000 W`, "Your battery of energy is secure", a 🤩 emoji tile, and a row of ~44
thin vertical bars filled green to the charge level).

---

## 6. Component inventory

### 6.1 AlignUI base — free, paste from docs

`Button` · `Compact Button` · `Fancy Button` · `Link Button` · `Button Group` ·
`Badge` · `Status Badge` · `Tag` · `Avatar` · `Avatar Group` · `Avatar Group Compact` ·
`Progress Bar` · `Progress Circle` · `Divider` · `Kbd` · `Tooltip` · `Select` · `Dropdown` ·
`Popover` · `Modal` · `Datepicker` · `Segmented Control` · `Tab Menu Horizontal` ·
`Switch` · `Checkbox` · `Input` · `Textarea` · `Label` · `Hint` · `Slider` · `Data Table` ·
`File Upload` · `Command Menu` · `Notification` · `Toast`

### 6.2 PRO blocks in the Figma — rebuilt from base components

**Decided 2026-08-15: there is no AlignUI PRO seat.** Every block below is rebuilt as a Flora
composite from free base components. They are not exotic — each is a layout over primitives
we already have, and rebuilding them means they take Flora's props rather than a generic
block's.

| Figma PRO block | Rebuilt as | Composed from |
|---|---|---|
| `Sidebar [Navigation] [1.0]` | `AppSidebar` | Avatar · Divider · Button · Tooltip (collapsed rail) |
| `Page Header [1.0]` | `PageHeader` | Avatar · Button · Badge · Dropdown |
| `Widgets [HR Management] [1.0]` | `WidgetCard` | the §4.5 card anatomy — Divider · Button · Progress Circle |
| `Schedule Cards [Schedule] [1.0]` | `WeatherDayCard` | plain layout + Label tokens |
| `File Upload Cards [1.0]` | `ImportCard` | File Upload · Progress Bar · Compact Button |
| `Chart Legends [1.0]` | `ChartLegend` | shadcn `ChartLegendContent` (§7) |
| `Content Divider [1.0]` | AlignUI `Divider` | direct substitute |
| `Stacked Progress Bar` | `StackedProgressBar` | flex divs on the green ramp |
| `Gauge Bar [Time Off] [1.0]` | `ArcGauge` | shadcn `RadialBarChart` (§7.2) |

`AppSidebar` and `PageHeader` are the two with real work in them — the collapsed 80 px rail
(§4.3) and the active-state edge indicator (§4.2) are the fiddly parts. Budget them as
first-class components in `TASK-design-system-shell`, not as afterthoughts.

### 6.3 Flora-specific — build regardless

`KpiTile` · `CardHeader` (icon + title + trailing Details) · `DeltaBadge` ·
`ActivityTag` · `FieldCard` · `FieldMap` (Mapbox GL) · `RasterOverlay` (image source) ·
`FieldLabelLayer` · `ColorRampLegend` ·
`MapToolbar` · `FieldLabelPill` · `StressZoneRow` · `StressPopover` · `ZonePill` ·
`ScenarioCard` · `PrescriptionTable` · `TaskCard` · `KanbanColumn` · `KanbanBoard` ·
`WeatherDayCard` · `AssetCard` · `AssistantFab`

---

## 7. Charts

**AlignUI ships no chart component.** Its catalogue is Actions / Displaying Data / Feedback /
Form / Layout / Navigation / Overlays / Utils — nothing for data visualisation. Charts come
from **shadcn/ui's `chart` component**, which is a thin themeable layer over **Recharts v3**:

```bash
pnpm dlx shadcn@latest add chart
```

It provides `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`,
`ChartLegendContent` and the `ChartConfig` type, themed through `--chart-*` CSS variables.

### 7.1 Installation order matters

`shadcn init` and the AlignUI CLI both want to own `globals.css`. Run them in this order:

1. `npx @alignui/cli tailwind` — writes the full AlignUI token set (§3.2). It **overwrites**
   the file, so it must go first.
2. Add the shadcn chart component, then **append only** the `--chart-1` … `--chart-5`
   variables to `globals.css`, mapped to the Flora green ramp (§3.3):
   `--chart-1: var(--color-green-950)` … `--chart-5: var(--color-green-300)`. Note the
   `--color-` prefix — the AlignUI CLI emits Tailwind v4 `@theme` names (`--color-green-950`),
   not the bare `--green-950` this document originally guessed.

Do not let a shadcn theme generator rewrite the file — it will replace AlignUI's tokens with
shadcn's own `--background`/`--foreground` set and every screen loses its palette.

**Resolved 2026-08-15 (`TASK-design-system-shell`) — neither.** `pnpm dlx shadcn@latest add
chart --dry-run --diff` doesn't touch `globals.css` in this project, but it also creates
`components/ui/card.tsx` — an unwanted dependency (Flora has its own `Card`/`CardHeader`
composite, §4.5). `chart.tsx` was fetched directly from `github.com/shadcn-ui/ui`
(`apps/v4/registry/new-york-v4/ui/chart.tsx`) instead, with `components.json` hand-written
(no `init` run) so `components/ui/**` aliases still resolve. See
`apps/web/components/ui/SOURCES.md` for the exact commit and the one bug-fixed import path.

**Recharts v3 token syntax:** reference chart tokens as `var(--chart-1)`, **not**
`hsl(var(--chart-1))`. The wrapped form is everywhere in older shadcn examples and blog posts,
and under v3 it silently renders nothing.

### 7.2 Per-chart assignment

| Chart | Screen | Build with |
|---|---|---|
| Stacked column (Planting Productivity) | Home | shadcn/Recharts `BarChart`, stacked |
| Donut (Crops Stocked) | Home | shadcn/Recharts `PieChart`, `innerRadius` |
| Area + gradient (Gathering Rate) | Home | shadcn/Recharts `AreaChart` |
| **Arc gauge** (Regeneration Score, Rain Chance) | Home, Weather | shadcn/Recharts **`RadialBarChart`** — the shadcn radial chart variants cover the track, rounded cap and centred label |
| Vertical bars (Wind Status) | Weather | shadcn/Recharts `BarChart` |
| ~~Horizontal bars (Energy Fonts)~~ | ~~Energy~~ | deferred (§2.4) |
| Progress ring (task 25%) | Home, Tasks | AlignUI `Progress Circle` |
| Compass (wind direction) | Weather | **Custom SVG** |
| Sunrise/sunset arc | Weather | **Custom SVG** |
| Radial tick dial (Pressure) | Weather | **Custom SVG** |
| ~~Weekday × hour heatmap (Energy Map)~~ | ~~Energy~~ | deferred (§2.4) |
| ~~Battery bar strip~~ | ~~Energy~~ | deferred (§2.4) |

**v1 builds seven charts**: five from shadcn/Recharts and three hand-rolled SVG (the compass,
sun arc and barometer dial on Weather). Deferring Energy removes the two pure-CSS charts and
one horizontal bar chart entirely. The three custom ones are genuinely not chart-library
shapes — a compass rose, a
dotted sun arc and a fine-tick barometer dial are each ~30 lines of SVG, and wrapping a chart
library around them costs more than it saves.

### 7.3 Shared chart configuration

One module, `components/charts/config.ts`, holds: the green-ramp series colours mapped to
`--chart-*`, `stroke-soft-200` gridlines, `text-soft-400` axis labels at `Paragraph/X Small`,
no legend where the card header already names the series, and the dark rounded tooltip seen on
the Energy Fonts card. It is the only file besides `globals.css` permitted to contain raw
colour values (§10).

## 8. Interaction and motion

The file contains no prototype links and no motion specs, so the following are **proposals**,
not extractions:

- Hover on cards: no lift; the trailing Details button gains `bg-weak-50`.
- Nav row hover: `bg-weak-50`. Active: `bg-weak-50` + green edge bar.
- Chart hover: a vertical guide line + a dark tooltip (the only place a dark surface appears).
- Kanban drag: card at `opacity .6` and 2° tilt; a dashed `stroke-soft-200` drop placeholder.
- Map: selecting a field flies to its bounds over 400 ms; the raster cross-fades over 200 ms.
- Transitions 150 ms `ease-out`. Respect `prefers-reduced-motion`.

---

## 9. Gaps to resolve with the designer

| # | Gap |
|---|---|
| D1 | **No mobile or tablet artboards.** Everything is 1440 fixed. Below ~1280 the Fields split and the 4-across Home row have no defined behaviour. |
| D2 | **No dark mode.** AlignUI ships dark tokens and the CLI generates them, so the cost is mostly review, not build — but no dark artboards exist. |
| D3 | **No empty, loading, or error states** for any screen. A satellite refresh can fail (architecture NFR-8) and a new farm has zero fields; both need designs. |
| D4 | **Tasks List and Timeline tabs undesigned** (§5.5). |
| D5 | **Weather "See All" has no destination** (§5.6). |
| D6 | **No focus-visible treatment** anywhere. Needed for keyboard accessibility. |
| D7 | **Contrast**: `text-soft-400 #99a0ae` on white is **2.6:1** — below WCAG AA's 4.5:1 for body text. It is used for axis labels, units and coordinates. Either accept it for non-essential decoration only, or darken to `text-sub-600` where it carries meaning. |
| D8 | **Carbon Offset** needs a design pass or formal removal (§2.2). |
| D11 | **Home's KPI row** — two of three tiles have no data source. The proposed re-sourcing (§5.1, architecture §4.4) needs sign-off, including a new icon and label for the middle tile. |
| D12 | **The sidebar at four entries** has more bottom whitespace than designed. **Answered the cheap way for now** (`TASK-design-system-shell`, 2026-08-15): the nav block stays top-aligned and Settings/Support stay bottom-pinned, exactly as the five-entry design has them — noted here, not designed around. Confirm with the designer if a rebalanced layout is wanted. |
| D9 | `fancy/primary/default` still blue in Figma (§2.3). |
| D10 | "Rain Chanse" typo (§5.6); "Pendent Tasks" should be "Pending Tasks"; "Specie Planted" should be "Species Planted"; "Energy Fonts" is likely a mistranslation of "Energy Sources" (*fontes*, PT). |
| D13 | **No auth screens exist.** Login, forgot-password, and invite-acceptance are all undesigned — the screen inventory (§2) has none. `TASK-auth-tenancy` shipped a functional, unstyled login page (Tailwind only, no AlignUI) to prove the cookie flow. `TASK-design-system-shell` (2026-08-15) restyled it to AlignUI tokens (`Input`/`Label`/`Hint`/`Button` inside a `Card`) — same flow, same fetch, still not a *designed* screen. This gap closes only once login/forgot-password/invite-acceptance get real artboards. |
| D15 | **The field card's `Soil Moisture` and `Carbon Ton Potential` metrics have no data source anywhere in the architecture** (`TASK-domain-schema`, 2026-08-15). Soil moisture is plausibly Open-Meteo's soil-moisture parameters at the field centroid (Phase 5) or an NDWI observation (Phase 2); carbon-ton potential has no candidate at all and may be a leftover of the carbon-credit template (§2.2 / architecture §4.3) already identified. **Layout resolved 2026-08-16 (`TASK-fields` §1.1, §3.3), the data question stays open:** the card keeps all four metric slots (removing two would change the designed proportions) and renders `—` with a `title="No data source yet"` in the two unsourced ones — `components/flora/field-card.tsx`. Nothing invented, nothing silently dropped. This gap closes only once a real data source is decided for one or both. |
| D14 | ~~Does Fields default to the collapsed sidebar rail?~~ — **RESOLVED 2026-08-16 (`TASK-fields` §1.1): no.** No route override was added — `AppSidebar`'s `collapsed` stays a plain user toggle persisted in the `flora_sidebar` cookie, unchanged from `TASK-design-system-shell`. The three Fields artboards showing it collapsed was the designer's framing, not a rule; `apps/web/e2e/fields.spec.ts` runs against whatever the toggle's current state is, not a forced default. Revisit only if a real designer confirms collapsed-by-default is wanted. |
| D16 | **The field editor (Add/Edit Field) has no artboard.** Name, boundary drawing, species (with inline "add species"), planted/expected-harvest dates, status, quantity, and delete-confirmation are all undesigned. Built 2026-08-16 (`TASK-fields` §2.8) from AlignUI primitives (`Input`, `Select`, `Modal`, `Label`, `Hint`) and the §4.5 card anatomy — `components/flora/field-editor.tsx`. |
| D17 | **Sort and Filter have no menus.** `1:35172` shows the collapsed toolbar controls only, no open state. Built 2026-08-16 (`TASK-fields` §2.7) as compact `Select` triggers — `Name A–Z` / `Name Z–A` / `Newest` / `Manual` for sort, crop species for filter — `apps/web/app/(app)/fields/fields-toolbar.tsx`. |
| D18 | **No import flow is designed.** `File Upload Cards [1.0]` exists as a PRO block reference (§6.2) but the preview table and its per-row verdicts are not drawn. Built 2026-08-16 (`TASK-fields` §2.9) as `ImportCard` — `components/flora/import-card.tsx` — GeoJSON only; KML/Shapefile wait on architecture §11.5's parser `[VERIFY]`. |

---

## 10. Acceptance criteria

A screen is done when:

1. It renders at 1440×900 within **2% pixel delta** of its Figma export (architecture NFR-9).
2. Every colour comes from an AlignUI token class — a review greps the diff for raw hex and
   finds none outside `globals.css`, the chart config module, and `components/map/config.ts`
   (added by `TASK-fields` §3.4: Mapbox paint properties can't take a CSS class or resolve
   `var(--color-*)`, so its literal colours are the token values, converted from `oklch()` by
   hand and checked against the Figma render).
3. Every icon is a `@remixicon/react` import matching the Figma layer name.
4. Every AlignUI base component in `components/ui/` is byte-identical to the docs source
   except for documented bug fixes.
5. Keyboard: every interactive element is reachable and has a visible focus ring (pending D6).
6. No layout shift on data load — skeletons occupy the final dimensions.
