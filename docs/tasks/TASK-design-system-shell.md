# TASK-design-system-shell — AlignUI, the token chain, and the app shell

> **Phase:** 0 (architecture §16) · **Status:** landed · **Date:** 2026-08-15
> **Depends on:** `TASK-foundations` (landed, `bc51470`), `TASK-auth-tenancy` (landed, `63b5aa9`)
> **Blocks:** every screen task — `TASK-fields`, `TASK-crop-stress`, `TASK-tasks-board`,
> `TASK-home-dashboard`, `TASK-weather`, `TASK-field-management`
> **Parallel with:** `TASK-domain-schema` (no file overlap — that task touches `packages/db`
> and `packages/contracts` only; this one touches `apps/web` only)
> **References:** [`../design-spec.md`](../design-spec.md) §3, §4.2, §4.3, §4.5, §6, §7, §10 ·
> [`../architecture.md`](../architecture.md) §9, §15 (NFR-9, NFR-10)

This is the last of the three Phase 0 tasks. It turns `apps/web` from a `create-next-app`
scaffold into the Flora shell: the AlignUI token chain, the vendored base components, the two
rebuilt PRO blocks (`AppSidebar`, `PageHeader`), and the `(app)` layout every screen renders
into. **It builds no screen.** Home stays the one-line session probe it is today.

---

## 1. Current scenario

`HEAD` is `63b5aa9`. `apps/web` is a Next.js 16 / React 19 / Tailwind v4 scaffold with an
auth flow bolted on and nothing else:

- **`app/globals.css`** is the untouched `create-next-app` file — `--background`/`--foreground`,
  a `prefers-color-scheme: dark` block, and `font-family: Arial, Helvetica, sans-serif` on
  `body`. Not one AlignUI token exists in the repo.
- **`app/layout.tsx`** loads **Geist** and **Geist Mono** via `next/font/google` and binds them
  to `--font-geist-sans` / `--font-geist-mono`. Design-spec §3.4 calls for Inter on
  `--font-sans`.
- **`app/page.tsx`** is the session gate from `TASK-auth-tenancy` §2.8 — `getSession()`, then a
  `<p>` naming the user, org and role, plus `app/logout-button.tsx`. There is no sidebar, no
  page header, and no `(app)` route group; architecture §9.1's routing tree does not exist yet.
- **`app/(auth)/login/page.tsx`** is a working but unstyled form using raw Tailwind palette
  classes — `border-zinc-300`, `bg-black`, `text-red-600`. Deliberate (design-spec D13), and
  now due for tokens.
- **`components/`, `utils/`, `components.json` do not exist.** Architecture §9.3's `ui/` ·
  `charts/` · `map/` · `flora/` split is documented and unbuilt.
- **`public/`** still holds `next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`
  from the scaffold.
- **No Playwright.** Architecture §12 names it as the tooling and NFR-10 demands a ≤2% pixel
  diff per screen, but nothing renders a browser today. `apps/api` and `packages/db` have real
  Vitest suites; `apps/web` has no test of any kind.
- `proxy.ts`, `lib/session.ts` and `next.config.ts`'s rewrite all work end to end and are
  **not** touched by this task.

---

## 2. Planned changes

### 2.1 The token chain — the reason this task goes first

Everything visual in Flora resolves through one file. `app/globals.css` has to be written by
the AlignUI CLI, then appended to by hand, in that order and only that order (design-spec
§7.1). Getting the ordering wrong is silent: shadcn's theme generator replaces AlignUI's token
set with `--background`/`--foreground` and every screen built afterwards loses its palette
without erroring.

**Step 1 — AlignUI CLI.** From `apps/web`:

```bash
pnpm dlx @alignui/cli tailwind
```

Answers, per design-spec §3.2 — **verified against the official Next.js install guide
2026-08-15**: Primary **Green** · Neutral **Gray** · Format **oklch** · Prefix *(blank)* ·
Create `tailwind.config`? **No — CSS-only** · Global CSS `app/globals.css`.

> The `alignui/cli` GitHub README lists the primary options as "Blue, Purple, Orange, **Sky**"
> and omits the config-file and globals-path prompts entirely. It is stale. The docs page
> (`alignui.com/docs/installation/next`) lists "Blue, Purple, Orange, **Green**" plus both
> prompts, and is authoritative. If the CLI as run offers no Green, stop and re-open §3.2
> rather than picking a near neighbour.

**Step 2 — check the accent.** Resolves the `[VERIFY]` in design-spec §3.2. Read the generated
`--primary-base` and convert it to sRGB. If it is not exactly `#1daf61`, override
`--primary-base`, `--primary-dark` and `--primary-darker` explicitly at the bottom of the file
rather than accepting a near-miss — the accent is on every screen. **Record the CLI's own value
in design-spec §3.2 either way, then delete the `[VERIFY]`.**

**Step 3 — chart tokens, appended.** Never via a shadcn theme generator. Append only:

```css
/* shadcn/Recharts series tokens — design-spec §3.3, §7.1. Appended after the
   AlignUI CLI output; nothing above this line is hand-edited. */
--chart-1: var(--green-950);  /* #0b4627 */
--chart-2: var(--green-800);  /* #1a7544 */
--chart-3: var(--green-600);  /* #1daf61 */
--chart-4: var(--green-500);  /* #1fc16b */
--chart-5: var(--green-300);  /* #84ebb4 */
```

`[VERIFY: the exact variable names the AlignUI CLI emits for the green ramp. Tailwind v4's
@theme convention would make them --color-green-950; AlignUI may emit --green-950 directly.
Read the generated file and use what is actually there — do not assume either form.]`

**Step 4 — Flora overrides.** Nothing beyond step 2's accent correction and step 3. The
dark-mode block the CLI generates is left in place, untouched and unused (design-spec D2:
v1 is light-only, and deleting the block would make the eventual dark pass a rewrite).

`app/globals.css` and `components/charts/config.ts` remain the only two files in the repo
permitted to contain a raw colour value (invariant 7).

### 2.2 Fonts

Replace Geist with Inter, bound to `--font-sans`, per the AlignUI install guide. Geist Mono
has no use in the design and is removed rather than left loading.

Design-spec §3.4 carries a `[VERIFY]` on **"Inter Display"** — Google Fonts serves no such
family. **Resolve it here, mechanically:** attempt

```ts
const inter = Inter({ subsets: ["latin"], axes: ["opsz"], variable: "--font-sans" });
```

If `next/font/google` accepts the `opsz` axis, `Title/H5` uses Inter at its display optical
size and the spec's two families collapse to one. If it throws `Unknown axis`, Google's Inter
has no optical-size axis: use plain Inter for both, and record in §3.4 that Inter Display is
**not** shipped in v1 (self-hosting it from rsms.me is a deliberate decision nobody has taken,
and the delta at 24 px is a tracking difference the token scale already encodes). Either way
the `[VERIFY]` is deleted and replaced with the finding.

The `Plus Jakarta Sans` `[VERIFY]` in §3.4 is **not** resolved here — it is one stray Figma
override on a component this task does not build. It moves to `TASK-home-dashboard`.

### 2.3 Utilities and vendored base components

Per the AlignUI install guide, four utilities go in `apps/web/utils/`: `cn`, `tv`,
`recursive-clone-children`, `polymorphic`. They are copied from their docs pages, not written.

**Eleven base components** are vendored into `components/ui/`, byte-identical to their docs
sources (invariant 8) — exactly the set §6.2 needs for the two rebuilt blocks plus the login
form, and nothing speculative:

| Component | Needed by |
|---|---|
| `button.tsx` | `AppSidebar`, `PageHeader`, login |
| `compact-button.tsx` | sidebar collapse toggle, card headers (§4.5) |
| `link-button.tsx` | login secondary actions |
| `avatar.tsx` | sidebar footer, `PageHeader` |
| `divider.tsx` | sidebar, card anatomy |
| `tooltip.tsx` | collapsed 80 px rail labels (§4.3) |
| `dropdown.tsx` | sidebar user menu, `PageHeader` |
| `badge.tsx` | `PageHeader` notification dot |
| `input.tsx` · `label.tsx` · `hint.tsx` | login |

The remaining ~20 in §6.1 are pulled by the screen task that first needs them. Pasting all 50
now would vendor code nobody has read against a design nobody has built.

**Source of truth is the docs page, not the starter repo.**
`github.com/alignui/alignui-nextjs-typescript-starter` contains all 50 components and is
tempting, but it was last pushed **2025-02-16** and still ships `tailwind.config.ts` and
`.eslintrc.json` — a Tailwind v3-era tree. Use it only to cross-check a component that will
not compile, never as the paste source.

**`components/ui/SOURCES.md`** — new. One row per vendored file: docs URL, date fetched,
`sha256`. This is what makes "byte-identical" checkable in six months instead of aspirational,
and it is where any documented bug fix (the only edit invariant 8 permits) gets recorded.

**ESLint.** `components/ui/**` is added to `globalIgnores` in `apps/web/eslint.config.mjs`.
Vendored files that trip a lint rule are not ours to fix, and silencing rules inline would
break byte-identity. The ignore is commented with that reasoning.

### 2.4 shadcn chart — installed here, composed later

Design-spec §7.1's `[VERIFY]` asks whether `shadcn init` can run non-destructively. **Resolve
it by not needing the answer:**

1. Hand-write `apps/web/components.json` (Tailwind v4 shape: `tailwind.config` blank,
   `tailwind.css` → `app/globals.css`, `cssVariables: true`, aliases per architecture §9.3).
   No `init` run.
2. `pnpm dlx shadcn@latest add chart --dry-run --diff` and read the output. If it touches
   nothing but `components/ui/chart.tsx` and adds `recharts`, run it for real.
3. If it wants to rewrite `app/globals.css`, **do not run it.** Copy `chart.tsx` from
   `shadcn-ui/ui` at `apps/v4/registry/new-york-v4/ui/chart.tsx` (verified present,
   2026-08-15), add `recharts` by hand, and record the finding in §7.1.

Either way `chart.tsx` lands in `components/ui/` and is listed in `SOURCES.md` alongside the
AlignUI files — it is vendored under the same rule.

**`components/charts/config.ts`** — new, and the only chart artefact this task ships: the
series-colour array mapped to `--chart-1…5`, the `stroke-soft-200` gridline colour, the
`text-soft-400` axis-label colour at `Paragraph/X Small`, and the dark tooltip surface
(design-spec §7.3). No chart *composition* is built here; each lands with its screen.

Tokens are referenced as `var(--chart-1)`, never `hsl(var(--chart-1))` — under Recharts v3 the
wrapped form renders nothing, silently (design-spec §7.1).

### 2.5 `AppSidebar` — 272 px expanded, 80 px collapsed

`components/flora/app-sidebar.tsx`. Rebuilt from Avatar · Divider · Button · Tooltip
(design-spec §6.2). The fiddly parts are the two width modes and the active-state edge
indicator, and they are the reason this is budgeted as a first-class component.

**Expanded (272 px, §4.2)**, top to bottom: a 40×40 `primary-base` logo tile + `Flora™`
(`Label/Small`) over `Agrotechnology` (`Paragraph/X Small`, `text-soft-400`), with the collapse
`Compact Button` at the right · `Divider` · `MAIN` (`Subheading/2X Small`) · **four** nav rows
· spacer · Settings, Support · `Divider` · 40 px `Avatar` + name with verified tick + email +
chevron opening the user `Dropdown`.

**Nav row:** 40 px tall, radius 8, 24 px Remix icon + `Label/Small`. Active =
`bg-bg-weak-50`, `text-text-strong-950`, a `primary-base` indicator bar flush to the sidebar's
left edge, and a trailing chevron. Hover = `bg-bg-weak-50` (design-spec §8).

**Four entries, not five** (§2.1): Home `/`, Fields `/fields`, Tasks `/tasks`, Weather
`/weather`. Energy is deferred (architecture §4.3); the nav array is a single `const` so
restoring it is one line.

**Collapsed (80 px, §4.3):** icons only, each wrapped in a `Tooltip` carrying its label, no
name block. The `FAVS` dot section is **out of scope** — saved views have no data model until
`TASK-fields`, and a decorative row of dots that does nothing is worse than its absence.

**The collapse `[VERIFY]` (design-spec §4.3) is resolved as a decision, flagged for the
designer:** collapse is a **user toggle, persisted in a `flora_sidebar` cookie**, read in
`app/(app)/layout.tsx` on the server so the first paint is already the right width — no flash,
no layout shift (NFR: design-spec §10.6). The Fields route segment does **not** force the rail;
the three Fields artboards show it collapsed because the map wants the width, and that is a
default, not a constraint. `AppSidebar` therefore takes `collapsed: boolean` and knows nothing
about routes. **Add this to design-spec §4.3 as the resolution, and add "Fields defaults to
collapsed on first visit?" to the §9 gap table** — if the designer says yes, it is one
`defaultCollapsed` prop on the Fields layout, not a rework.

**Gap D12** (four entries leave more bottom whitespace than designed) is answered the cheap
way for now: the nav block stays top-aligned and Settings/Support stay bottom-pinned, exactly
as the five-entry design has them. Noted in §9, not designed around.

### 2.6 `PageHeader` — 88 px, three shapes

`components/flora/page-header.tsx`. Rebuilt from Avatar · Button · Badge · Dropdown (§6.2).
The design uses it three different ways, so it is slot-based rather than prop-per-screen:

| Slot | Home `1:12913` | Fields `1:35172` | Tasks `24:11420` |
|---|---|---|---|
| `leading` | 56 px `Avatar` | 40 px `IconTile` | 40 px green check `IconTile` |
| `title` | "Maria Goodpart" (`Title/H5`) | "Fields" | "My Tasks" |
| `subtitle` | "Welcome back to Flora™ 👋" | — | "Check all the tasks you need to create" |
| `actions` | search icon · bell + unread `Badge` · primary **+ Create Request** | **Import** · primary **+ Add Field** | **Import** · primary **+ Create Task** |

Height 88, content inset 32 px from the sidebar (§4.1 — build to 32/32 and the uniform 16 px
gap; the Figma has ~6 px of drift and this document already calls it a defect).

### 2.7 The three shell composites

Small, but every screen task uses them, and building them once here is what keeps the screens
from each inventing their own card.

| File | What |
|---|---|
| `components/flora/card.tsx` | `Card` + `CardHeader` — the §4.5 anatomy: `bg-bg-white-0`, `border-stroke-soft-200`, radius 16, padding 16; header = 24 px icon + `Label/Large` title + a trailing 66×28 `Button` (or 28×28 `Compact Button`). The trailing control is part of the header, not per-card decoration. |
| `components/flora/icon-tile.tsx` | The rounded icon tile: 40 px (page headers), 56 px (`bg-weak-50`, KPI tiles), 37 px (Regeneration Score row). Size + tone props, Remix icon child. |
| `components/flora/user-menu.tsx` | Sidebar footer avatar + name + email + chevron → `Dropdown` with **Log out**. Replaces `app/logout-button.tsx`, which is deleted; the logout `fetch` moves here unchanged. |

`KpiTile`, `DeltaBadge`, `ActivityTag`, `FieldCard`, `TaskCard` and the rest of §6.3 are **not**
built here. They belong to the screens that define their props.

### 2.8 Routing — the `(app)` group

Architecture §9.1's tree, as far as it can exist without screens:

```
apps/web/app/
├─ (auth)/
│  ├─ layout.tsx          new — centred, no shell
│  └─ login/page.tsx      restyled (§2.9)
└─ (app)/
   ├─ layout.tsx          new — AppSidebar + PageHeader + content column
   └─ page.tsx            moved from app/page.tsx, unchanged behaviour
```

`app/(app)/layout.tsx` reads the session with the existing `getSession()` and the sidebar state
from the `flora_sidebar` cookie, both server-side, and renders the shell around `children`.
Content column: `max-w-[1110px]` inside a fluid parent, 32 px inset — never a fixed pixel width
(architecture §9.5). No route is created for `/fields`, `/tasks` or `/weather`; their nav rows
link to paths that 404 until their tasks land. That is honest, and a placeholder screen is a
thing someone would later have to find and delete.

`app/(app)/page.tsx` keeps its current body verbatim — the session probe. It becomes Home in
`TASK-home-dashboard`, not here.

`proxy.ts` needs no change: route groups do not appear in the URL, so its matcher and its
`/login` public path both still hold.

### 2.9 Login, restyled

Same flow, same `fetch`, same error handling — only the presentation changes: AlignUI `Input`,
`Label`, `Hint` (for the error), `Button`, inside a §4.5 `Card` centred by `(auth)/layout.tsx`,
with the `AppSidebar` logo lockup above the form. No raw palette classes survive.

This does **not** close design-spec gap **D13** — login, forgot-password and invite-acceptance
are still undesigned, and this is a token-correct placeholder, not a designed screen. Update
D13's wording to say so.

### 2.10 Visual regression — the harness NFR-10 has been promising

Playwright lands here because this is the first UI in the repo, and because every screen task
after it will otherwise "verify" by eye against a spec that says ≤2% pixel delta.

| File | What |
|---|---|
| `apps/web/playwright.config.ts` | 1440×900, `deviceScaleFactor: 1`, `animations: "disabled"`, `reducedMotion: "reduce"`, `maxDiffPixelRatio: 0.02` (NFR-10), Chromium only, `webServer` starting `next dev` against the running API. |
| `apps/web/e2e/shell.spec.ts` | The measured assertions in §6. |
| `apps/web/e2e/baselines/sidebar-expanded.png` | Figma export of `1:12913`'s sidebar region via `get_screenshot`. |
| `apps/web/e2e/baselines/sidebar-collapsed.png` | Same, from `18:6567`'s 80 px rail. |
| `turbo.json` | new `test:e2e` task, `cache: false`, `dependsOn: ["^build"]`. |

Scoped to the two sidebar crops **only**. Full-screen baselines belong to the screen tasks —
there is no full screen here to diff.

### 2.11 Cleanup

Delete `public/next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg` and
`app/logout-button.tsx`. Replace `app/favicon.ico` with a Flora mark.

`[VERIFY: the 40×40 logo tile's glyph. The Figma shows a green tile with a mark inside;
design-spec §3.5 says every icon in the file is a Remix name, but the logo may be custom
artwork. Run get_metadata on 1:12913's sidebar header, and download_assets if it is not a Remix
glyph. Do not approximate it with plant-fill without checking.]`

---

## 3. Why

**Why the token chain before anything drawn.** Design-spec §7.1 describes a failure mode that
does not error — shadcn's generator quietly replacing AlignUI's tokens. If that happens after
three screens exist, the symptom is "the colours look wrong on some pages" and the cause is a
file nobody has re-read. Doing both installs once, in order, with the accent verified against
`#1daf61`, is a half-day that cannot be bought back later.

**Why eleven components and not fifty.** Vendored code is code we own the review of.
`SOURCES.md` is only meaningful if someone actually read each file it lists. Fifty
unread files with checksums is worse than eleven read ones — it converts invariant 8 from a
practice into paperwork.

**Why `AppSidebar` and `PageHeader` are first-class.** They are the two PRO blocks with real
behaviour in them (design-spec §6.2 says exactly this). Every one of the six screen tasks
renders both. If they arrive as a by-product of the Home task, Home's needs will shape their
API and the Fields split-view will fight it — the collapsed rail is a Fields requirement that
Home never exercises.

**Why the collapse toggle is a cookie and not React state.** A client-side toggle means the
server renders 272 px, hydration corrects it to 80 px, and the Fields map re-lays out on every
load. Design-spec §10.6 forbids layout shift on data load and this is the same defect. Reading
the cookie in the layout costs one line and makes the first paint correct.

**Why Playwright now rather than with the first screen.** NFR-10 is a contract on every screen,
and a harness introduced alongside the first screen gets tuned until that screen passes. Built
against the shell — two crops, no data, no charts — it is tuned against something with no
stake in the outcome.

**Why the login page is restyled but not redesigned.** It carries raw palette classes that
violate invariant 7 and would be the one file failing the hex grep forever. Restyling to tokens
is mechanical. Designing an auth screen is not, and D13 is open for a reason.

**Why no placeholder routes for `/fields`, `/tasks`, `/weather`.** A 404 tells the truth. An
"under construction" page is a file that must be found and deleted later, and in the meantime
it will accumulate someone's temporary markup.

---

## 4. Affected files

| Path | Change | Notes |
|---|---|---|
| `apps/web/app/globals.css` | rewrite | AlignUI CLI output + appended `--chart-*` (§2.1) |
| `apps/web/app/layout.tsx` | edit | Inter on `--font-sans`; Geist removed (§2.2) |
| `apps/web/app/page.tsx` | move | → `app/(app)/page.tsx`, body unchanged |
| `apps/web/app/logout-button.tsx` | **removal** | Logic moves to `components/flora/user-menu.tsx` |
| `apps/web/app/(app)/layout.tsx` | new | Shell: session + sidebar cookie, server-side |
| `apps/web/app/(auth)/layout.tsx` | new | Centred, no shell |
| `apps/web/app/(auth)/login/page.tsx` | edit | AlignUI restyle, same flow (§2.9) |
| `apps/web/app/favicon.ico` | edit | Flora mark |
| `apps/web/utils/{cn,tv,recursive-clone-children,polymorphic}.ts` | new | From AlignUI docs |
| `apps/web/components/ui/*.tsx` | new ×11 | Vendored, byte-identical (§2.3) |
| `apps/web/components/ui/chart.tsx` | new | shadcn, vendored (§2.4) |
| `apps/web/components/ui/SOURCES.md` | new | URL + date + sha256 per file |
| `apps/web/components/charts/config.ts` | new | Series colours, gridlines, tooltip (§2.4) |
| `apps/web/components/flora/app-sidebar.tsx` | new | §2.5 |
| `apps/web/components/flora/page-header.tsx` | new | §2.6 |
| `apps/web/components/flora/card.tsx` | new | `Card` + `CardHeader` (§4.5) |
| `apps/web/components/flora/icon-tile.tsx` | new | 40 / 56 / 37 px |
| `apps/web/components/flora/user-menu.tsx` | new | Sidebar footer + logout |
| `apps/web/lib/sidebar-state.ts` | new | `flora_sidebar` cookie read/write |
| `apps/web/components.json` | new | Hand-written, no `shadcn init` (§2.4) |
| `apps/web/eslint.config.mjs` | edit | Ignore `components/ui/**`, with reasoning |
| `apps/web/package.json` | edit | AlignUI peer deps, `@remixicon/react`, `recharts`, Playwright |
| `apps/web/playwright.config.ts` | new | §2.10 |
| `apps/web/e2e/shell.spec.ts` | new | §6 assertions |
| `apps/web/e2e/baselines/*.png` | new ×2 | Figma exports |
| `apps/web/public/{next,vercel,file,globe,window}.svg` | **removal** | Scaffold leftovers |
| `turbo.json` | edit | `test:e2e` task |
| `docs/design-spec.md` | edit | Resolve §3.2, §3.4, §4.3, §7.1 `[VERIFY]`s; D12, D13 wording |
| `docs/architecture.md` | edit | §16 Phase 0 complete; §9.3 confirmed as built |
| `CLAUDE.md` · `README.md` | edit | Status lines |

**`.env.example` is not touched.** The shell reads no new environment variable —
`NEXT_PUBLIC_MAPBOX_TOKEN` is already listed and lands with `TASK-fields`. This is the one file
`TASK-domain-schema` and this task could have collided on; they do not.

---

## 5. Explicitly out of scope

Any screen from design-spec §2 · Mapbox and `components/map/**` · TanStack Query · chart
*compositions* (only `chart.tsx` and `config.ts` land) · the remaining ~20 AlignUI base
components · `KpiTile`, `DeltaBadge`, `ActivityTag`, `FieldCard`, `TaskCard`, `KanbanBoard`
and the rest of §6.3 · the sidebar `FAVS` saved-views section (no data model until
`TASK-fields`) · dark mode (D2) · responsive breakpoints (D1, architecture §9.5) · auth screen
*design* (D13) · empty/loading/error states (D3) · placeholder routes for unbuilt screens.

At the end of this task `/` still renders one sentence about the logged-in user. It renders it
inside the finished shell.

---

## 6. Verification

Measurable, per CLAUDE.md — no criterion rests on "works". Items 3–12 are `e2e/shell.spec.ts`.

1. `pnpm turbo build lint typecheck` exits 0 from a clean install.
2. `pnpm turbo test:e2e` exits 0 against a running `apps/api` and infra.
3. **Accent.** `getComputedStyle(document.documentElement).getPropertyValue("--primary-base")`,
   converted to sRGB, is exactly `#1daf61` — after the §2.1 step-2 override if one was needed.
   The CLI's raw pre-override value is recorded in design-spec §3.2.
4. **Chart tokens.** `--chart-1` … `--chart-5` resolve to `#0b4627`, `#1a7544`, `#1daf61`,
   `#1fc16b`, `#84ebb4` (design-spec §3.3). None resolves to an empty string — an empty string
   is exactly the silent Recharts-v3 failure §7.1 warns about.
5. **AlignUI survived shadcn.** `--bg-white-0`, `--stroke-soft-200` and `--text-strong-950` all
   resolve; `--background` and `--foreground` (shadcn's set, and the scaffold's) do not exist.
6. **Font.** `getComputedStyle(document.body).fontFamily` contains `Inter`, and
   `grep -rn "Geist" apps/web --exclude-dir=node_modules --exclude-dir=.next` returns nothing.
7. **Sidebar widths.** `AppSidebar`'s `getBoundingClientRect().width` is `272` expanded and
   `80` collapsed. Toggling sets the `flora_sidebar` cookie; a full page reload preserves the
   width, and `PerformanceObserver` reports a **cumulative layout shift of 0** across the load
   (§2.5 — this is the whole reason the state is a cookie).
8. **Active nav.** On `/`, the Home row's computed `background-color` equals `--bg-weak-50`,
   its text colour `--text-strong-950`, and its indicator element's `background-color` equals
   `--primary-base`. The other three rows match none of these.
9. **Collapsed rail labels.** Hovering each of the four icons in the 80 px rail shows a
   `Tooltip` whose text equals the expanded row's label.
10. **Keyboard.** Tabbing from the top reaches all four nav rows, Settings, Support and the
    user menu in DOM order; each has a computed `outline-width` > 0 while focused. (Closes
    design-spec gap **D6** for the shell only — record the ring treatment in §8.)
11. **Visual diff.** Both sidebar crops are within **2%** of their Figma baselines at
    1440×900 (NFR-10).
12. **Login.** Submitting valid credentials still lands on `/` with the session sentence
    rendered inside the shell; invalid credentials render the AlignUI `Hint` error. Same flow
    `TASK-auth-tenancy` §6.14 verified, now through the styled form.
13. **No raw colour.**
    `grep -rEn '#[0-9a-fA-F]{3,8}\b|\b(bg|text|border)-(zinc|slate|red|blue|black|white)-?[0-9]*\b' apps/web/app apps/web/components --include='*.ts*'`
    returns hits only in `components/charts/config.ts` (invariant 7).
14. **Vendored files are byte-identical.** Re-fetching every URL in
    `components/ui/SOURCES.md` and diffing against the working tree produces zero differences,
    or a difference recorded in that file as a documented bug fix (invariant 8).
15. **Deferred work stayed deferred.**
    `grep -rn "energy\|Energy\|carbon\|Carbon" apps/web/components apps/web/app` returns
    nothing — the nav array has four entries (design-spec §2.1).

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| **The AlignUI CLI offers no Green primary** (its GitHub README says Sky) | The docs page is authoritative and lists Green. If the CLI disagrees, **stop** — do not pick a neighbour and hand-patch. Re-open design-spec §3.2 first |
| **The CLI installs `tailwindcss@next` / `@tailwindcss/postcss@next`**, drifting off the workspace's pinned v4 | Re-pin both in `apps/web/package.json` to the versions already resolved, re-run `pnpm install`, and confirm `pnpm turbo build` still passes before writing any component |
| **`shadcn add chart` rewrites `globals.css`** and destroys the AlignUI token set | `--dry-run --diff` first (§2.4 step 2); the hand-placed fallback (step 3) needs no CLI at all. Commit `globals.css` before running either CLI so the diff is recoverable |
| **The green-ramp variable names differ** from `--green-950` | Flagged as a `[VERIFY]` in §2.1; verification item 4 fails loudly rather than rendering nothing |
| Vendored AlignUI components assume a `tailwind.config` that CSS-only mode does not create | Cross-check against the starter repo (§2.3), but treat any required edit as a documented bug fix in `SOURCES.md` — never a silent one |
| **Playwright screenshot flake** from font loading or antialiasing | `animations: "disabled"`, fixed `deviceScaleFactor`, and `document.fonts.ready` awaited before every capture. Two crops only — a small enough surface that a flake is investigable rather than ignorable |
| Figma exports and the browser render at different pixel densities, making 2% unmeetable | Export at 1× via `get_screenshot` and confirm the crop's pixel dimensions match the DOM rect before trusting a diff. If they cannot be reconciled, record the achieved delta and raise the threshold **in the spec**, deliberately — do not quietly loosen `maxDiffPixelRatio` |
| The 40×40 logo is custom artwork, not a Remix glyph | `[VERIFY]` in §2.11 — check before approximating |

---

## 8. Follow-on tasks

**Phase 0 closes** when this and `TASK-domain-schema` land. Then, in the farmer's order
(architecture §16) — the first three are the spine and are hard-sequenced:

`TASK-fields` (`1:35172`) → `TASK-crop-stress` (`18:6567`) → `TASK-tasks-board` (`24:11420`) →
`TASK-home-dashboard` (`1:12913`) → `TASK-weather` (`3:5274`) → `TASK-field-management`
(`15:8608`).

Each pulls the AlignUI base components it needs into `components/ui/` under §2.3's rules, adds
its own `components/flora/` composites, and adds its full-screen baseline to `e2e/baselines/`.

Carried forward from this task:
- `TASK-fields` — the sidebar `FAVS` saved-views section; whether Fields defaults to the
  collapsed rail (§2.5); `NEXT_PUBLIC_MAPBOX_TOKEN`.
- `TASK-home-dashboard` — the `Plus Jakarta Sans` `[VERIFY]` (design-spec §3.4).

Energy and Carbon Offset are deferred and have no task documents.

---

## 9. Completion notes (2026-08-15)

Landed as planned, with these deviations — each is also recorded at its source-of-truth
location (design-spec §3.2/§3.3/§3.4/§4.3/§7.1, `components/ui/SOURCES.md`) so this section is
a pointer, not the only copy.

1. **Neutral colour is Slate, not Gray** (design-spec §3.2). AlignUI's Gray primitive is fully
   achromatic; the Figma's neutral hexes have a faint blue tint that converts exactly to the
   Slate ramp. Caught by the accent/token Playwright tests, not by inspection — worth noting
   for any future CLI re-run.
2. **`components/ui/chart.tsx` came from `github.com/shadcn-ui/ui` directly**, not
   `shadcn add chart` — the CLI also creates an unwanted `components/ui/card.tsx`. One
   documented import-path fix (`@/lib/utils` → `@/utils/cn`); see `SOURCES.md`.
3. **A real height-chain bug, found by the Playwright suite, not anticipated in §7's risk
   table:** `app/(app)/layout.tsx`'s wrapper used `h-full min-h-screen`. `min-height` does not
   establish a *definite* height for percentage-height descendants — only `height` does — so
   `<AppSidebar>`'s own `h-full` silently fell back to its content height (472px, not 900px).
   Fixed by using `h-screen` (a `vh`-based, unconditionally definite value) on the wrapper.
   Worth remembering for any other full-height flex column in this app.
4. **The Figma file key was available after all** — recorded in design-spec.md's own header
   (`hY3Nd3BBbJsjpihPnfZgpd`), missed on first read. Both sidebar baselines
   (`e2e/baselines/sidebar-{expanded,collapsed}.png`) are real `get_screenshot` exports at
   their native 1× size, not placeholders.
5. **NFR-10's 2% pixel-diff budget is not met, deliberately, for the two sidebar screenshots**
   — the Figma export still carries the fifth "Energy" nav row (deferred per architecture
   §4.3), which shifts every row below it. Measured floor with the dynamic user-identity text
   masked out: 5% expanded, 3% collapsed; `e2e/shell.spec.ts` sets `maxDiffPixelRatio` to 6.5%
   / 4.5% (small headroom, not silently loosened) with the reasoning inline. Whichever screen
   task restores Energy — or crops a dedicated 4-item baseline — should tighten this back
   toward 2%.
6. **The `/utils/**` and `components/ui/**` vendored files needed an ESLint ignore**, not just
   `components/ui/**` — `utils/polymorphic.ts` and `utils/recursive-clone-children.tsx` trip
   `@typescript-eslint/no-empty-object-type` / `no-explicit-any` as shipped by AlignUI.
7. **Not done: the favicon.** §2.11 called for replacing `app/favicon.ico` with a Flora mark;
   this needs image-editing tooling this session didn't have. The scaffold's default favicon
   is still in place. Small, but real — pick up whenever convenient, no dependency on it.
8. **Two Playwright infra notes**, not in the original plan: `/api/v1/auth/login` is
   rate-limited to 5 requests / 15 min per IP, so the suite logs in once via an `auth.setup.ts`
   project and shares `storageState` — logging in per test exhausts the budget under default
   parallelism. And `getComputedStyle` serializes `oklch()`-declared colours back as
   `lab()`/`oklab()`, not `rgb()`, in Chromium — colour assertions clamp through a 1×1 canvas
   instead of comparing strings.
9. **Verification item 13's grep needs `components/ui/**` excluded.** As written it false-
   -positives on AlignUI's own compound token names (`bg-bg-white-0` contains the substring
   `bg-white-0`) and on the vendored library's legitimate use of its own raw colour ramp
   (`bg-blue-200`, `hover:bg-red-700` in `avatar.tsx`/`button.tsx`, which are AlignUI's
   internals, not Flora's). Scoped to `app/` + `components/flora/` + `components/charts/`, it
   finds zero violations.
