# TASK-fields — Fields & Crops: the first real screen

> **Phase:** 1 (architecture §16) · **Status:** complete · **Date:** 2026-08-15, landed 2026-08-16
> **Depends on:** `TASK-domain-schema` (complete, `00aa097`) — `fields`, `crops`, `crop_cycles`,
> `tasks`, `packages/db/src/queries/fields.ts`, `packages/contracts`'s enums + `units.ts`;
> `TASK-design-system-shell` (complete, `6ac33d1`) — `AppSidebar`, `PageHeader`, `Card`,
> `IconTile`, the token chain, the Playwright visual harness
> **Blocks:** `TASK-crop-stress` (Phase 2) — there is nothing to detect stress on until a
> farmer can register a field
> **Screen:** Fields — list — `1:35172` (file `hY3Nd3BBbJsjpihPnfZgpd`)
> **References:** [`../architecture.md`](../architecture.md) §5.3, §8.1, §8.2, §8.3, §9.1, §9.2,
> §9.5, §9.6, §11.2, §11.5, §15, §16 · [`../design-spec.md`](../design-spec.md) §4.4, §4.5,
> §5.2, §6.3, §9, §10

The first task that ships a screen a farmer can use. It is also the first task that has to
resolve the accumulated debt the specs have been deferring to it by name: design-spec §9's
**D14** (does Fields default to the collapsed rail) and **D15** (two of the field card's four
metrics have no data source), `TASK-domain-schema` §7's open note on activity tags, and
design-spec §5.2's `[VERIFY]` on whether the isometric map is renderable.

---

## 1. Current scenario

`HEAD` is `00aa097`. Phase 0 is complete and **no screen exists**.

**What exists and is directly reusable:**

| Where | What |
|---|---|
| `packages/db/src/schema/field.ts` | `fields` (boundary `geography(MultiPolygon,4326)`, `position numeric`, GIST index, `last_refresh_*`), `crop_cycles` (partial unique index — at most one `growing` cycle per field) |
| `packages/db/src/schema/crop.ts` | `crops`, tenant-scoped, `(organization_id, slug)` unique |
| `packages/db/src/queries/fields.ts` | `insertField`, `getField`, `listFieldsInBbox`, `explainListFieldsInBbox`, `updateFieldBoundary` — the `ST_GeomFromGeoJSON` write / `ST_AsGeoJSON(...)::json` read pattern, proven by 21 integration tests against real PostGIS |
| `packages/contracts` | `geojson.ts` (`multiPolygonSchema`, `pointSchema`), `enums.ts` (`cropCycleStatus`, `taskActivity`, …), `units.ts` (`formatAcres`, `formatTonnes`) |
| `apps/api/src/tenancy/` | `TenantInterceptor` + `@TenantTx()` — a controller gets an already-`withOrganization`-scoped `Tx` and never touches `@flora/db` directly |
| `apps/api/src/common/problem.filter.ts` | RFC 9457 `application/problem+json`, incl. `ZodValidationException` |
| `apps/web/components/flora/` | `AppSidebar`, `PageHeader` (slot-based), `Card` + `CardHeader`, `IconTile`, `UserMenu` |
| `apps/web/components/ui/` | 13 vendored AlignUI files + shadcn `chart.tsx`, tracked in `SOURCES.md` |
| `apps/web/e2e/` | `auth.setup.ts` (one login, shared `storageState`), `shell.spec.ts`, `playwright.config.ts` at 1440×900 / `maxDiffPixelRatio 0.02`, baselines fetched from Figma via the MCP `get_screenshot` |
| `packages/db/src/seed-demo.ts` | three fields around `-59.1328, -4.5831` with a `growing` cycle and one task each |

**What does not exist:** any `/fields` route, any `FieldCard`, any map, any TanStack Query,
any Mapbox dependency, any endpoint beyond `auth/*`, `/me` and `/health`. `apps/web/app/(app)/page.tsx`
still renders the one-line session sentence. `NEXT_PUBLIC_MAPBOX_TOKEN` is declared in
`packages/config/src/env.ts` (required, `min(1)`) and blank in `.env.example` — nothing reads it yet.

### 1.1 What the design asks for that has no source, and what this task does about it

Four items, each already filed. They are listed here because **a screen task cannot defer them
a second time** — the card renders or it does not.

| Item | Resolution taken by this task |
|---|---|
| **D15** — `Soil Moisture` and `Carbon Ton Potential` have no data source anywhere in the architecture | The 2×2 metric grid keeps all four slots (the card's proportions are load-bearing for §5.2's layout) and renders an em-dash `—` in the two unsourced ones, with a `title` reading "No data source yet". **Nothing is invented and nothing is silently dropped.** D15 stays open; closing it is a data decision, not a layout one. §7 asks for confirmation. |
| **D14** — does Fields default to the collapsed rail? | **No route override.** `AppSidebar`'s `collapsed` stays a user toggle persisted in the `flora_sidebar` cookie, exactly as `TASK-design-system-shell` built it. The Figma showing the rail collapsed on all three Fields artboards is treated as the artist's framing, not a rule. The visual test sets the cookie to `collapsed` so the baseline comparison is apples-to-apples. One-line to reverse if the designer says otherwise. |
| Activity tags (`TASK-domain-schema` §7) | Derived from **distinct `tasks.activity` among the field's non-`done` tasks**, ordered by the enum's declaration order for stability. Empty until a farmer creates tasks — which is correct, not a bug. `seed:demo` already writes one task per field, so the row is non-empty in the demo. |
| design-spec §5.2's isometric-map `[VERIFY]` | **Resolved: the isometric plot render is an illustration, not a map style.** Implemented as a top-down Mapbox satellite basemap (`pitch: 0`) carrying the same white boundaries and label pills. §6.14 records the pixel-diff consequence; design-spec §5.2 gets the resolution written into it. |

---

## 2. Planned changes

### 2.1 Scope rule — what "Fields & Crops" means for this task

Architecture §16 Phase 1 reads: *Field CRUD, PostGIS boundaries, import, crop cycles,
growth/species/quantity, Mapbox list + map*. All of it ships **except the non-GeoJSON half of
import**:

- **In:** field list + map (`1:35172`), create/read/update/delete, boundary drawing and editing,
  the current crop cycle (species, dates, status, quantity, derived growth), search, sort,
  filter, **GeoJSON import with a preview-then-commit step**.
- **Out:** KML and zipped Shapefile import. Architecture §11.5 carries an unresolved
  `[VERIFY]` on a maintained TypeScript Shapefile parser, and §11.5's "runs as a job" wants
  BullMQ, which does not exist until Phase 2. GeoJSON needs neither — it is `JSON.parse` plus a
  zod schema we already own — so the Import button ships **live**, not disabled, and the format
  list grows in `TASK-fields-import` (§9) once the parser question is answered.

Everything else on the Fields *nav section* — Crop Stress (`18:6567`) and Management
(`15:8608`) — is Phase 2 and Phase 6. §5 enumerates the boundary.

### 2.2 `packages/contracts` — the API shapes

New files, all re-exported from `index.ts` (invariant 4: these are the only definitions of
these shapes anywhere).

**`src/pagination.ts`**
```ts
export const cursorSchema = z.string().min(1).max(512);
export function pageSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item), nextCursor: cursorSchema.nullable() });
}
```
Cursor pagination, never offset (architecture §8.1). The cursor is an opaque base64 of
`${sortValue} ${id}`; the client never parses it.

**`src/farm.ts`** — `farmSchema` (`id`, `name`, `location: pointSchema`, `timezone`).

**`src/crop.ts`** — `cropSchema` (`id`, `name`, `slug`), `createCropSchema`.

**`src/crop-cycle.ts`**
```ts
export const cropCycleSchema = z.object({
  id: z.uuid(),
  cropId: z.uuid(),
  cropName: z.string(),
  plantedOn: z.iso.date(),
  expectedHarvestOn: z.iso.date(),
  status: cropCycleStatusSchema,
  quantityKg: z.number().nonnegative().nullable(),
  growthPct: z.number().int().min(0).max(100),   // derived, never stored (Q10)
});
export const createCropCycleSchema = cropCycleSchema
  .omit({ id: true, cropName: true, growthPct: true })
  .refine(c => c.expectedHarvestOn >= c.plantedOn, { path: ["expectedHarvestOn"], message: "…" });
```

**`src/field.ts`**
```ts
export const fieldSchema = z.object({
  id: z.uuid(),
  farmId: z.uuid(),
  name: z.string().min(1).max(120),
  boundary: multiPolygonSchema,
  areaM2: z.number().positive(),          // derived server-side, never accepted on write
  centroid: pointSchema,                   // derived server-side
  position: z.number(),
  lastRefreshSucceededAt: z.iso.datetime().nullable(),
  lastRefreshError: z.string().nullable(),
});

/** What the list panel and the field card render. No `boundary` — the map gets geometry
 *  from `/fields/geojson` (§2.4), so the list stays light at 200 fields. */
export const fieldSummarySchema = fieldSchema.omit({ boundary: true }).extend({
  cropCycle: cropCycleSchema.nullable(),
  activities: z.array(taskActivitySchema),
});

export const createFieldSchema = z.object({
  farmId: z.uuid(),
  name: z.string().min(1).max(120),
  boundary: multiPolygonSchema,
  cropCycle: createCropCycleSchema.optional(),
});
export const updateFieldSchema = createFieldSchema.partial().omit({ farmId: true });

export const fieldSortValues = ["position", "name", "-name", "newest"] as const;
export const listFieldsQuerySchema = z.object({
  farmId: z.uuid().optional(),
  q: z.string().max(120).optional(),
  cropId: z.uuid().optional(),
  sort: z.enum(fieldSortValues).default("position"),
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});
```

`multiPolygonSchema` gains a **vertex ceiling** — `.superRefine` rejecting a geometry with more
than **10 000 positions total**. A 40 MB self-intersecting blob should fail in zod, not in
PostGIS after a transaction is open. That is a change to an existing shared schema; it is
additive and no current caller comes close.

`fieldSchema`'s comment in architecture §8.2 already carries the corrected `areaM2` shape — this
is that schema, written for the first time.

### 2.3 `packages/db` — queries and two indexes

**`src/queries/fields.ts`** (extended — the five existing functions stay as they are):

- `listFields(tx, orgId, params) → { items: FieldSummaryRow[]; nextCursor }`. One statement:
  `fields` **LEFT JOIN LATERAL** the `growing` crop cycle (the partial unique index guarantees
  ≤ 1) **LEFT JOIN LATERAL** the distinct non-`done` `tasks.activity` array, plus `ST_Area` and
  `ST_AsGeoJSON(ST_Centroid(...))`. Keyset predicate as a row-value comparison —
  `(f.position, f.id) > (:cursorPos, :cursorId)` — so the composite index is usable and ties on
  `position` cannot drop or duplicate a row across pages.
- `getFieldWithCycle(tx, orgId, id)` — the same projection plus `boundary`, for the editor.
- `listFieldGeometries(tx, orgId, bbox?)` — the map source. `ST_AsGeoJSON` per row assembled
  into a `FeatureCollection` of `{ id, name, centroid, areaM2 }`; when `bbox` is given it reuses
  the `&& ST_MakeEnvelope(...)` predicate `explainListFieldsInBbox` already proves hits
  `fields_boundary_gist`.
- `updateField(tx, orgId, id, { name?, boundary? })`, `deleteField(tx, orgId, id)`,
  `nextFieldPosition(tx, orgId, farmId)` (`max(position) + 1`).
- `assertValidBoundary` — a guard run **inside the same transaction, before the write**:
  `ST_IsValid(g)` false → throw with `ST_IsValidReason(g)` in the message. Invalid geometry is
  rejected, never silently `ST_MakeValid`-ed: a self-intersecting boundary is a drawing mistake
  the farmer needs to see, and quietly repairing it changes their acreage.

**Growth is derived, in SQL** (architecture §17 Q10, resolved *derived*), against the **farm's**
local date — `farms.timezone` exists precisely so a date boundary is not the server's opinion:

```sql
CASE
  WHEN cc.expected_harvest_on <= cc.planted_on THEN 100
  ELSE LEAST(100, GREATEST(0, ROUND(
    ((now() AT TIME ZONE fa.timezone)::date - cc.planted_on)::numeric * 100
      / (cc.expected_harvest_on - cc.planted_on)::numeric)))
END AS growth_pct
```

**`src/queries/crops.ts`** — `listCrops`, `insertCrop` (slug from name, `citext` unique per org).
**`src/queries/crop-cycles.ts`** — `insertCropCycle`, `updateCropCycle`, `listCropCyclesForField`.
`insertCropCycle` maps Postgres `23505` on `crop_cycles_one_growing_per_field` to a typed
`OneGrowingCycleError` so the API can return **409**, not a 500.
**`src/queries/farms.ts`** — `listFarms`.

**`migrations/0006_field_list_indexes.sql`** (generated by `drizzle-kit generate`, reviewed by
hand per CLAUDE.md §2.1):

```sql
CREATE INDEX fields_org_position_id_idx ON fields (organization_id, position, id);
CREATE INDEX fields_org_name_id_idx     ON fields (organization_id, name, id);
```

No trigram index for `q`. `ILIKE '%…%'` seq-scans a per-tenant slice of a table whose realistic
size is tens to low hundreds of rows; `pg_trgm` is an extension and an index to maintain for a
problem nobody has. Recorded here so the omission is a decision, not an oversight.

Both new query modules are exported from `src/index.ts`.

### 2.4 `apps/api` — the endpoints

New `FieldsModule` (`apps/api/src/fields/`) with `fields.controller.ts`, `fields.service.ts`,
`crops.controller.ts`, `farms.controller.ts`, and `dto/` using `createZodDto()` over §2.2's
schemas. Registered in `AppModule`. Every handler takes `@TenantTx() tx` — no controller imports
`@flora/db` beyond its types (`TASK-auth-tenancy` §6.13's grep still has to pass).

```
GET    /api/v1/farms                              → Farm[]
GET    /api/v1/crops                              → Crop[]
POST   /api/v1/crops                              → Crop            (the "add a species" path in the editor)

GET    /api/v1/fields          ?farmId&q&cropId&sort&cursor&limit   → Page<FieldSummary>
GET    /api/v1/fields/geojson  ?farmId&bbox                         → FeatureCollection
POST   /api/v1/fields                             → Field           (201)
GET    /api/v1/fields/:id                         → Field & { cropCycle }
PATCH  /api/v1/fields/:id                         → Field
DELETE /api/v1/fields/:id                         → 204
POST   /api/v1/fields/import/preview              → ImportPreview    (§2.9)
POST   /api/v1/fields/import/commit               → { created: n }

POST   /api/v1/fields/:id/crop-cycles             → CropCycle       (201 / 409)
PATCH  /api/v1/crop-cycles/:id                    → CropCycle
```

Three of these are **not** in architecture §8.3: `GET /crops`, `POST /crops`, the crop-cycle pair,
and the `geojson` + split-import routes. §8.3 predates the Phase-1 detail; this task adds them
there rather than shipping an endpoint the spec does not know about (§8 of this doc).

Rules that hold for every one of them:

- `organizationId` is never a parameter — it comes from the token (architecture §8.1).
- A foreign-org id returns **404, not 403** (NFR-7). The repository filter returns no row and
  the service throws `NotFoundException`; RLS is the backstop, not the mechanism.
- Errors are `application/problem+json` via the existing filter. `409` for a second growing
  cycle, `422` for invalid geometry with `ST_IsValidReason` in `detail`.
- `POST /fields` accepts **no** `areaM2` and **no** `centroid` — invariant 3. `createFieldSchema`
  does not declare them, so `ZodValidationPipe` strips-or-rejects them before the service runs.

`GET /fields/geojson` deliberately returns geometry the list omits, so the panel's page size and
the map's viewport are independent concerns — paging the list must not blank polygons off the map.

### 2.5 `apps/web` — vendored components and dependencies

Five more AlignUI base components pasted **byte-identical** from `alignui.com/docs/v1.2/ui/*`
into `components/ui/`, each appended to `SOURCES.md` with its sha256 (invariant 8):

`progress-bar` (the Growth row) · `kbd` (the `⌘1` search hint) · `select` (crop species, sort) ·
`modal` (the field editor) · `file-upload` (import). **Landed:** the real Figma card
(`2158:18884` et al.) names its activity chips `Badge [1.0]`, not `Tag [1.0]` as guessed here —
`ActivityTag` is built on the already-vendored `Badge`'s `variant="lighter"` colour combos, so
`tag` was never vendored.

**Not vendored:** `Datepicker`. The two dates in the editor are `<input type="date">` inside
AlignUI's `Input.Root`, because `Datepicker` pulls `react-day-picker` in for a screen that has no
artboard. `TASK-crop-stress` vendors it for `18:6567`'s real date picker, against a design.

New dependencies:

| Package | Why |
|---|---|
| `mapbox-gl`, `react-map-gl` | architecture §9.6. **Resolved:** `react-map-gl@8.1.2` has no root export — confirmed against the installed package's own `.d.ts` (`dist/mapbox.d.ts` re-exports `@vis.gl/react-mapbox`) — import from `react-map-gl/mapbox`. |
| `@mapbox/mapbox-gl-draw` (+ `@types/mapbox__mapbox-gl-draw`) | boundary drawing/editing; wrapped in a `useControl` component |
| `@turf/area`, `@turf/bbox` (+ `@types/geojson`) | client-side area preview while drawing, camera fitting. Never hand-rolled (CLAUDE.md §2.1). Sub-packages, not the `@turf/turf` bundle. **`@turf/centroid` planned but not installed** — centroid is always PostGIS-derived (invariant 3) and returned by the API; nothing client-side ever computes one |
| `@tanstack/react-query` | architecture §9.2 — mutations, optimistic updates, infinite scroll. First use is here |
| `@radix-ui/react-dialog`, `@radix-ui/react-select`, `@radix-ui/react-scroll-area` | peers of the vendored `modal`/`select` (`select.tsx`'s scroll viewport needs the third) |
| `zod` | direct dependency, not just transitively through `@flora/contracts` — `lib/api-client.ts` types its generic fetch helper against `ZodType<T>` |

### 2.6 The map — `components/map/`

| File | What |
|---|---|
| `config.ts` | The map palette. **See §3.4 — this needs an invariant amended.** |
| `field-map.tsx` | `"use client"`. `react-map-gl` `<Map>` on `mapbox://styles/mapbox/satellite-streets-v12`, `pitch: 0`, camera fitted to the fields' bbox via `@turf/bbox`. One GeoJSON source with `fill` + `line` layers; selected field styled off a feature-state, not a second source |
| `field-label-layer.tsx` | The label pills — a `symbol` layer with `text-halo-width`, per architecture §9.6 |
| `draw-control.tsx` | `mapbox-gl-draw` behind `useControl`; emits a `MultiPolygon` (a drawn `Polygon` is wrapped to one part) and a live `@turf/area` readout |
| `map-placeholder.tsx` | What renders when `NEXT_PUBLIC_MAPBOX_TOKEN` is absent: a neutral `bg-bg-weak-50` panel with a one-line explanation. Design-spec §9 **D3** says no error states are designed; a blank tile grid or a thrown exception is worse than an honest panel |

`mapbox-gl/dist/mapbox-gl.css` and `@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css` are imported
from `field-map.tsx`, not from `globals.css` — they must not sit ahead of the AlignUI token
cascade design-spec §7.1 spent a task getting right.

Rasters, the colour-ramp legend and the measure tool are **Phase 2** — `RasterOverlay`,
`ColorRampLegend` and `MapToolbar` are not built here (design-spec §6.3 lists them under Crop
Stress's needs).

### 2.7 The screen — `app/(app)/fields/page.tsx`

A Server Component. Reads `searchParams` (`q`, `sort`, `cropId`, `field`), calls the API
server-side with the request's cookies (the `lib/session.ts` pattern, generalised into
`lib/api-client.ts`), and renders:

```
PageHeader  [IconTile 40px] "Fields"          [Import] [+ Add Field]      88px, full width
├─ FieldListPanel   715px, own scroll         ─┐
│   Toolbar: Search (⌘1 Kbd) · Filter · Sort   │  design-spec §4.4:
│   2-up grid of FieldCard                     │  panel 80→795, map 795→1440,
└─ FieldMap         flex-1, flush right+bottom─┘  no border, no radius
```

`FieldCard` (`components/flora/field-card.tsx`) follows design-spec §5.2 exactly: `Title/H5`
name · `ActivityTag` row · a Growth row (icon + label + right-aligned `%`) over a full-width
`ProgressBar` · the 2×2 metric grid (Species Planted, Crops Quantity, **Soil Moisture —**,
**Carbon Ton Potential —**) with `Label/X Small` over `Label/Medium` · a footer with the centroid
formatted `4.5831° S / 59.1328° W` in `Paragraph/X Small` and a primary **View Details** button.
Selected card carries a `border-primary-base` ring.

Selection lives in the URL (`?field=<id>`) so it survives reload and is shareable, and so the
map does not remount — the same reasoning architecture §9.1 applies to `?view=`.

**View Details** opens the field editor (§2.8). It does **not** navigate: `/fields/[fieldId]/stress`
is `TASK-crop-stress`'s route and does not exist, and inventing a detail screen with no artboard
is inventing design. Re-pointing it is a one-line change in Phase 2, noted in §9.

Acres and tonnes come from `packages/contracts`'s `formatAcres` / `formatTonnes` — no component
divides by 4046 (architecture §5.3).

`lastRefreshSucceededAt` is carried in the payload and **rendered nowhere**: nothing refreshes
until Phase 2, so a stale badge here would be a badge on an empty pipeline. **NFR-8 is not
claimed by this task**; `TASK-crop-stress` owns it.

Client boundaries (`"use client"`, architecture §9.2): the map, the toolbar's controlled inputs,
the editor modal, and the `useInfiniteQuery` list body. The page shell, the header and the first
page of cards render on the server.

### 2.8 Create and edit — `components/flora/field-editor.tsx`

One modal, three ways in: **+ Add Field**, **View Details**, and double-clicking a polygon.

Name · Farm (a `Select`; auto-selected and hidden when the org has exactly one farm) · boundary
(drawn or edited on the map, with a live acreage readout from `@turf/area`) · and the current
crop cycle: species `Select` (with an inline "add species" that `POST`s `/crops`), planted and
expected-harvest dates, status, optional quantity in **kg** with the tonnes equivalent shown
beside it. Delete sits behind a confirm that names what cascades.

Validation is `createFieldSchema` — the same zod object the API validates with (invariant 4). A
409 from the growing-cycle constraint renders as an AlignUI `Hint` under the status field, not a
toast: it is a field-level conflict with a specific fix.

**This screen has no artboard.** It is composed from AlignUI primitives and the §4.5 card
anatomy, and filed as a new design gap (§7).

### 2.9 Import — GeoJSON, preview then commit

`ImportCard` (design-spec §6.2: `File Upload` + `Progress Bar` + `Compact Button`) takes a
`.geojson`/`.json` file, `POST`s it to `/fields/import/preview`, and renders the parsed result as
a table — one row per feature with its proposed name, computed acreage, and a per-row validity
verdict (`ST_IsValid`, coordinate range, duplicate name against existing fields). Rows can be
deselected. **Commit** posts the accepted subset.

Nothing is written before commit. Architecture §11.5's rule — *silently importing 400
misprojected polygons is worse than failing* — is the entire reason for the two-step, and it is
what makes the synchronous version acceptable without a queue: the expensive, irreversible half
is behind an explicit confirmation.

Name resolution: `properties.name ?? properties.Name ?? properties.NAME`, else
`Imported field <n>`. Non-polygon geometries are listed and skipped, never coerced.

### 2.10 The shell has to stop constraining width

`app/(app)/layout.tsx` currently wraps children in `max-w-[1110px] px-8`. The Fields map is
full-bleed to the right and bottom edges (design-spec §4.4) and cannot live inside that.

Change: the layout renders `<main className="flex min-w-0 flex-1 flex-col overflow-hidden">`;
the 1110 px centering moves into a new `components/flora/page-container.tsx`, which `app/(app)/page.tsx`
adopts. Home, Tasks and Weather use it later; Fields does not. Fluid + `max-width`, never a
fixed width — architecture §9.5's retrofit obligation, unchanged.

`shell.spec.ts` asserts on `aside` and on the "Logged in as" text, both untouched; it must keep
passing without edits (§6.17).

### 2.11 Data fetching

`lib/api-client.ts` — a thin server-side fetch that forwards cookies and parses through the
contract schema (`lib/session.ts` generalised). `lib/query-client.tsx` — the TanStack provider,
mounted in `(app)/layout.tsx`.

The server renders page 1; the client's `useInfiniteQuery` is seeded from it via `initialData`
and fetches subsequent pages on scroll. Mutations invalidate the field list and the geojson
source. Create/update apply optimistically **only** for `name` — geometry round-trips through
PostGIS for its authoritative `areaM2` and `centroid`, and guessing them client-side would show
a number that changes when the response lands.

### 2.12 Seeds

`seed-demo.ts` is rewritten to **match `1:35172`'s cards** so the visual diff is a real
comparison rather than a diff of unrelated copy: the field names, crop species, quantities and
growth percentages are read off the Figma via the MCP (`get_design_context` on `1:35172`, file
`hY3Nd3BBbJsjpihPnfZgpd`) and reproduced. Because growth is derived, `planted_on` and
`expected_harvest_on` are computed **relative to the run date** so each field's growth lands on
the designed percentage on the day the seed runs. Idempotence is preserved.

New `packages/db/src/seed-bulk.ts` + `pnpm db:seed:bulk` — 200 non-overlapping fields on a grid,
for NFR-11 (§6.15) and for exercising cursor pagination past one page.

---

## 3. Why

### 3.1 Why the list omits geometry and the map has its own endpoint

The panel is cursor-paginated (architecture §8.1) and the map is viewport-driven. Serving both
from one payload forces a choice between paging the map's polygons — fields vanishing as you
scroll a list — and abandoning pagination. Two endpoints over the same table, one of which reuses
the GIST predicate already proven to hit `fields_boundary_gist`, costs one extra request on first
paint and keeps both behaviours correct.

### 3.2 Why growth is computed in the farm's timezone

`farms.timezone` was added in `TASK-domain-schema` because the daily refresh schedules at
"03:00 farm-local". A percentage that ticks over at UTC midnight for a farm in Amazonas is the
same class of bug, just quieter — and it is one `AT TIME ZONE` to avoid.

### 3.3 Why the two unsourced metrics render `—` rather than being removed

Removing them changes the card's designed proportions and makes the eventual data decision a
layout change instead of a value change. Filling them with a plausible number would be inventing
a data source, which CLAUDE.md forbids outright. An em-dash is the only honest rendering, and it
makes the gap visible to whoever opens the screen — which is what D15 needs.

### 3.4 One invariant needs amending — say yes or say no before code

Invariant 7 currently reads: *the only files holding colour values are `app/globals.css` and
`components/charts/config.ts`*. Mapbox layer paint properties are JSON values, not classes, and
must be given literal colours. Two options were weighed:

1. **Read the tokens at runtime** via `getComputedStyle(document.documentElement)`. The tokens are
   `oklch()`, and `[VERIFY: whether mapbox-gl's colour parser accepts `oklch()` — if not, this
   path needs a conversion step and is dead]`. It also puts a layout read on every style change.
2. **`components/map/config.ts`** — a second sanctioned colour module, exactly mirroring the
   `components/charts/config.ts` precedent that already exists for the same reason (Recharts also
   cannot take a class).

**Recommendation: option 2**, which makes this a two-word edit to invariant 7 in `CLAUDE.md` and
to design-spec §10. It is a spec change, so it is called out here rather than done quietly. §7
asks for the decision.

### 3.5 Why GeoJSON import ships now and the other two formats do not

The preview-then-commit step architecture §11.5 demands is what makes import safe, and it is
independent of the parser. GeoJSON needs no parser at all — `JSON.parse` and a schema this repo
already owns. Shipping it now means the Import button is real, the preview UI exists and is
tested, and `TASK-fields-import` becomes "add two parsers behind an existing flow" rather than
"design import". Shipping a disabled button instead would be a worse screen for the same
information.

---

## 4. Affected files

### `packages/contracts`

| Path | Change | Notes |
|---|---|---|
| `src/pagination.ts` | new | `cursorSchema`, `pageSchema()` |
| `src/farm.ts` | new | `farmSchema` |
| `src/crop.ts` | new | `cropSchema`, `createCropSchema` |
| `src/crop-cycle.ts` | new | `cropCycleSchema` (incl. derived `growthPct`), `createCropCycleSchema` |
| `src/field.ts` | new | `fieldSchema` (architecture §8.2's corrected shape), `fieldSummarySchema`, create/update, `listFieldsQuerySchema` |
| `src/import.ts` | new | `importPreviewSchema`, `importCommitSchema` |
| `src/geojson.ts` | edit | vertex ceiling on `multiPolygonSchema` |
| `src/index.ts` | edit | re-export the new modules |
| `src/field.spec.ts`, `src/crop-cycle.spec.ts` | new | schema unit tests |

### `packages/db`

| Path | Change | Notes |
|---|---|---|
| `src/queries/fields.ts` | edit | `listFields`, `getFieldWithCycle`, `listFieldGeometries`, `updateField`, `deleteField`, `nextFieldPosition`, `assertValidBoundary` |
| `src/queries/crops.ts` | new | `listCrops`, `insertCrop` |
| `src/queries/crop-cycles.ts` | new | + `OneGrowingCycleError` mapped from `23505` |
| `src/queries/farms.ts` | new | `listFarms` |
| `migrations/0006_field_list_indexes.sql` | new | two composite indexes, generated then hand-reviewed |
| `src/seed-demo.ts` | edit | matched to `1:35172`; growth dates relative to run date |
| `src/seed-bulk.ts` | new | 200 fields for NFR-11 |
| `src/index.ts`, `package.json` | edit | exports; `seed:bulk` script |
| `src/queries/fields.spec.ts` | edit | pagination, search, sort, growth, validity |
| `src/queries/crop-cycles.spec.ts` | new | one-growing-cycle, status transitions |

### `apps/api`

| Path | Change | Notes |
|---|---|---|
| `src/fields/fields.module.ts` · `fields.controller.ts` · `fields.service.ts` | new | field CRUD, geojson, import |
| `src/fields/crops.controller.ts` · `farms.controller.ts` · `crop-cycles.controller.ts` | new | |
| `src/fields/dto/*.ts` | new | `createZodDto()` over `packages/contracts` |
| `src/fields/import.service.ts` | new | preview + commit |
| `src/app.module.ts` | edit | register `FieldsModule` |
| `test/fields.e2e.spec.ts` · `test/crop-cycles.e2e.spec.ts` · `test/import.e2e.spec.ts` | new | |
| `test/tenancy.e2e.spec.ts` | edit | every new endpoint added to the 404 sweep (NFR-7) |

### `apps/web`

| Path | Change | Notes |
|---|---|---|
| `components/ui/{progress-bar,kbd,select,modal,file-upload}.tsx` | new | vendored verbatim (`tag` not needed — see §2.5) |
| `components/ui/SOURCES.md` | edit | five rows + sha256 |
| `app/(app)/fields/page.tsx` | new | the screen (server) |
| `app/(app)/fields/field-list-panel.tsx` · `fields-toolbar.tsx` | new | the client screen body (§2.7's note: `PageHeader` folded in here too, not split out) |
| `components/flora/field-card.tsx` · `activity-tag.tsx` · `field-editor.tsx` · `import-card.tsx` · `page-container.tsx` | new | |
| `components/map/{config,field-map,field-label-layer,draw-control,map-placeholder}.tsx` | new | |
| `lib/api-client.ts` · `lib/api-client.server.ts` · `lib/query-client.tsx` | new | split client/server so `next/headers` never reaches a Client Component bundle |
| `app/(app)/layout.tsx` · `app/(app)/page.tsx` | edit | §2.10 |
| `e2e/fields.spec.ts` | new | functional coverage; visual-diff baseline is a follow-up, §10 |
| `playwright.config.ts` | edit | add `fields.spec.ts` to the chromium project |
| `package.json` | edit | the §2.5 dependencies |

### Docs

| Path | Change |
|---|---|
| `docs/architecture.md` | §8.3 (the seven new endpoints), §11.5 (GeoJSON now ships; KML/Shapefile still `[VERIFY]`), §16 (Phase 1 status), §17 (Q10 already resolved — add the implementing file) |
| `docs/design-spec.md` | §5.2 (isometric `[VERIFY]` resolved), §9 (D14 resolved-as-toggle, D15 rendered-as-`—`, new gaps for the undesigned editor and the undesigned Sort/Filter menus), §10 (invariant-7 amendment if §3.4 is accepted) |
| `CLAUDE.md` | status line, invariant 7 (if accepted) |
| `README.md` | status, and that a real `NEXT_PUBLIC_MAPBOX_TOKEN` is now needed to run the app |
| `.env.example` | comment on `NEXT_PUBLIC_MAPBOX_TOKEN` — required from this task on |

---

## 5. Explicitly out of scope

The phases overlap enough that an unstated boundary gets crossed. These are the boundaries:

1. **Crop Stress (`18:6567`) and everything satellite** — `packages/satellite`, BullMQ, R2,
   observations, stress zones, rasters, the colour-ramp legend, the measure tool, the assistant
   FAB. Phase 2, `TASK-crop-stress`. `RasterOverlay` and `MapToolbar` are not built here.
2. **Field Management (`15:8608`)** — zones, prescriptions, scenarios. Phase 6.
3. **Tasks (`24:11420`)** — this task *reads* `tasks.activity` for the tag row and writes no task.
4. **Home (`1:12913`)** — `app/(app)/page.tsx` keeps its session sentence, moved inside
   `PageContainer` and nothing more.
5. **KML and zipped Shapefile import** — §2.1, `TASK-fields-import`.
6. **NFR-8's stale badge** — §2.7. Nothing refreshes yet.
7. **Crop cycle *history*** — the editor manages the current cycle. Past cycles are stored
   (nothing deletes them) and displayed by no screen in v1.
8. **Field reordering by drag** — `position` exists and sorts; no drag UI. The design shows none.
9. **Mobile/tablet** — architecture §9.5, desktop-only, no breakpoints designed.
10. **Dark mode** (design-spec §9 D2) and **transactional email** (§17 Q9).

---

## 6. Verification

Measurable per CLAUDE.md — no criterion rests on "works". Integration tests run against real
testcontainers PostGIS; nothing mocks the database.

1. **Migration applies clean.** `pnpm infra:reset && pnpm db:migrate` applies `0000`–`0006` and
   exits 0; a second run is a no-op. Both new indexes appear in `pg_indexes`.
2. **Area and centroid are still derived.** `information_schema.columns` shows no `area*`,
   `acres`, `hectares` or `centroid` column on `fields`; `POST /fields` with `areaM2: 1` in the
   body returns **422** (or the key is stripped and the response's `areaM2` is the computed one —
   assert the computed value, not the submitted one).
3. **Growth is derived and clamped.** A cycle planted 30 days ago with a 100-day span returns
   `growthPct: 30`; `plantedOn` in the future returns `0`; past `expectedHarvestOn` returns
   `100`; `expectedHarvestOn == plantedOn` returns `100`, not a division error. A farm at
   `Pacific/Kiritimati` and one at `Pacific/Niue` straddling UTC midnight return values one day
   apart — proving the `AT TIME ZONE` is real.
4. **Cursor pagination is stable and total.** With 200 seeded fields (`db:seed:bulk`) and
   `limit=24`, walking `nextCursor` to exhaustion yields **exactly 200 distinct ids, no
   duplicates, no omissions**, under each of the four `sort` values — including with **50 fields
   sharing an identical `position`**, which is the case a naive `OFFSET` or a single-column
   keyset gets wrong.
5. **Search and filter.** `?q=` matches case-insensitively on a substring; `?cropId=` returns
   only fields whose growing cycle carries that crop; the two compose.
6. **The map endpoint uses the GIST index.** `EXPLAIN` on `listFieldGeometries` with a bbox
   contains `fields_boundary_gist` and no `Seq Scan`.
7. **Invalid geometry is rejected, not repaired.** A self-intersecting bow-tie polygon returns
   **422** with `ST_IsValidReason`'s text in `detail`, and **no row exists** afterwards. A
   geometry with 10 001 positions is rejected by zod before any SQL runs.
8. **One growing cycle per field.** A second `POST /fields/:id/crop-cycles` with
   `status: "growing"` returns **409** in `application/problem+json` — not 500, not 201.
9. **Cross-tenant returns 404 (NFR-7).** For org A's session, every one of `GET/PATCH/DELETE
   /fields/:id`, `GET /fields/:id`, `POST /fields/:id/crop-cycles`, `PATCH /crop-cycles/:id`
   against an org-B id returns **404**, and `GET /fields` never contains an org-B id. Zero 403s,
   zero 200s. This is an addition to the existing sweep, so the assertion is a **list of route
   names** the suite iterates — a new endpoint that forgets to join it fails the count check.
10. **Import writes nothing before commit.** Preview a 3-feature FeatureCollection containing one
    invalid polygon: the response marks 2 valid / 1 invalid and `SELECT count(*) FROM fields` is
    unchanged. Commit the 2 accepted rows: count increases by exactly 2, and the invalid feature
    is absent. A `LineString` feature is reported skipped, never coerced to a polygon.
11. **`packages/contracts` is the only source of these shapes.** `grep -rn "areaM2\|growthPct\|nextCursor" apps/` finds
    no hand-written interface or type alias declaring them — only imports from `@flora/contracts`.
12. **No SQL in `apps/`.** `grep -rn "sql\`\|ST_" apps/api/src apps/web` returns nothing
    (invariant 5).
13. **No raw hex outside the sanctioned files.** `grep -rnE "#[0-9a-fA-F]{3,8}\b" apps/web/{app,components}`
    matches only `app/globals.css`, `components/charts/config.ts` and — if §3.4 is accepted —
    `components/map/config.ts`. Vendored `components/ui/` files are exempt and unchanged
    (`sha256sum -c` against `SOURCES.md` passes for all 19).
14. **Visual diff vs Figma.** The **panel region** (x 80→795, 1440×900 viewport, sidebar cookie
    set to `collapsed`, `db:seed:demo` applied) against a `get_screenshot` export of `1:35172`
    at **≤ 2% pixel delta** (NFR-10). The map region is excluded and the reason recorded in
    design-spec §5.2: the Figma's isometric plot is an illustration with no renderable
    equivalent (§1.1). Follow `shell.spec.ts`'s precedent — if the measured floor exceeds 2%,
    **record the achieved number and raise the threshold explicitly in a comment**, never
    silently loosen it.
15. **NFR-11 — 60 fps panning with 200 polygons.** With `db:seed:bulk`, a scripted 3-second pan
    measures inter-frame intervals from Mapbox's `render` events: **median ≤ 20 ms** (50 fps) is
    the failing threshold — NFR-11's 60 fps is the target, 50 the floor that absorbs CI noise —
    and the achieved number is written into the test as a comment.
16. **Degrades without a Mapbox token.** With `NEXT_PUBLIC_MAPBOX_TOKEN` unset in the browser
    bundle, `/fields` renders the panel and cards normally and shows `MapPlaceholder`; the page
    throws no uncaught error (Playwright asserts a clean `pageerror` log).
17. **The shell is undisturbed.** `shell.spec.ts` passes **unmodified** after §2.10's layout
    change, including both sidebar baselines and the zero-CLS assertion.
18. **Empty state.** A fresh org (`db:seed` only, no demo) renders `/fields` with an empty-state
    card and a working **+ Add Field**, not a zero-card grid or a spinner that never resolves
    (design-spec §9 D3 — undesigned, so built plainly and flagged).
19. **Round trip through the UI.** Playwright: draw a polygon → name it → pick a species and
    dates → save; the new card appears with an acreage matching `turf.area` on the drawn GeoJSON
    to within **0.5%**, and a reload still shows it. Edit the boundary; the acreage changes.
    Delete it; it is gone from both the list and the map source.
20. **Keyboard and focus.** `⌘1` focuses the search input. Every interactive element on the
    screen — toolbar controls, each card's View Details, the modal's fields, its close — is
    reachable by Tab with a non-zero `outlineWidth` (design-spec §10.5, gap D6).
21. **The whole workspace is green.** `pnpm turbo lint typecheck test build` exits 0 from a clean
    `--force` run, and `pnpm --filter web test:e2e` passes with infra + api + seeds up.

---

## 7. Decisions this task needs before code

| # | Decision | Recommendation |
|---|---|---|
| 1 | **Invariant 7** — may `components/map/config.ts` hold colour values, as `components/charts/config.ts` already does? (§3.4) | **Yes.** Same reason, same precedent; Mapbox paint properties cannot take a class. Alternative is a runtime `oklch()` read that may not parse. |
| 2 | **D15** — is `—` in the two unsourced metric slots acceptable for now? (§1.1, §3.3) | **Yes**, and leave D15 open. The alternatives are inventing a number or changing the designed card. |
| 3 | **GeoJSON-only import in this task**, with KML/Shapefile in a follow-on? (§2.1, §3.5) | **Yes.** It keeps the Import button real without pre-empting §11.5's unresolved parser `[VERIFY]` or waiting on BullMQ. Say so if you would rather this task ship no import at all — the button then needs a decided treatment. |
| 4 | **View Details opens the editor** rather than navigating to a screen that does not exist? (§2.7) | **Yes**, re-pointed at `/fields/[fieldId]/stress` in Phase 2. |

New design gaps this task files in design-spec §9 (no answer needed to start):

- **D16 — the field editor has no artboard.** Add/Edit Field, the boundary-drawing mode, and the
  delete confirmation are all undesigned; built from AlignUI primitives and the §4.5 card anatomy.
- **D17 — Sort and Filter have no menus.** `1:35172` shows the collapsed controls only. Shipping
  `Name A–Z / Name Z–A / Newest / Manual` and a crop-species filter — all backed by real columns.
- **D18 — no import flow is designed.** `File Upload Cards [1.0]` exists as a PRO block reference
  (design-spec §6.2) but the preview table and its per-row verdicts are not drawn.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| **`react-map-gl`'s entrypoint/peer split** (§2.5) is the kind of thing that costs an afternoon at the wrong end of the task. | Resolve the `[VERIFY]` against its own docs **before** writing `field-map.tsx`, per CLAUDE.md §2.0. |
| **`mapbox-gl-draw` inside React 19 / Next 16** is an imperative control in a declarative tree; double-invocation in dev StrictMode is a known source of duplicate controls. | Wrap in `useControl` (react-map-gl's supported escape hatch) and assert in the e2e test that exactly one draw toolbar exists after a client navigation. |
| **The 2% visual threshold may be unreachable** even for the panel — the demo data can match the Figma's copy but not its photographic card imagery, if any. | §6.14 already prescribes the shell task's precedent: measure, record, raise deliberately with a comment. Do not silently widen. |
| **`0006`'s indexes are generated by drizzle-kit**, which produced two real bugs in `0004`. | Same discipline as `TASK-domain-schema`: read the generated SQL line by line, apply it to a live container, and `\d fields` before committing. |
| **Scope.** This is the largest task since `TASK-foundations` — contracts, queries, a migration, an API module, six vendored components, a map, a modal, an import flow and a visual baseline. | The §2 subsections are independently landable in this order: contracts → db + migration → API + e2e → vendored components → screen → map → editor → import. Import (§2.9) is the last section in and the only one that can be cut without leaving the screen incoherent. |
| **`NEXT_PUBLIC_MAPBOX_TOKEN` is already `min(1)`-required** by `packages/config`, so a blank `.env` fails API boot today. | Unchanged by this task, but `.env.example` and the README now say so plainly, and §6.16 proves the browser degrades rather than crashing. |

---

## 9. Follow-on tasks

| Task | What it picks up |
|---|---|
| `TASK-crop-stress` (Phase 2) | `packages/satellite`, BullMQ, R2, observations, stress zones, `18:6567`; **inherits** this task's map, adding `RasterOverlay`, `ColorRampLegend` and `MapToolbar`; re-points **View Details** at `/fields/[fieldId]/stress`; owns NFR-8's stale badge; vendors `Datepicker` |
| `TASK-fields-import` | KML and zipped Shapefile behind the preview-then-commit flow this task builds, once architecture §11.5's parser `[VERIFY]` is resolved; moves commit onto BullMQ once it exists |
| `TASK-tasks-board` (Phase 3) | `24:11420`; fills the activity-tag row this task renders from real data |

---

## 10. Landed — decisions, deviations, and what's honestly unverified

§7's four decisions were all confirmed as recommended: invariant 7 amended for
`components/map/config.ts` (CLAUDE.md, design-spec §10), D15 renders `—` (design-spec §9),
GeoJSON-only import (KML/Shapefile deferred to `TASK-fields-import`), View Details opens the
editor. `[VERIFY]`s resolved before code, per CLAUDE.md §2.0: `react-map-gl@8.1.2` has no root
export — `react-map-gl/mapbox` — confirmed against the installed package's own `.d.ts`, not
guessed.

**Real bugs found by testing this live in a browser, not just by lint/typecheck:**
1. `field-map.tsx`'s `setFeatureState`/`removeFeatureState` and `draw-control.tsx`'s
   `draw.add()` both threw `"Style is not done loading"` as an uncaught error when called before
   Mapbox's `load` event — `mapRef.current` (and `useControl`'s `onAdd`) fire before that. Fixed
   by gating both on the map's own `load` event, not just ref presence.
2. `<FieldEditor field={editingField}>`'s form fields are `useState`, initialized once — opening
   a *different* field (or reopening the same one after an unsaved edit) never re-synced,
   because a prop change alone doesn't re-run a `useState` initializer. Fixed with
   `key={`${editingField?.id ?? "new"}-${editorOpenCount}`}` on the `<FieldEditor>` call in
   `field-list-panel.tsx`, forcing a remount every time the editor opens.
3. **Found only once a real Mapbox token replaced the dev placeholder** (the placeholder token
   never got a style to load, so this whole code path was silently never exercised until then):
   `draw-control.tsx`'s original `useControl`-based version stashed the `MapboxDraw` instance in
   a ref from inside `onCreate` — a `useMemo` initializer. React 19 dev StrictMode
   double-invokes `useMemo` initializers, and writing to a ref from inside one is exactly the
   impure-during-render pattern React's docs warn about: the ref ended up holding a *different*
   `MapboxDraw` instance than the one `useControl` actually passed to `map.addControl()`, so
   `.add()` crashed reading `ctx.store` (`Cannot read properties of undefined (reading 'get')`,
   inside mapbox-gl-draw's own `api.add()`) on an instance that was never wired up. Fixed by
   dropping `useControl` for a single plain `useEffect` that creates one instance and uses that
   same local `const` for everything — no separate hook-call boundaries for the instance to go
   stale across. `DrawControl` now takes the loaded `MapRef` as a prop instead of resolving one
   itself, so the parent only renders it once `onLoad` has actually fired.

**One accessibility bug, caught by a test locator's *false positive* revealing a real anti-pattern:**
`FieldCard`'s root `<div>` had `role="button"` and wrapped a real `<button>` (View Details) — a
button announced inside another button-role element, which is invalid nested-control semantics
(confusing Tab order, and it's why Playwright's substring name-match on "View Details" first hit
the *card*, not the button). Fixed by dropping the ARIA role/`tabIndex` from the card — click-to-select
is now a plain, unannounced mouse convenience, and **View Details is the one keyboard-operable
control per card**.

**Deviations from §2's plan, both scope-reducing, both recorded here rather than left implicit:**
- §2.7 said the header renders on the server and only the panel/map are client boundaries. Built
  instead as one client component (`field-list-panel.tsx`) owning `PageHeader` too, because
  Import/+ Add Field need to open modals regardless — splitting the header out would have meant
  prop-drilling the same mutation/selection state across a component boundary for a marginally
  smaller server payload. No verification item depends on the header specifically being
  server-rendered.
- Farm/crop cycle history, drag-reorder, and mobile breakpoints were already explicitly out of
  scope (§5) and stayed that way.

**Verification items honestly not run, and why (§6):**
- **Item 14 (visual diff vs Figma).** No `get_screenshot` baseline PNG was fetched — this
  session had a live Figma MCP connection (used for card data, §2.12) but capturing and
  committing a baseline export was not done. `apps/web/e2e/fields.spec.ts` covers every
  *functional* criterion instead. Follow-up: fetch `1:35172`'s panel-region export and add the
  `toHaveScreenshot` assertion `shell.spec.ts` already demonstrates the pattern for.
- **Item 15 (NFR-11, 60fps pan with 200 polygons).** `db:seed:bulk` and the
  `window.__floraMapInstance` testability hook (`field-map.tsx`) are both in place, but a
  placeholder Mapbox token never finishes loading a style, so there's nothing to pan against.
  Needs a real token in the environment the test runs in.
- **Item 16 (degrades with no Mapbox token).** `MapPlaceholder` exists and was verified manually
  with the dev-placeholder token still *set* (a different case — see below). The unset case needs
  `NEXT_PUBLIC_MAPBOX_TOKEN` absent at **build** time (Next.js inlines
  `process.env.NEXT_PUBLIC_*` per build), which a single running `next dev` can't toggle
  per-test — needs a dedicated CI job building with the var unset.

**What was verified live, in a real browser, against the real API and a real Postgres**
(not just typecheck/lint/unit tests): the full screen renders and matches the Figma card data
exactly (name, tags, growth %, species, quantity, coordinates — checked against
`get_design_context`'s output, §2.12); search, sort-by-position pagination, and the empty state;
selecting a card and the map's click/double-click wiring; View Details opens the editor
pre-filled (name, boundary + drawn acreage, species, dates, status); + Add Field and Import both
open clean; keyboard reachability with a visible focus ring on the toolbar and card controls; no
uncaught page error across every one of those interactions. 22/22 Playwright tests pass
(`shell.spec.ts` unmodified, `fields.spec.ts` new) — see that file's own header for exactly
which §6 items it does and doesn't cover.

**Re-verified with a real `NEXT_PUBLIC_MAPBOX_TOKEN`** (the dev-placeholder value used for the
initial pass never let a style load, which is exactly what masked bug 3 above): satellite
imagery, the four white field boundaries with their label pills, and both `mapbox-gl-draw` paths
— preloading an existing boundary for editing (Field 237: `18.19 ac drawn`) and drawing a brand
new one from scratch (`+ Add Field`, click-click-click-double-click: `8.95 ac drawn`) — all
render and compute correctly with no console or page errors. `growth %`'s exact value is
date-relative and was seen to have already drifted from the seed day's 30%/80%/10%/40% to
31%/81%/11%/41% one calendar day later — `fields.spec.ts`'s assertion was tightened from an
exact string to a range check for exactly this reason, not loosened arbitrarily.
