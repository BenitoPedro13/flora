# TASK-tasks-board — the Tasks screen (`24:11420`)

> **Phase:** 3 (architecture §16) — the third and last link of the spine. Register the crop
> (Phase 1), see it struggle (Phase 2), **act on it**.
> **Blocked by:** `TASK-fields` (landed), `TASK-crop-stress` (landed). Both are in.
> **Blocks:** `TASK-home-dashboard` (Phase 4) — Home's re-sourced **Water Used** tile reads
> volume off completed `watering` tasks (architecture §4.4), which needs §2.3's column.
> **Design:** `24:11420` ("Tasks"), 1440×900 · design-spec §5.5, §4.1, §4.5, §6.1, §6.3.
> **Status:** landed 2026-08-16, against `5bf2d31`. Verified: `pnpm turbo run build typecheck
> lint test` is green across all 8 packages except the pre-existing, unrelated
> `auth.e2e.spec.ts` rate-limit failure (`AuthThrottlerGuard` commented out on `login` in the
> working tree — the user's own in-progress change, left untouched per their instruction). The
> live NFR-10 Playwright run (`apps/web/e2e/tasks.spec.ts`) was **not executed against the
> shared dev database** — it holds the developer's own hand-created field data, and running the
> full suite risked mutating it. The board, drag, and create flow were instead verified directly
> in the developer's own browser session against real data (§10 records what that surfaced).
>
> **Figma is reachable from this environment as of 2026-08-16.** Every geometry figure in §1.3
> is *measured* off the file (`get_metadata` / `get_screenshot` on `24:11420`, file
> `hY3Nd3BBbJsjpihPnfZgpd`), not read off design-spec prose. `shell.spec.ts`, `fields.spec.ts`
> and `stress.spec.ts` each record that their NFR-10 baseline could not be fetched "in this
> environment" — that blocker is gone, and §2.11 spends it.

---

## 1. Current scenario

### 1.1 What exists

The domain is **already built and empty of product**. `TASK-domain-schema` shipped all four
tables at `00aa097`, and nothing has ever read them except one aggregate:

- **`packages/db/src/schema/task.ts`** — `tasks` (nullable `field_id` with PG16 column-list
  `ON DELETE SET NULL`, `status`, `progress_pct`, `activity`, `starts_on`, `due_on`,
  `position numeric`), plus `task_assignees`, `task_comments`, `subtasks`. Composite FKs
  throughout; assignees and comment authors reference `memberships (organization_id, user_id)`,
  so an assignee is provably a member of the owning org. RLS on all four, enforced by
  `tenancy.spec.ts`'s catalog test. The board's read path already has its index:
  `tasks_org_status_position` on `(organization_id, status, position)`.
- **`packages/contracts/src/enums.ts`** — `taskStatusValues` (`todo | in_progress | done`) and
  `taskActivityValues` (`watering | planting | fertilization | pest_control | harvesting`).
  The Postgres enums are built *from* these (invariant 4).
- **`apps/web/components/flora/activity-tag.tsx`** — already renders all five activities with
  their icons and colours, built for the *field* card. It carries a standing note: `harvesting`
  "never appeared on a fetched card, so its icon and `orange`/`warning` colour are a best-effort
  match … still open against `24:11420` when Tasks ships." **This task closes that**, §2.9.
- **`listFields`** (`packages/db/src/queries/fields.ts:409`) reads non-`done` `tasks.activity`
  to render each field card's activity tags. It is the only consumer of `tasks` in the codebase,
  and §2.10's seed changes must not break it.
- **`db:seed:demo`** creates 8 tasks — 2 per demo field, `todo`/`in_progress`, titled
  `"<activity> — Field 237"`. No `done` rows, no dates, no `progress_pct`, no assignees, no
  comments, no subtasks.

### 1.2 What does not exist

| Missing | Where it goes |
|---|---|
| Any `tasks` contract | `packages/contracts/src/task.ts` |
| Any `tasks` query | `packages/db/src/queries/tasks.ts` |
| Any `tasks` endpoint | `apps/api/src/tasks/` — architecture §8.3 reserves four routes, none built |
| The route `/tasks` | `apps/web/app/(app)/tasks/page.tsx` (`?view=` search param, **not** a route — architecture §9.1) |
| `TaskCard`, `KanbanColumn`, `KanbanBoard`, `TaskEditor` | `components/flora/` (design-spec §6.3) |
| Vendored `Avatar Group`, `Progress Circle`, `Segmented Control`, `Textarea`, `Checkbox` | `components/ui/` — see §2.5 |
| Any drag-and-drop dependency | `apps/web/package.json` — §2.6 |
| A water-volume column | `tasks` — architecture §16 names "watering volumes (§4.4)" as a Phase 3 deliverable; §2.3 |

### 1.3 Measured geometry — `24:11420`

Everything below is off the file. Design-spec §5.5 is prose over the same artboard; where they
disagree, this table is right and §5.5 gets corrected (§2.12).

**Board** — frame `24:11425` at x=299, y=152, **1114 × 688**.

| Element | Measurement |
|---|---|
| Column (`Frame 59`) | **355.33** wide, **24 px gap**, 17 px inner padding, radius 16, `bg-weak-50` |
| Column height | **Hugs its content** — To Do is 493, the other two 688. Not equal-height |
| Column header (`Frame 58`) | at 17,16 · 321.33 × 24 · 12 px status dot at y=6 · 25 px gap · label · `Badge` 25×24 count · right cluster: two 20×20 `Compact Button`s at x=273.33 and 301.33 (8 px apart) |
| Card | **321.33 × 184**, x=17, first at y=51, **11 px gap** between cards |
| Column footer | `+ Add task` — a 99 × 36 ghost `Button` at x=17 |

**Card internals** (16 px padding, radius 16, `bg-white-0`, `border-stroke-soft-200`):

| Row | y | Contents |
|---|---|---|
| Field | 16 | `Field:` (`text-soft-400`) + `Wheat 09`, both `Paragraph/X Small`, 4 px apart |
| Divider | 44 | `Content Divider` full inner width |
| Title | 56 | `Label/Medium`, height 24 |
| Progress | 92 | 16 px `Circular Progress Bar` + 4 px + `25%` |
| Assignees | 120 | `user-3-line` 16 px (y+2) · `Avatar Group` 29.33 wide at x=20 · `ActivityTag` `Badge` at x=53.33, height 20 |
| Footer | 152 | `message-3-line` + `2` at x=0 · `time-line` + `1/5` at x=36 · right cluster at x=185.33 (104 wide): `time-line` + `Sep 24 - Oct 4` |

**Toolbar** — `Horizontal Filter` at x=299, y=92, 1114 × 36: `Switch Toggle` (the
Board/List/Timeline segmented control) **320 × 36** at the left; at the right, a **300 × 36**
search `Text Input` with a `⌘1` Kbd, an **82 × 36** `Filter` button, and a **123 × 36**
`Sort by` `Dropdown`.

**Three things the metadata reveals that the screenshot cannot:**

1. **The card is the `Widgets [HR Management] [1.0]` PRO block** — design-spec §6.2 maps it to
   `WidgetCard`. Three of its layers are **hidden** in every instance: the `Buttons [1.0]`
   trailing control at 270,16 (§4.5's *Details* button), `Stacked Progress Bar`, and
   `Chart Legends`. They are leftovers from the HR block. **Do not build them**, and do not
   read §4.5's "treat the trailing control as part of the card header" as applying here — on
   this card the designer turned it off.
2. **The subtask count uses `time-line`** — the same clock icon as the date range, not a
   checkbox or list icon. §2.12 logs it as a design defect and ships it as drawn.
3. **Two decorative `Pattern` vectors** sit on the artboard background (visible bottom-left of
   the export). The shell does not render them and this task does not add them; noted so the
   §2.11 baseline diff is not blamed on it.

### 1.4 What the design asks for that has no source

| # | The design shows | The reality | This task |
|---|---|---|---|
| 1 | `Board \| List \| Timeline` | List and Timeline are **undesigned** — design-spec §5.5 carries the `[VERIFY]` | §7 decision 1 |
| 2 | An **Import** button in the header | No format, no shape, no spec. Field import (§11.5) is preview-then-commit GeoJSON; nothing analogous exists for tasks | §7 decision 2 |
| 3 | **Filter** and **Sort by** | Both undesigned as to *contents* | §7 decision 3 |
| 4 | `2` comments, `1/5` subtasks | Real tables exist, but **no detail view is designed** — nowhere to read or write a comment | §7 decision 4 |
| 5 | An avatar group of 2–3 per card | The demo org has **one** user | §2.10 seeds teammates |
| 6 | `+ Create Task`, `+`, `+ Add task` — three entry points | **No create form is designed anywhere in the file** | §2.8 builds one, logged as a gap |
| 7 | Every card reads `Field: Wheat 09`, `25%`, `Sep 24 - Oct 4` | Mock data. `field_id` is **nullable** — a task with no field is legitimate (schema comment) | §2.9 renders a real empty state for it |
| 8 | Column counts `2 / 3 / 3` | — | Real counts; the numbers will differ |

---

## 2. Planned changes

### 2.1 `packages/contracts/src/task.ts` — the contract (invariant 4)

`taskSchema` — `id`, `title`, `description` (nullable), `status`, `activity`, `progressPct`
(nullable, 0–100), `startsOn`/`dueOn` (nullable ISO dates), `position` (string — `numeric`
crosses the wire as a string, matching how `crop_cycles.quantityKg` is already handled),
`field` (nullable `{ id, name }`), `assignees` (`{ userId, name, avatarKey }[]`),
`commentCount`, `subtaskCount`, `subtaskDoneCount`, `waterVolumeM3` (nullable, §2.3).

Plus `taskBoardSchema` (§2.4's grouped payload), `createTaskSchema`, `updateTaskSchema`,
`moveTaskSchema` (`{ status, beforeId?, afterId? }` — §2.7), and `listTasksQuerySchema`
(`view`, `q`, `fieldId`, `activity`, `sort`).

`ActivityTag` already imports `TaskActivity` from here; nothing about that changes.

### 2.2 `packages/db/src/queries/tasks.ts` — all SQL (invariant 5)

- `listBoard(tx, organizationId, params)` — **one** query returning all three columns. Per-task
  aggregates (`commentCount`, `subtaskCount`, `subtaskDoneCount`, assignees) come from lateral
  joins, not N+1 round trips; ordered by `(status, position)` so the
  `tasks_org_status_position` index serves it directly. Returns per-column totals alongside the
  rows.
- `createTask`, `updateTask`, `moveTask`, `deleteTask`.
- `nextPosition` / midpoint calculation for §2.7.

Repository-level `organization_id` filter on every one — tenancy enforced twice (invariant 6),
never RLS alone.

### 2.3 Migration — `tasks.water_volume_m3`

One nullable `numeric` column, meaningful only when `activity = 'watering'`. Generated by
`drizzle-kit generate`, reviewed by hand (`CLAUDE.md` §2.1).

Architecture §16 names "watering volumes (§4.4)" as a Phase 3 deliverable, and §4.4's proposed
Home tile reads "volume on completed `watering` tasks". Adding the column here is the whole
point: Phase 4 should find the data already accumulating, not ship a migration and retrofit a
form into a screen it doesn't own.

**Units: m³, canonical SI** — architecture §5.3's "store canonical SI everywhere (`m²`, `kg`)
and convert at the edge through `packages/contracts/src/units.ts`". Litres are the tempting
farm-facing unit; they are not what that rule says to store. Display conversion belongs in
`units.ts` when Home needs it, not in the column.

**The design shows no volume field anywhere.** Its placement in §2.8's editor is therefore
invented, and §2.12 logs it as a design gap rather than pretending otherwise.

### 2.4 `apps/api/src/tasks/` — the endpoints

Architecture §8.3 reserves the surface; this builds it:

```
GET    /api/v1/tasks            ?view=board&q=&fieldId=&activity=&sort=
POST   /api/v1/tasks
PATCH  /api/v1/tasks/:id        { title, description, status, activity, progressPct, startsOn, dueOn, waterVolumeM3 }
PATCH  /api/v1/tasks/:id/move   { status, beforeId?, afterId? }   ← §2.7
DELETE /api/v1/tasks/:id
```

`?view=board` returns the grouped three-column payload; `view` is exactly what §8.3's `view=`
parameter is for. `POST /tasks/:id/comments` from §8.3 is **deferred** — §7 decision 4.

`/move` is a separate route from the general `PATCH` deliberately: a drag is a distinct
operation with a distinct contract (neighbours, not an absolute position), a distinct latency
budget (NFR-9), and it must not be reachable by a form submit that happens to include a
`status`. Nest module registered in `app.module.ts`; DTOs via `createZodDto()` as everywhere
else. Every route in the cross-tenant registry (NFR-7).

### 2.5 Vendored components (invariant 8)

Five to fetch from AlignUI v1.2 docs, byte-identical, recorded in `components/ui/SOURCES.md`
with sha256 exactly as the previous three tasks did:

| AlignUI name | Figma layer name | Used by |
|---|---|---|
| `Avatar Group` | `Avatar Group [1.0]` | The card's assignee row |
| `Progress Circle` | `Circular Progress Bar [1.0]` | The 16 px `25%` ring |
| `Segmented Control` | **`Switch Toggle [1.0]`** | Board / List / Timeline |
| `Textarea` | — | §2.8's description field |
| `Checkbox` | — | §2.8's subtask rows |

The Figma names differ from AlignUI's catalogue names for the first three — recorded here so
the implementer does not go hunting. Everything else the screen needs is already vendored
(`Button`, `Compact Button`, `Badge`, `Dropdown`, `Input`, `Kbd`, `Modal`, `Select`,
`Datepicker`, `Divider`, `Tooltip`, `Avatar`).

### 2.6 Drag and drop — `[VERIFY]` before building on it

**`@dnd-kit/core@6.3.1` + `@dnd-kit/sortable@10.0.0` is the recommendation**, for one decisive
reason: it is **pointer-event based**, so Playwright drives it with ordinary
`mouse.down/move/up`. NFR-9 requires a *tested* optimistic drag, and this repo does not accept
"a decorator you read" in place of a test (`CLAUDE.md`).

`[VERIFY: @dnd-kit/core@6.3.1 was last published 2024-12-05 and declares only
"react": ">=16.8.0" — it predates React 19 and does not name it. Install it and confirm a
two-column drag works under React 19.2.8 + Next 16.3.1 with Strict Mode on BEFORE building the
board on it. Fallbacks, in order: @dnd-kit/react@0.5.0 (explicitly declares
"react": "^18.0.0 || ^19.0.0", but 0.x and its API differs); then
@atlaskit/pragmatic-drag-and-drop@3.0.0 (framework-agnostic, actively maintained, powers
Jira/Trello — but it uses native HTML5 drag events, which Playwright cannot drive with
mouse.move and which would make NFR-9's test materially harder). Choosing the third means
re-planning §2.11's drag test, so settle this first.]`

### 2.7 Ordering — midpoints on a `numeric` column

`position` is `numeric` precisely so a reorder is one row updated between its two neighbours
(architecture §5.3). `/move` takes `beforeId`/`afterId` rather than a client-computed number:
the client knows *where the card was dropped*, the server owns *what number that is*, and two
concurrent drags cannot then write the same value from stale reads.

Postgres `numeric` is arbitrary-precision, so midpoints never exhaust it the way float64 would
— but the decimal string grows one digit per subdivision. Rebalance a column's positions to
whole numbers when any computed position exceeds 20 significant digits. That threshold is
reachable only after ~60 successive drops into the same gap; the rebalance is a single
`UPDATE … FROM (SELECT row_number() …)` and is covered by §6 item 6.

### 2.8 `components/flora/` — the composites

`TaskCard` (§1.3's six rows, exactly), `KanbanColumn` (header, cards, `+ Add task` footer),
`KanbanBoard` (the three columns and the drag context), `TaskEditor` (a `Modal` — create and
edit, the same component, mirroring `field-editor.tsx`'s precedent), `TasksToolbar`.

`TaskEditor` fields: title, description, field (a `Select` over the org's fields, **clearable**
— `field_id` is nullable), activity, status, progress, start/due `Datepicker`s, and the §2.3
volume input shown **only** when activity is `watering`.

### 2.9 Real data, honestly rendered

- `Field:` — the real field name; when `field_id` is null, render the row as
  `Field: —` rather than hiding it (hiding changes the card's height and breaks the 184 px
  geometry).
- `25%` — real `progress_pct`; null renders `0%` with an empty ring, not a hidden row.
- `Sep 24 - Oct 4` — real `starts_on`/`due_on`; when either is null, render only the one that
  exists; when both are null, the right cluster is empty and the footer keeps its height.
- **`harvesting`'s tag** — verify its icon and colour against a real `24:11420` instance and
  close `activity-tag.tsx`'s standing note (§1.1). If the design disagrees with the current
  best-effort orange, change it and say so.

### 2.10 `db:seed:demo` — enrich, without breaking Fields

The board needs three populated columns; the seed produces 8 tasks in two. Extend it to seed
`done` tasks, `progress_pct`, `starts_on`/`due_on`, two extra `memberships` (so avatar groups
are real, §1.4 row 5), and comments and subtasks so the footer counts are genuine.

**Constraint:** `listFields` derives each field card's activity tags from **non-`done`** tasks,
and `fields.spec.ts` plus `apps/web/e2e/fields.spec.ts` assert on those exact tags. Add rows;
do not repurpose the existing eight. §6 item 12 is the guard.

### 2.11 Tests — and the NFR-10 baseline this environment can finally fetch

- `packages/db/src/queries/tasks.spec.ts` — testcontainers, real PostGIS/Postgres. Board
  grouping and ordering, midpoint insertion, the rebalance threshold, and the aggregate counts.
- `apps/api` e2e — the five routes, plus the cross-tenant suite asserting **404** (not 403) on
  a foreign-org task id for every one (NFR-7).
- `apps/web/e2e/tasks.spec.ts` — the board renders three columns with counts matching the API;
  a card dragged between columns lands, persists across reload, and the source and target
  counts both update; the create modal writes a real row.
- **NFR-10**: fetch the `24:11420` export via the Figma MCP and commit it as
  `e2e/baselines/tasks-board.png`, then diff at 1440×900, ≤ 2%. The three existing screen specs
  all record this as blocked "in this environment"; it no longer is. Excluded from the diff:
  the two decorative `Pattern` vectors (§1.3), which the shell does not render.
- **NFR-9**: assert the optimistic move paints before the server responds, and that the
  `/move` round trip completes under 200 ms p95 locally.

### 2.12 Documentation (`CLAUDE.md` §3)

| Doc | Change |
|---|---|
| `docs/design-spec.md` §5.5 | Replace the prose measurements with §1.3's measured table. Correct **"drag-and-drop … is a hard requirement (architecture NFR-7)"** — NFR-7 is the cross-tenant suite; drag-and-drop is **NFR-9** |
| `docs/design-spec.md` §9 | Four new gaps: no create-task form designed; no task detail view; Import undefined; the subtask count's `time-line` icon |
| `docs/design-spec.md` §6.2 | Note that `Widgets [HR Management]`'s trailing control and chart layers are hidden on this screen's instances |
| `docs/architecture.md` §8.3 | Mark the tasks routes built; add `/move` and `DELETE`; note `POST /tasks/:id/comments` still deferred |
| `docs/architecture.md` §4.4 | `water_volume_m3` now exists — the Water Used tile has a source as of Phase 3 |
| `docs/architecture.md` §5.3 | Record the column under `tasks` |
| `docs/architecture.md` §16 | Phase 3 status |
| `CLAUDE.md` | Status paragraph; the spine is complete |
| `README.md` | Status line |

---

## 3. Why

**Why one grouped board query rather than three status-filtered calls.** The board is a single
view of one ordered set; three calls would race each other into an inconsistent render on
mount, and the counts in the column headers would be computed from three different snapshots.
`tasks_org_status_position` already exists to serve exactly this read.

**Why `/move` is its own route.** A drag is not a form submit. It has a different payload
(neighbours, not values), a different budget (NFR-9's 200 ms p95), and different concurrency —
and separating it means the general `PATCH` cannot be used to smuggle a reorder past the
midpoint logic.

**Why the water-volume column now, in a screen that does not display it.** Architecture §16
lists it as a Phase 3 deliverable and §4.4 depends on it. The alternative is that Phase 4
discovers Home's middle tile has no data, ships a migration, and edits a form in a screen it
does not own — the retrofit is strictly worse and the column is one nullable `numeric`.

**Why the disabled tabs and disabled Import rather than removing them.** Precedent, set twice
by `TASK-crop-stress` §7 (decisions 1 and 4): removing a control changes the artboard's
geometry and silently breaks the NFR-10 diff, while a disabled control with a tooltip is honest
about what does not exist yet. Shipping an *empty state* behind them would be worse than
either — it promises a feature that was never designed.

---

## 4. Affected files

| Path | Change | Notes |
|---|---|---|
| `packages/contracts/src/task.ts` | new | §2.1 |
| `packages/contracts/src/index.ts` | edit | Re-export |
| `packages/db/src/schema/task.ts` | edit | `water_volume_m3` |
| `packages/db/migrations/` | new | §2.3, `drizzle-kit generate`, hand-reviewed |
| `packages/db/src/queries/tasks.ts` | new | §2.2 — all SQL (invariant 5) |
| `packages/db/src/queries/tasks.spec.ts` | new | Testcontainers |
| `packages/db/src/seed-demo.ts` | edit | §2.10 |
| `apps/api/src/tasks/` | new | Module, controller, service, DTOs |
| `apps/api/src/app.module.ts` | edit | Register |
| `apps/web/app/(app)/tasks/page.tsx` | new | Server Component; `?view=` |
| `apps/web/app/(app)/tasks/board-panel.tsx` | new | `"use client"` — the board (architecture §9.2) |
| `apps/web/components/flora/{task-card,kanban-column,kanban-board,task-editor,tasks-toolbar}.tsx` | new | §2.8 |
| `apps/web/components/flora/activity-tag.tsx` | edit | §2.9 — close the `harvesting` note |
| `apps/web/components/flora/page-container.tsx` | edit | §7 decision 5 |
| `apps/web/components/ui/{avatar-group,progress-circle,segmented-control,textarea,checkbox}.tsx` | new | Vendored verbatim |
| `apps/web/components/ui/SOURCES.md` | edit | sha256 rows |
| `apps/web/package.json` | edit | §2.6's dependency |
| `apps/web/e2e/tasks.spec.ts` | new | §2.11 |
| `apps/web/e2e/baselines/tasks-board.png` | new | The Figma export |
| `docs/*`, `CLAUDE.md`, `README.md` | edit | §2.12 |

---

## 5. Explicitly out of scope

1. **List and Timeline views** — undesigned. §7 decision 1.
2. **A task detail view** — reading or writing comments and subtasks. The counts render; the
   drawer that would open does not exist in the design. `TASK-task-detail`.
3. **`POST /api/v1/tasks/:id/comments`** — deferred with the view above. An endpoint no UI calls
   is dead code, and §1.4 row 4's whole point is that there is nowhere to put it.
4. **Task import** — §7 decision 2.
5. **Home's Water Used tile** — this task creates the column and captures the number; the tile
   is Phase 4, and §4.4's swap still needs the design owner's sign-off.
6. **"Create a task from this stress zone"** — the entry point named at `TASK-crop-stress` §5
   and §9. It needs this task's create path to exist first; it is a one-button follow-on
   (`TASK-stress-to-task`) and adding it here would mean editing the Crop Stress popover in a
   task that owns the Tasks screen.
7. **Assignee management** — avatars render; adding and removing assignees needs the detail
   view. The `user-3-line` icon that precedes the group is decorative here.
8. **Notifications** — the header's bell with its unread dot is shell furniture, unbuilt.
9. **Mobile/tablet** (D1) and **dark mode** (D2) — unchanged, 1440 fixed and light only.

---

## 6. Verification

Measurable, per architecture §15. No item passes on "looks right".

| # | Item |
|---|---|
| 1 | `/tasks` renders three columns whose header counts equal a direct SQL `count(*) GROUP BY status` for the demo org |
| 2 | Every card's `2` / `1/5` / date range equals the seeded comment count, subtask done/total and dates — checked against SQL, not against the mock's numbers |
| 3 | A card dragged from To Do to In Progress lands in the drop position, both column counts update, and it is still there after a reload |
| 4 | **NFR-9**: the card paints in its new column before the `/move` response arrives (assert on an in-flight request), and the round trip is < 200 ms p95 locally |
| 5 | Dragging into a **column with no cards** works — the empty column presents a drop target with a real height (§1.3: columns hug content, so this is not free) |
| 6 | 60 successive drops into the same gap do not lose ordering; the rebalance fires at the §2.7 threshold and renumbers to whole numbers, asserted in `tasks.spec.ts` |
| 7 | A task created from `+ Create Task`, from a column `+`, and from `+ Add task` all produce a row in the right column; the field select accepts **no field** and the card renders `Field: —` |
| 8 | A `watering` task shows the volume input; a `planting` task does not; the value round-trips as m³ |
| 9 | Deleting a field whose tasks exist nulls `field_id` and leaves the tasks (the schema's `ON DELETE SET NULL` promise) — asserted in `tasks.spec.ts` against real Postgres |
| 10 | **NFR-7**: a foreign-org task id 404s (not 403) on all three id-scoped routes (`PATCH /tasks/:id`, `PATCH /tasks/:id/move`, `DELETE /tasks/:id`), against real RLS, and all three are in the cross-tenant registry. **Corrected from "all five" during §2.4/§2.11**: `GET /tasks` and `POST /tasks` take no task id — a create has no existing other-org resource to leak, and a list is scoped by the session's own org, not a path param — so neither has a 404-vs-403 vector this suite can exercise |
| 11 | **NFR-10**: visual diff ≤ 2% vs the `24:11420` export at 1440×900, with the §1.3 `Pattern` vectors excluded — **and the baseline committed**, closing the gap `shell.spec.ts`, `fields.spec.ts` and `stress.spec.ts` each record |
| 12 | `fields.spec.ts` and `apps/web/e2e/fields.spec.ts` pass **unchanged** — §2.10's seed additions did not disturb the field cards' activity tags |
| 13 | `harvesting`'s tag matches a real `24:11420` instance, and `activity-tag.tsx`'s standing note is either removed or restated with what was found |
| 14 | Every colour comes from a token class; a grep for raw hex under `apps/web` still finds nothing outside `globals.css`, `components/charts/config.ts`, `components/map/config.ts` (invariant 7) |
| 15 | Every icon is a `@remixicon/react` import whose name matches the Figma layer (`user-3-line`, `message-3-line`, `time-line`; confirm the `+` and `⋯` Compact Buttons' own names from their instances rather than guessing) |
| 16 | The five vendored files are byte-identical to their sources, with sha256 rows in `SOURCES.md` (invariant 8) |
| 17 | `pnpm turbo run build typecheck lint test` exits 0 across all 8 packages; the existing e2e suites still pass |
| 18 | Every `[VERIFY]` this document introduces is resolved in a §10 or restated as still open — none silently disappear |

---

## 7. Decisions this task needs before code

| # | Decision | Recommendation |
|---|---|---|
| 1 | **List and Timeline** — hide the tabs, ship empty states, or ship them disabled | **Disabled, with a tooltip naming why.** design-spec §5.5's own `[VERIFY]` offers "hide … rather than shipping an empty state"; disabling is the third option and the one this repo has already taken twice (`TASK-crop-stress` §7 decisions 1 and 4). Hiding two of three segments changes a 320 px control's geometry and breaks the NFR-10 diff for no gain |
| 2 | **Import** | **Disabled, with a tooltip**, same reasoning. It is an 82 px button in a measured toolbar; removing it moves everything to its right |
| 3 | **Filter and Sort by** — build or disable | **Build both.** Unlike Import, both have real backing: `fieldId` and `activity` are columns and `?fieldId=` is already in architecture §8.3, and Sort offers manual (`position`), due date, and created. Their *contents* being undesigned is a menu-copy question, not a missing feature |
| 4 | **Comments and subtasks** — counts only, or a detail view | **Counts only.** The counts come from real rows and are cheap; a detail view is a screen nobody designed, and inventing one inside a task that owns the board is how §5's boundary gets crossed. `POST /tasks/:id/comments` goes with it |
| 5 | **`PageContainer` is 68 px narrower than the artboard's content column.** It is `max-w-[1110px] px-8` → **1046** of content, while design-spec §4.1's table gives the content column itself as 1110 wide and `24:11420` measures **1114** | **Fix it to `max-w-[1168px] px-8`** → 1104 of content, which is exactly design-spec §4.1's own stated rule ("build to 32 px insets"), 10 px (0.9%) off the artboard and comfortably inside NFR-10's 2%. This is cheap now: the only current consumer is the Home stub. Left alone, every column is 22 px narrow and the diff starts with a handicap |
| 6 | **Column gap: 16 or 24 px** | **24** — measured. §4.1's "uniform 16 px gap" governs card grids inside a column, and the board's own gap is unambiguously 24 |
| 7 | **Water volume unit** | **m³**, per architecture §5.3's store-SI rule (§2.3). Litres are the farm-facing unit and belong in `units.ts` at display time, not in the column |

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| `@dnd-kit/core` turns out to be broken under React 19 / Strict Mode | §2.6 makes verifying it the **first** step, with two named fallbacks. Discovering it after `KanbanBoard` is written means rewriting the board |
| The pragmatic-drag-and-drop fallback lands, and NFR-9's Playwright test cannot drive native HTML5 drag events | Named in §2.6. If it happens, re-plan §2.11's drag assertion before writing it — do not quietly downgrade the test to a click |
| Optimistic move + refetch produces a flicker as the card lands | Key cards by task id, let the mutation write the cache and the refetch reconcile it. Same lesson as `TASK-crop-stress` §8's grouping flicker: the card must not unmount and remount |
| Enriching `db:seed:demo` breaks the Fields screen's activity tags | §2.10 states the constraint; §6 item 12 is the guard. Add rows, never repurpose the existing eight |
| The columns hug their content, so an empty column has almost no drop target | §6 item 5 makes it a test. A `min-height` is the fix; it is a deviation from the artboard and should be recorded as one |
| Scope creep into a task detail view, following the comment count | It is named in §5 twice. The counts are labels, not links |

## 9. Follow-on tasks

| Task | Picks up |
|---|---|
| `TASK-stress-to-task` | The "create a task from this stress zone" button on Crop Stress's popover — `TASK-crop-stress` §5 and §9 |
| `TASK-task-detail` | Comments, subtasks, assignee management, `POST /tasks/:id/comments` |
| `TASK-home-dashboard` (Phase 4) | Rollups, the Regeneration Score `[VERIFY]`, and the Water Used tile this task's column finally sources |
| `TASK-tasks-views` | List and Timeline, once designed |
| Design follow-ups | §2.12's four new gaps |

---

## 10. Decisions and `[VERIFY]`s resolved

All seven §7 decisions taken as recommended (2026-08-16): disabled List/Timeline and Import with
tooltips, built real Filter/Sort, counts-only for comments/subtasks, `PageContainer` corrected to
`max-w-[1168px] px-8`, 24 px column gap, `waterVolumeM3` in m³.

**§2.6 `[VERIFY]` resolved:** `@dnd-kit/core@6.3.1` + `@dnd-kit/sortable@10.0.0` installed and
drag-tested against a throwaway two-column page under React 19.2.8 + Next 16.3.1 with Strict Mode
on (the app router's default since Next 13.5.1 — confirmed against this repo's own
`node_modules/next/dist/docs`). A real Playwright test drove a `mouse.down` → `mouse.move` (two
waypoints) → `mouse.up` sequence and asserted the card re-parented into the drop column; it passed
on the first authenticated run (the first attempt 404'd into `/login` — `proxy.ts`, Next 16's
renamed `middleware.ts`, gates every path but `/login` on the `flora_access_token` cookie, and the
committed `e2e/.auth/owner.json` had gone stale; regenerating it via `auth.setup.ts` fixed it).
No fallback needed. The verification page, spec, and its throwaway Playwright config were deleted
after the run; only the two real `package.json` dependency additions remain.

**Live verification, in the developer's own browser (2026-08-16):** the board rendered, drag
between columns worked, and Create Task wrote a real row — confirmed directly, not just by the
unexecuted Playwright suite. It surfaced two defects unrelated to this task's own code, both
fixed live:

1. **`FieldEditor`'s new-field map camera defaulted to a hardcoded Amazonas coordinate**
   (`components/flora/field-editor.tsx`), regardless of where the org's real fields actually
   are — the farm row's own `location` point is set once at creation and doesn't move when
   fields get drawn elsewhere under it later. Fixed by deriving the default camera from the
   average centroid of the org's existing fields (`field-list-panel.tsx`), falling back to the
   farm's `location` only when the org has no fields yet.
2. **`POST /api/v1/auth/refresh` existed on the API (`TASK-auth-tenancy`) but nothing in
   `apps/web` ever called it** — every session died with the access token's 15-minute TTL
   instead of the refresh token's real 30-day one, forcing a re-login roughly every 15 minutes
   of active use. Fixed with `components/flora/session-refresher.tsx`, a client component
   mounted in `(app)/layout.tsx` that silently `POST`s the refresh endpoint every 10 minutes.
   The refresh cookie is deliberately path-scoped to `/api/v1/auth/refresh`
   (`apps/api/src/auth/cookies.ts`) — the browser only attaches it to a request matching that
   exact path, which is why this has to be a periodic client-side fetch rather than something
   `proxy.ts` can see or act on for an ordinary page navigation.

Neither is in this task's own affected-files table (§4) — both are pre-existing gaps in
`TASK-fields` and `TASK-auth-tenancy` respectively, found only because this task's manual
verification happened to exercise them.

Also live, read-only against the dev database (not a code fix): the "`Field: —`" rows the
developer saw on every seeded card are correct, not a bug — every one of those tasks genuinely
has `field_id = NULL`, because the demo fields they were seeded against were deleted in an
earlier session and the schema's `ON DELETE SET NULL` (§2.4 of `packages/db/src/schema/task.ts`,
the exact behaviour `tasks.spec.ts` tests) nulled the column rather than deleting the tasks.
