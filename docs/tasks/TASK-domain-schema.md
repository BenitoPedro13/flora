# TASK-domain-schema — the farm domain in Postgres, on the tenancy substrate

> **Phase:** 0 (architecture §16) · **Status:** planned · **Date:** 2026-08-15
> **Depends on:** `TASK-auth-tenancy` (complete, `63b5aa9`) — specifically
> `packages/db/src/tenancy.ts`, which every table here is required to go through
> **Blocks:** the whole spine — `TASK-fields` → `TASK-crop-stress` → `TASK-tasks-board`
> **References:** [`../architecture.md`](../architecture.md) §5.1, §5.2, §5.3, §7.2, §7.5, §7.6,
> §8.1, §8.2, §8.3, §16 · [`../design-spec.md`](../design-spec.md) §5.2, §5.3, §9

The last Phase 0 task. It ships **no UI and no endpoint** — it is the schema, the enums that
back it, the spatial read pattern the derived-area invariant depends on, and the tests that
make all three falsifiable. Everything the spine builds sits on this.

---

## 1. Current scenario

`HEAD` is `6ac33d1`. All three prior Phase 0 tasks have landed.

**What exists in `packages/db`:**

- `src/tenancy.ts` — `withOrganization()` (transaction-local GUC) and `tenantRlsSql(table)`,
  the paste-source for a new tenant table's policy block. **This task is the first consumer of
  `tenantRlsSql` beyond the tables that shipped with it.**
- `src/types/geography.ts` — `geographyMultiPolygon`, `geographyPolygon`, `geographyPoint`,
  all typed `data: string`. Architecture §5.2 records why: node-postgres returns `geography`
  as WKB hex, so these exist **only to give `drizzle-kit generate` the column DDL** and are
  never used to move a value through Drizzle's typed API.
- `src/queries/spatial.ts` — five functions, all against `geo_spike`. The `ST_GeomFromGeoJSON`
  on write / `ST_AsGeoJSON(...)::json` on read pattern that every real geometry read must copy.
- `src/schema/auth.ts` — `organizations`, `users`, `memberships`, `refresh_tokens`.
  `memberships` carries `unique().on(organizationId, userId)` — load-bearing below (§2.4).
- `src/schema/spike.ts` — `geo_spike`, whose own docstring says **"Dropped in
  TASK-domain-schema once the real `fields` table lands."**
- `src/queries/tenancy.spec.ts` — the catalog test. It finds every table with an
  `organization_id` column that lacks RLS + an `app_current_org()` policy. **It covers this
  task's tables automatically the moment they exist**, which is the point of it; the ten new
  tables are its first real workout.
- `migrations/0000`–`0003`, applied by `src/migrate.ts` (plain `.sql` in lexical order, tracked
  in `_migrations` — not drizzle-kit's migrator).
- `src/seed.ts` — one org, one owner, one membership. **No farm, no crops, nothing spatial.**

**What does not exist:** every domain table. There is no `farms`, no `fields`, no
`crop_cycles`, no `observations`, no `stress_zones`, no `tasks`. `packages/contracts` has
`geojson.ts`, `auth.ts`, `health.ts` and **no domain enum and no units module** — architecture
§5.3 names `packages/contracts/src/units.ts` as the single conversion point for the
store-SI/display-acres decision and it has never been written.

`migrations/0003_tenancy_rls.sql:34` already anticipates this task by name:

```sql
-- So a future migration's new tables (TASK-domain-schema's eight) are
-- covered without a per-table grant — verified in TASK-auth-tenancy §6.4
-- once that task adds one.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO flora_app;
```

That `ALTER DEFAULT PRIVILEGES` is untested — no table has been created since it ran. §6.5
tests it. ("eight" was an estimate; the count is ten, §2.2.)

### 1.1 Findings from this session that change the plan

Four things were checked against the running `imresamu/postgis:16-3.4` container and against
`drizzle-kit` 0.31.10 before this document was written, rather than assumed:

1. **`drizzle-kit` emits the geography column type quoted, and the result does not run.** A
   probe schema generated `"boundary" "geography(MultiPolygon,4326)" NOT NULL`, and Postgres
   rejects it: `ERROR: type "geography(MultiPolygon,4326)" does not exist`. Unquoted is fine.
   `citext` survived the same treatment in `0002_auth_tables.sql` only because `"citext"` *is*
   a valid quoted type name; a parameterised type is not. **The generated migration must have
   those quotes stripped by hand before it is committed** — §2.5.
2. **`USING gist` and partial unique indexes generate correctly.** `index().using("gist", t.boundary)`
   → `CREATE INDEX ... USING gist ("boundary")`, and `uniqueIndex().on(t.fieldId).where(sql\`status = 'growing'\`)`
   → `CREATE UNIQUE INDEX ... WHERE status = 'growing'`. Both are usable as generated; neither
   needs hand-writing, unlike `0001_geo_spike.sql`'s hand-rolled GIST index.
3. **`index` and `position` are usable column names** — `CREATE TABLE t ("index" text, "position" numeric)`
   succeeds on PG16 (both are non-reserved). The only collision is in TypeScript, where
   `index` is also Drizzle's index builder; alias the import (§2.2).
4. **PG16 supports a column list on `ON DELETE SET NULL`** — `FOREIGN KEY (organization_id, field_id)
   REFERENCES fields (organization_id, id) ON DELETE SET NULL (field_id)` nulls *only*
   `field_id` and leaves `organization_id NOT NULL` intact. Verified by running it. This is
   what makes the composite-FK design in §2.4 compatible with `tasks.field_id` being nullable.

---

## 2. Planned changes

### 2.1 Scope rule — which tables ship now

Architecture §5.1 names thirteen non-deferred entities. Building all thirteen would mean
writing columns for screens nobody has designed against yet, which is how a schema acquires
fields that turn out wrong. Building only what Phase 1 needs would mean a second and third
RLS migration for tables whose shape §5.3 already fixes precisely.

**The rule this task uses: a table ships now if something in phases 1–3 — the hard-sequenced
spine — reads or writes it.** That is a boundary drawn by the build order CLAUDE.md already
commits to, not by convenience.

| Entity | Ships now? | Because |
|---|---|---|
| `farms` | **yes** | Every field belongs to one; the daily refresh schedules in farm-local time (§7.2) |
| `crops` | **yes** | `Specie Planted` on the field card (design-spec §5.2) |
| `fields` | **yes** | Phase 1 |
| `crop_cycles` | **yes** | Phase 1 — growth, species, quantity |
| `observations` | **yes** | Phase 2 writes it |
| `stress_zones` | **yes** | Phase 2 writes it |
| `tasks` + `task_assignees` + `task_comments` + `subtasks` | **yes** | Phase 3 |
| `harvests` | no | Nothing in phases 1–4 reads one. Crops Stocked sums `crop_cycles.quantity_kg` (§4.4), not harvests. Owner: whichever task first needs per-harvest granularity |
| `weather_snapshots` | no | Phase 5. Owner: `TASK-weather` |
| `management_zones`, `prescriptions` | no | Phase 6, and blocked on §17 Q8 (nobody computes prescriptions). Owner: `TASK-management-zones` |
| `farm_daily_rollups` | no | Phase 4. Owner: `TASK-home` |
| `farm_scores` | no | Phase 4 **and blocked on §17 Q2** — the Regeneration Score formula is explicitly a product decision that must not be invented in code (§5.4) |
| `energy_assets`, `energy_readings`, `batteries` | no | Deferred outright (§4.3) |

Ten tables. Each deferred table gains a named owner task above; none is forgotten, and each
arrives with a screen that can prove its shape is right.

### 2.2 `packages/db/src/schema/` — the tables

One file per aggregate, all barrelled through `schema/index.ts`:
`farm.ts`, `crop.ts`, `field.ts`, `observation.ts`, `stress.ts`, `task.ts`.

Conventions every table follows, without exception:

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` — except `observations`, which is
  `PRIMARY KEY (field_id, captured_on, index)` per §5.3.
- `organization_id uuid NOT NULL` on **every** table, denormalised onto leaves deliberately
  (§5.3), so a tenancy predicate never needs a join and the catalog test can see the table.
- `created_at` / `updated_at timestamptz NOT NULL DEFAULT now()`.
- A `unique (organization_id, id)` index on every table that is a composite-FK parent — this
  is what §2.4's integrity design requires and it costs one index.
- `import { index as pgIndex }` in any module that also declares a column named `index`
  (only `observation.ts`).

**`farms`** — `name text`, `location geographyPoint`, `timezone text NOT NULL` (IANA;
`America/Manaus` in the seed, matching the design's Amazonas coordinates). GIST on `location`.
Timezone is not decoration: architecture §7.2 schedules the refresh at "03:00 farm-local".

**`crops`** — `name text`, `slug citext`, `unique (organization_id, slug)`. **Tenant-scoped, not
a global reference table.** A global table would carry no `organization_id`, which means the
catalog test cannot see it and it would need a written carve-out justification of exactly the
kind `tenancy.spec.ts`'s header asks for; and an org that grows something outside a
four-row list has nowhere to put it. Cost is four duplicated seed rows per org, which is
nothing.

**`fields`** — `farm_id`, `name text`, `boundary geographyMultiPolygon NOT NULL`,
`position numeric NOT NULL`, plus three refresh-state columns. GIST on `boundary`;
`unique (organization_id, farm_id, name)`; `unique (organization_id, id)`.

- **No `area` column, ever** (invariant 3, §18.7). Derived through `ST_Area` in
  `queries/fields.ts` (§2.6).
- `position numeric` because §8.1 says the field list sorts by a mutable `position` and
  paginates by cursor; `numeric` so a reorder writes one row, not the column.
- **`last_refresh_at`, `last_refresh_succeeded_at timestamptz`, `last_refresh_error text`** —
  NFR-8 requires a stale badge carrying the *last-success date*, never a zero. Rejected
  alternative: derive freshness from `max(observations.captured_on)`. That conflates two
  different facts — a refresh that ran successfully and found no new cloud-free scene is
  healthy, and would read as five days stale.
- **No `soil_moisture` and no `carbon_ton_potential` columns**, despite the field card showing
  both (design-spec §5.2). Neither has a data source anywhere in the architecture — see §7,
  raised as a new gap rather than answered with an invented column.

**`crop_cycles`** — `field_id`, `crop_id`, `planted_on date`, `expected_harvest_on date`,
`status crop_cycle_status`, `quantity_kg numeric`.

- **Partial unique index**: `uniqueIndex("crop_cycles_one_growing_per_field").on(fieldId).where(sql\`status = 'growing'\`)`
  — §5.3's "at most one growing cycle, enforced by a partial unique index, not application
  logic". Verified generatable (§1.1.2).
- **`growth_pct` is proposed for removal — needs sign-off (§3.4).** §5.3 lists it as a column,
  but it is computable from `planted_on`/`expected_harvest_on`, and a stored copy diverges the
  moment either date is edited — the identical argument that keeps `area` out of `fields`.
  Ship derived unless the intent was operator-observed phenology, in which case it stays a
  column and §5.3 should say so.

**`observations`** — `organization_id`, `field_id`, `captured_on date`, `index observation_index`,
`stats jsonb`, `raster_key text`, `bbox jsonb`, `scene_id text`, `created_at`.
`PRIMARY KEY (field_id, captured_on, index)` exactly as §5.3 specifies.

- `stats` and `bbox` are `jsonb().$type<ObservationStats>()` / `$type<BBox>()`, with the zod
  schemas in `packages/contracts` (§2.3). JSONB is the right storage — adding an index must not
  need a migration (§5.3) — but it is not an excuse for an unvalidated shape.
- `raster_key` is the **R2 object key**, never a signed URL (invariant 2, §18.4). The column
  comment says so, so the next person to touch it reads it there and not only here.
- Index `(organization_id, field_id, index, captured_on DESC)` — serves
  `GET /fields/:id/observations?index=&from=&to=` and its `/dates` sibling (§8.3) under NFR-2's
  50 ms p95.

**`stress_zones`** — `field_id`, `geometry geographyPolygon NOT NULL`, `detected_on date`,
`window_start`/`window_end date`, `classification stress_classification`,
`severity stress_severity`, `index_value numeric`, `muted_at`, `deleted_at timestamptz`.
GIST on `geometry`.

- Soft delete (§5.3): an operator deleting a true positive stays auditable. `DELETE
  /api/v1/stress-zones/:id` is a `deleted_at` write.
- The re-detection rule (§7.5 — a new zone overlapping an existing one by ≥ 50% of the smaller
  area is the same zone, keeping `classification` and `muted_at`) is **worker logic, not a
  constraint**; it lands in `TASK-crop-stress`. The GIST index is what makes it cheap.
- Index `(organization_id, field_id, detected_on DESC) WHERE deleted_at IS NULL`.

**`tasks`** — `field_id uuid` **nullable**, `title text`, `description text`,
`status task_status`, `progress_pct integer`, `activity task_activity`, `starts_on`,
`due_on date`, `position numeric NOT NULL`.

- `position numeric` per §5.3 — a drag writes one row between two neighbours.
- Index `(organization_id, status, position)` — the board's per-column ordered read.
- **No `volume_l` column.** §4.4's Water-Used re-sourcing is open question Q3 and is not
  signed off; `TASK-tasks-board` adds the column if and when it is.

**`task_assignees`** — `PRIMARY KEY (task_id, user_id)` + `organization_id`.
**`task_comments`** — `task_id`, `author_id`, `body text`, `created_at`.
**`subtasks`** — `task_id`, `title text`, `done_at timestamptz`, `position numeric`.
All three exist because the design's task card shows `2` comments and `1/5` subtasks (§5.3).

### 2.3 `packages/contracts` — enums and units

Six enum value arrays, exported as `as const` tuples and consumed by `pgEnum` in
`packages/db`, exactly as `membershipRoleValues` already is. This is invariant 4 in its
narrowest form: **the database enum and the API enum are one declaration.**

| Export | Values | Source |
|---|---|---|
| `cropCycleStatusValues` | `planned · growing · harvested · failed` | §5.3 |
| `observationIndexValues` | `ndvi · ndre · ndwi · evi · true_color` | §5.3 |
| `stressClassificationValues` | `soil_issue · low_vigor · pest · water_stress · unclassified` | §5.3 |
| `stressSeverityValues` | `low · medium · high` | §7.5 |
| `taskStatusValues` | `todo · in_progress · done` | §5.3 |
| `taskActivityValues` | `watering · planting · fertilization · pest_control · harvesting` | §5.3 |

Plus `observationStatsSchema` (`min · max · mean · stddev · p10 · p90`, all `z.number()`) and
`bboxSchema` (`z.tuple([number, number, number, number])`, west/south/east/north) — the JSONB
payload shapes.

**`packages/contracts/src/units.ts`** — named by §5.3, never written. Units are **acres and
metric tonnes, fixed**; storage is **canonical SI** (`m²`, `kg`); this module is the only place
the two meet.

```ts
export const SQUARE_METRES_PER_ACRE = 4046.8564224   // exact: 4840 sq yd × 0.9144² m²/yd²
export const KILOGRAMS_PER_TONNE = 1000

export function squareMetresToAcres(m2: number): number
export function kilogramsToTonnes(kg: number): number
export function formatAcres(m2: number): string      // "24.1 ac"  — design-spec §5.3
export function formatTonnes(kg: number): string     // "1.9 T"    — design-spec §5.2
```

Unit-tested (pure functions, no container): a 1-acre polygon's `ST_Area` in m² formats to
`1.0 ac`, `1_900` kg → `1.9 T`, and the exactness of the constant is asserted against
`4840 * 0.9144 ** 2`.

**Architecture §8.2's `fieldSchema` example is wrong and gets corrected**: it shows
`areaHectares: z.number()`, which contradicts §5.3's store-SI/display-acres decision made the
same day. The API returns `areaM2` and the UI converts through `units.ts`. This is a doc edit
here (§5), not a code change — no `fieldSchema` exists yet; `TASK-fields` writes it.

**Out of scope for contracts in this task:** request/response DTOs for fields, tasks or
observations. Those belong with the endpoints that serve them. This task ships only what the
*database* must import.

### 2.4 Cross-tenant integrity — composite foreign keys

`organization_id` is denormalised onto every leaf table (§5.3). That is a performance decision
with a correctness cost nobody has yet paid: **a leaf row's `organization_id` can silently
disagree with its parent's.** An observation could carry org A while its field belongs to org
B, and RLS would faithfully show it to the wrong tenant. Invariant 6 says tenancy is enforced
twice; this is a third hole underneath both.

**Every child references its parent through a composite key including `organization_id`:**

```sql
FOREIGN KEY (organization_id, field_id) REFERENCES fields (organization_id, id) ON DELETE CASCADE
```

which is why every parent carries `unique (organization_id, id)`. A row pointing at another
org's parent is now rejected by the database, not by a `where` clause someone might forget.

Three consequences worth stating:

- **`tasks.field_id` is nullable**, and the FK uses PG16's column-list form,
  `ON DELETE SET NULL (field_id)` — verified working (§1.1.4). Nulling the whole tuple would
  violate `organization_id NOT NULL`. Under MATCH SIMPLE a NULL `field_id` skips the check
  entirely, which is exactly right for a task with no field. `ON DELETE CASCADE` was rejected:
  deleting a field must not erase the record of work done on it.
- **`task_assignees` and `task_comments` reference `memberships (organization_id, user_id)`**,
  not `users (id)`. `memberships` already carries `unique().on(organizationId, userId)` from
  `TASK-auth-tenancy`, so this costs nothing and buys a real guarantee: **an assignee or
  comment author is provably a member of the owning org.** A plain FK to `users` could not say
  that.
- Everything else cascades from `fields`: `crop_cycles`, `observations`, `stress_zones`.

### 2.5 Migrations

Two files. The split is the one `0003` already established — generated DDL in one, everything
Drizzle cannot see in the other.

**`0004_domain_tables.sql`** — `drizzle-kit generate`, then hand-corrected. Two edits are
mandatory and both are known in advance:

1. **Strip the quotes from every geography type** (§1.1.1). `"boundary" "geography(MultiPolygon,4326)"`
   → `"boundary" geography(MultiPolygon,4326)`. Three columns:
   `fields.boundary`, `stress_zones.geometry`, `farms.location`. **A migration committed
   without this fails on `pnpm db:migrate` with `type ... does not exist`** — §6.1 catches it,
   but knowing beforehand is cheaper than debugging it.
2. **Add the composite FKs and `ON DELETE SET NULL (field_id)`** if drizzle-kit emits only
   single-column references. Check the generated output before assuming either way.

GIST indexes and the partial unique index need no hand-editing (§1.1.2) — a change from
`0001_geo_spike.sql`, where the GIST index was hand-written.

**`0005_domain_rls.sql`** — hand-written:

- `tenantRlsSql(t)` output for all ten tables, pasted, in the order the tables are created.
  Generate it with a throwaway `tsx -e` rather than typing ten near-identical blocks.
- `DROP TABLE IF EXISTS geo_spike;` — the spike's stated end (§2.7).
- Column comments recording the two invariants that live in column semantics rather than in
  types: `observations.raster_key` is an R2 key, and `fields` has no area column on purpose.

`_journal.json` gets whatever `drizzle-kit generate` writes; `migrate.ts` reads the directory,
not the journal, so the two only need to not contradict each other.

### 2.6 `packages/db/src/queries/fields.ts` — the geometry read pattern

`geo_spike` proved the PostGIS round-trip on a throwaway table. This task must prove it on the
real one, because **"area is derived, never stored" is an untested claim until something
derives it.**

```ts
insertField(tx, { organizationId, farmId, name, boundary, position })   // ST_GeomFromGeoJSON
getField(tx, id)        // ST_AsGeoJSON(boundary)::json, ST_Area(boundary) AS area_m2,
                        // ST_AsGeoJSON(ST_Centroid(boundary))::json AS centroid
listFieldsInBbox(tx, bbox)   // boundary && ST_MakeEnvelope(...)::geography — GIST path
updateFieldBoundary(tx, id, boundary)
```

All take a `Tx` (from `tenancy.ts`), never a bare `Database` — the callable surface makes it
awkward to query a tenant table outside `withOrganization`. Note `ST_Area` on a `geography`
returns **square metres** with no `use_spheroid` argument needed; that is the SI value stored
nowhere and returned as `areaM2`.

**Deliberately not written here:** query modules for observations, stress zones or tasks.
Nothing writes an observation until `TASK-crop-stress` and nothing reads a task until
`TASK-tasks-board`; a repository written now would be a guess at its own call sites. The
*pattern* is what this task establishes, and `fields` establishes it because it is the one
geometry table Phase 1 actually touches.

### 2.7 Retiring the spike

`geo_spike` has done its job — it resolved architecture §5.2's `[VERIFY]` and its evidence is
recorded in the spec. Removed: `src/schema/spike.ts`, `src/queries/spike-roundtrip.ts`, the
`spike:roundtrip` package script, `spatial.ts`'s five `geo_spike` functions, and the table
itself. Architecture §5.2 keeps its historical statement of what the spike *proved* and
re-points its "see" reference at `queries/fields.spec.ts`, which now holds the same assertions
against a real table.

### 2.8 Seeding

`src/seed.ts` (unchanged contract — idempotent, owner connection) additionally creates **one
farm and four crops**. That is reference data, not fixtures: an org with no farm cannot hold a
field, and the four crops are the ones the design names.

**New: `src/seed-demo.ts`, `pnpm db:seed:demo`** — three fields with real hand-authored
MultiPolygon boundaries near `4.5831° S / 59.1328° W` (the coordinates in the design's field
card footer, Amazonas), a `growing` crop cycle on each, and a handful of tasks across all
three statuses. Kept as a **separate script** so demo data never lands in a database that
merely ran `db:seed`, and so its polygons can be regenerated without touching identity seeding.

Boundaries are hand-authored, not random: `TASK-fields`'s map has to render something with a
plausible shape and a centroid that matches the design's footer, and `ST_Area` has to return a
farm-sized number.

---

## 3. Why

### 3.1 Why one task rather than a table per phase

The RLS block, the grants, the catalog test's coverage and the composite-FK convention are
**one decision applied ten times**. Splitting them across three tasks means making that
decision three times and getting it subtly different twice. The scope rule in §2.1 caps the
speculation: nothing ships whose shape a phase-1-to-3 screen won't exercise within weeks.

### 3.2 Why composite foreign keys (§2.4)

This is the part of the plan that is not in the architecture spec, and it is the part most
worth pushing back on if it is wrong. The spec denormalises `organization_id` for index and
predicate reasons and does not say what keeps the copy honest. RLS does not: a policy checks
`organization_id = app_current_org()` on the row in front of it and has no opinion about
whether that value matches the row's parent. The failure it prevents is a bad `INSERT` in
worker code — precisely where nobody is looking, since the worker has no HTTP request and no
cross-tenant test suite pointed at it.

The cost is one unique index per parent table and slightly wordier FK declarations. That is
cheap for turning a class of cross-tenant corruption into a constraint violation.

### 3.3 Why the enums live in `packages/contracts`

`membershipRoleValues` already set this precedent and the reason generalises: `stress_zones.classification`
is written by a worker, validated by an API `PATCH`, rendered by a dropdown in the detection
row, and stored as a Postgres enum. Four places, one list. Any other arrangement is the drift
that killed the prototype's `lib/api.ts` (invariant 4).

### 3.4 Two things this task asks for a decision on

Neither blocks starting; both should be settled before the migration is committed, because
changing them afterwards is a migration rather than an edit.

1. **`crop_cycles.growth_pct` — stored or derived?** (§2.2). Derived is consistent with
   invariant 3 and with §18.7's rejection of a stored `area`. Stored is right *only* if growth
   is an operator observation (a BBCH-style stage) rather than calendar progress. The design
   shows a percentage and a progress bar and says nothing either way. **Recommendation: derive**,
   and add an override column the first time a farmer disagrees with the calendar.
2. **`fields` unique on `(organization_id, farm_id, name)`** (§2.2). The Crop Stress screen
   picks a field from a dropdown by name (`Field 239`), which only works if names distinguish
   fields within a farm. Easy to reverse, but reversing it after duplicates exist is not.

---

## 4. Affected files

| Path | Change | Notes |
|---|---|---|
| `packages/contracts/src/enums.ts` | new | six `*Values` tuples — the single declaration `pgEnum` consumes |
| `packages/contracts/src/units.ts` | new | SI ↔ acres/tonnes, the only conversion point (§5.3) |
| `packages/contracts/src/units.spec.ts` | new | pure unit tests, no container |
| `packages/contracts/src/observation.ts` | new | `observationStatsSchema`, `bboxSchema` — the JSONB shapes |
| `packages/contracts/src/index.ts` | edit | re-export |
| `packages/contracts/package.json` | edit | `test` script + vitest (contracts has no test script today) |
| `packages/contracts/vitest.config.ts` | new | |
| `packages/db/src/schema/farm.ts` | new | `farms` |
| `packages/db/src/schema/crop.ts` | new | `crops` |
| `packages/db/src/schema/field.ts` | new | `fields`, `crop_cycles`, `crop_cycle_status` |
| `packages/db/src/schema/observation.ts` | new | `observations`, `observation_index` — aliases the `index` import |
| `packages/db/src/schema/stress.ts` | new | `stress_zones` + two enums |
| `packages/db/src/schema/task.ts` | new | `tasks`, `task_assignees`, `task_comments`, `subtasks` + two enums |
| `packages/db/src/schema/index.ts` | edit | barrel: drop `spike.js`, add six |
| `packages/db/src/schema/spike.ts` | **removal** | §2.7 |
| `packages/db/src/queries/fields.ts` | new | the geometry read/write pattern on a real table |
| `packages/db/src/queries/fields.spec.ts` | new | integration suite — §6.2–§6.9 |
| `packages/db/src/queries/spatial.ts` | **removal** | all five functions were `geo_spike`-only; superseded by `fields.ts` |
| `packages/db/src/queries/spike-roundtrip.ts` | **removal** | §2.7 |
| `packages/db/src/index.ts` | edit | export `queries/fields.js`, drop `queries/spatial.js` |
| `packages/db/migrations/0004_domain_tables.sql` | new | generated, then hand-corrected — §2.5 |
| `packages/db/migrations/0005_domain_rls.sql` | new | hand-written: ten policy blocks, `DROP TABLE geo_spike`, column comments |
| `packages/db/migrations/meta/*` | edit | drizzle-kit's journal/snapshot |
| `packages/db/src/seed.ts` | edit | + one farm, + four crops |
| `packages/db/src/seed-demo.ts` | new | three fields, three cycles, tasks — §2.8 |
| `packages/db/src/queries/tenancy.spec.ts` | edit | assert the ten tables exist *and* are protected, so the catalog test can't pass vacuously |
| `packages/db/package.json` | edit | `seed:demo` script, drop `spike:roundtrip` |
| `package.json` | edit | root `db:seed:demo` passthrough |
| `docs/architecture.md` | edit | §5.2 re-point spike reference; §5.3 growth_pct + refresh-state columns + composite-FK convention; §8.2 `areaHectares` → `areaM2`; §16 Phase 0 row → complete; §17 new Q10 |
| `docs/design-spec.md` | edit | §9 gains **D15** (Soil Moisture / Carbon Ton Potential have no data source) |
| `CLAUDE.md` | edit | status line, next-up pointer → `TASK-fields` |
| `README.md` | edit | status line, `pnpm db:seed:demo` |

No file under `apps/` is touched. That is a deliberate property of this task: it is entirely
`packages/`, so it cannot break the shell or the login flow that just landed.

---

## 5. Explicitly out of scope

- **Every endpoint.** No controller, no service, no DTO. §8.3's `/fields`, `/observations`,
  `/stress-zones` and `/tasks` routes are `TASK-fields`, `TASK-crop-stress`, `TASK-tasks-board`.
- **Every screen.** `1:35172` is `TASK-fields`.
- **The seven deferred tables** in §2.1's table, each with a named owner.
- **`packages/satellite`, BullMQ, R2.** `observations.raster_key` and `bbox` are columns with
  nothing writing them until Phase 2, which is correct — the table is what Phase 2 builds
  against.
- **The stress-detection algorithm** (§7.5). Rules are decided; `detect.ts` is
  `TASK-crop-stress`. This task ships the columns those rules populate and the GIST index the
  ≥ 50% overlap rule will need.
- **Field import** (`POST /fields/import`, §11.5). Parsing KML and zipped Shapefiles is
  `TASK-fields`.
- **The Regeneration Score** — §17 Q2, unresolved, and §5.4 says explicitly it must not be
  invented in code. No `farm_scores` table.
- **Backfilling `position` strategies, cursor pagination helpers.** The columns and indexes
  ship; the pagination utility ships with the first endpoint that paginates.

---

## 6. Verification

Measurable per CLAUDE.md — no criterion may rest on "works". Items 2–9 are one file,
`packages/db/src/queries/fields.spec.ts`, against real testcontainers PostGIS.

1. **Migrations apply clean.** `pnpm infra:reset && pnpm db:migrate` on an empty volume applies
   `0000`–`0005` and exits 0; a second run logs nothing and exits 0. `\d fields` shows
   `boundary | geography(MultiPolygon,4326)` — proving §1.1.1's quote correction was made.
2. **Area is derived and correct.** Insert a field whose boundary is a known polygon; `ST_Area`
   agrees with `turf.area` on the same GeoJSON to within **0.5%** (the bar `TASK-foundations`
   set and cleared at 0.15%). `information_schema.columns` contains **no column named `area`,
   `area_m2`, `acres` or `hectares` on `fields`** — invariant 3, asserted, not assumed.
3. **Round-trip fidelity.** Insert a MultiPolygon with an interior ring and two parts; read it
   back through `getField` and assert deep structural equality with the input GeoJSON.
4. **The GIST index is used.** `EXPLAIN` on `listFieldsInBbox` contains `Index Scan` and the
   index name `fields_boundary_gist`, and does **not** contain `Seq Scan`.
5. **One growing cycle per field.** A second `INSERT` with `status = 'growing'` for the same
   `field_id` raises `23505`; a second with `status = 'harvested'` succeeds.
6. **Composite FKs reject cross-org parents.** Insert org A's field; attempt an observation, a
   stress zone, a crop cycle and a task carrying org B's `organization_id` with org A's
   `field_id` — all four raise `23503`. Attempt a `task_assignee` for a user with no membership
   in the owning org — `23503`.
7. **Cascade and set-null behave as designed.** Deleting a field removes its observations,
   stress zones and crop cycles; its tasks survive with `field_id IS NULL` and
   `organization_id` **unchanged and non-null**.
8. **Observation upsert.** A second insert on the same `(field_id, captured_on, index)` with
   `ON CONFLICT ... DO UPDATE` replaces `stats` and `raster_key` and leaves the row count at 1.
9. **RLS holds on the new tables without HTTP.** Through `withOrganization(app.db, orgA)`, a
   select over each of the ten tables returns only org A's rows; with no GUC set, zero rows;
   an insert carrying org B's id raises a row-level-security error.
10. **The catalog test is not vacuous.** `tenancy.spec.ts` asserts `unprotectedTenantTables()`
    is `[]` **and** that all ten table names are present in `pg_class` with
    `relrowsecurity = true`. Without the second half the suite passes just as happily on a
    database where the migration never ran.
11. **`ALTER DEFAULT PRIVILEGES` actually covered the new tables** — the untested claim from
    `0003:34`. For each of the ten:
    `has_table_privilege('flora_app', t, 'SELECT,INSERT,UPDATE,DELETE')` is true, with no
    explicit `GRANT` anywhere in `0004` or `0005`.
12. **The spike is gone.** `to_regclass('public.geo_spike')` is `NULL`;
    `grep -r "geo_spike\|spike-roundtrip" packages/ apps/` returns no matches outside
    `docs/` and `migrations/0001_geo_spike.sql` (the historical migration stays).
13. **Enums are single-sourced.** `grep -rn "'growing'\|'ndvi'\|'water_stress'\|'in_progress'" packages/db/src`
    finds string literals **only** inside `packages/contracts` imports and migration SQL — no
    enum member is retyped in `packages/db`.
14. **Units convert exactly.** `SQUARE_METRES_PER_ACRE === 4840 * 0.9144 ** 2`;
    `formatAcres(97_530)` → `"24.1 ac"` (the design's stress total);
    `formatTonnes(1_900)` → `"1.9 T"` (the field card's quantity).
15. **The whole workspace is green.** `pnpm turbo lint typecheck test build` exits 0 across all
    packages, from a clean `--force` run.
16. **Seeds are idempotent.** `pnpm db:seed && pnpm db:seed` leaves exactly one farm and four
    crops; `pnpm db:seed:demo && pnpm db:seed:demo` leaves exactly three fields.
17. **`pnpm dev` still serves the shell.** Login with `owner@flora.local` still reaches `/` and
    renders the session sentence inside the shell — the schema task must not disturb what
    `TASK-design-system-shell` landed.

---

## 7. New questions this task raises

| # | Question | Where it goes |
|---|---|---|
| **D15** | **The field card's `Soil Moisture` and `Carbon Ton Potential` metrics have no data source anywhere in the architecture.** Soil moisture is plausibly Open-Meteo's soil-moisture parameters at the field centroid (Phase 5) or an NDWI observation (Phase 2); carbon-ton potential has no candidate at all and may be a leftover of the carbon-credit template §4.3 already identified. Two of the field card's four metrics cannot be filled. | design-spec §9, new gap **D15**; blocks the full field card in `TASK-fields` |
| **Q10** | **`crop_cycles.growth_pct` — stored or derived?** (§3.4) | architecture §17; settle before `0004` is committed |
| — | **The field card's activity tags** (design-spec §5.2) are presumably distinct `tasks.activity` values among a field's open tasks. That makes them empty until Phase 3, on a Phase 1 screen. Confirm the intent — no schema change either way, but `TASK-fields` needs to know whether an empty tag row is correct or a bug. | note for `TASK-fields` |

---

## 8. Risks

- **The generated migration runs before anyone reads it.** The geography quoting bug (§1.1.1)
  fails loudly, which is the good case. A missing composite FK fails silently and forever.
  Mitigation: §6.6 tests the FKs by trying to violate them, so a dropped constraint is a red
  test rather than a latent corruption.
- **Ten tables is a lot of surface to get subtly wrong in one review.** Mitigation: the scope
  rule (§2.1) means every table has a screen within three tasks that will exercise it, and
  §6.9 exercises RLS on all ten now.
- **`packages/contracts` gains a test runner it has never had.** Low risk, but it is a new
  `turbo test` participant; confirm the pipeline picks it up rather than assuming.
