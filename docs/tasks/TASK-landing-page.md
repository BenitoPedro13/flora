# TASK-landing-page

## 1. Current scenario

`apps/web` has two route groups: `(app)` (session-gated by `app/(app)/layout.tsx`, which calls
`getSession()` and `redirect("/login")` if absent) and `(auth)` (just `/login`). `(app)/page.tsx`
is the Home dashboard (`TASK-home-dashboard`) and currently owns `/` — every unauthenticated
visitor to the root domain is bounced straight to `/login` with no public page at all.

The Figma file (`hY3Nd3BBbJsjpihPnfZgpd`, node `2175:15725`, "Frame 144") has a full marketing
landing page, 1440×10280, nine stacked sections under a `Main` frame:

| Section | Node ID | Height |
|---|---|---|
| Hero | `2175:15729` | 1393 |
| Brands | `2175:15759` | 227 |
| Features | `2180:4419` | 2509 |
| Benefits | `2193:14366` | 1114 |
| Pricing | `2219:11761` | 841 |
| Use Cases | `2193:14394` | 1087 |
| Pricing (second instance — likely mislabeled, verify on implementation) | `2193:14974` | 941 |
| Blog | `2247:5966` | 1141 |
| Footer | `2247:6098` | 515 |

The user's read is right that most of the *visual system* already exists: AlignUI base
components are vendored in `components/ui/`, Flora's tokens/`globals.css` are wired, and
`components/flora/` already has composites this page can lean on (`FancyButton`-equivalent
buttons, badges, etc. — exact matches TBD per-section during implementation, per
`figma-design-to-code`'s own instruction to check the project for existing components before
generating new ones).

**Important finding from the Hero screenshot**: the Figma hero's embedded "app preview" image
shows a generic AlignUI SaaS template dashboard — wind turbines, solar panels, an "Energy" nav
item, a "Carbon Offset" nav item, a "Financial" nav item, a "Teams" nav item. None of that is
the real Flora product. Real `AppSidebar` (`components/flora/app-sidebar.tsx`) has exactly
Home/Fields/Tasks/Weather, and Energy + Carbon Offset are **explicitly deferred**
(CLAUDE.md, architecture §4.3 — "do not build against either without re-opening the decision").
Shipping the Figma mockup verbatim would market a feature that doesn't exist. This preview image
must be swapped for something that reflects the real, built app (a real screenshot of Home or
Crop Stress, or a hand-composed mockup using real screens) — not literally reproduced.

## 2. Planned changes

### 2.1 Routing surgery (user's explicit call: landing page takes `/`, Home moves)

1. **New route group `app/(marketing)/page.tsx`** (or a bare `app/page.tsx` outside both
   existing groups — decide during implementation based on whether the marketing section grows
   a second page) becomes the new `/`. Not covered by `(app)/layout.tsx`'s session gate — public,
   no redirect.
2. **`app/(app)/page.tsx` moves to `app/(app)/home/page.tsx`** — same component, new URL `/home`.
3. **`app/(auth)/login/page.tsx:43`**: `router.push("/")` → `router.push("/home")`.
4. **`components/flora/app-sidebar.tsx:30`**: Home nav item `href: "/"` → `href: "/home"`.
5. **`apps/web/e2e/shell.spec.ts`, `apps/web/e2e/home.spec.ts`**: `goto("/")` → `goto("/home")`
   (both currently assume `/` is the authenticated Home screen).
6. **Logged-in visitors landing on `/`**: default to just showing the marketing page like any
   visitor (no auto-redirect) — the landing page's own "Open App" button in the header is the
   escape hatch to `/home`. Simpler than session-checking the public route, and avoids a
   logged-in user bookmarking `/` and being surprised it doesn't land them in the app. Flag for
   pushback if the user wants auto-redirect instead.

### 2.2 The landing page itself

New `components/flora/landing/` composites, one per section (`Hero`, `Brands`, `Features`,
`Benefits`, `Pricing`, `UseCases`, `Blog`, `Footer`), assembled in
`app/(marketing)/page.tsx`. Each section pulled from Figma via `get_design_context` on its own
node ID (table above) at implementation time — not hand-drawn from the screenshot alone, per
`figma-design-to-code`'s own rule.

- **Header nav** (`Use Cases`, `About Us`, `Contact Us`, `Blog`): no corresponding real pages
  exist yet. v1 ships them as in-page anchor links to the matching landing section where one
  exists (Use Cases, Blog) and `#` placeholders otherwise (About Us, Contact Us) — real pages are
  a follow-on task, not silently invented here.
- **"Get Started" / "Open App" CTAs**: route to `/login` (unauthenticated) — matches the existing
  auth flow, no new logic needed.
- **Pricing section(s)**: static marketing content only — Flora has no billing/plans backend.
  Numbers/tiers come from the Figma design as-is (design content, not fabricated data — distinct
  from the architecture's "no fabricated chart data" rule, which is about product screens with
  real data sources).
- **Blog section**: Flora has no CMS or blog data model. Ships as static placeholder content
  (design's own copy) with a comment marking it as such — not wired to any data source, since
  none exists. A real blog is out of scope (§3).
- **Brands / social-proof row**: static logos from the design (downloaded assets per
  `figma-design-to-code`'s asset rule — never hand-drawn).

## 3. Why

The user asked for a landing page inspired by the Figma design, observing correctly that most of
the component/token groundwork already exists. Mid-conversation they chose the bigger of two
routing options (§2.1) — `/` becomes public, Home moves to `/home` — over the simpler
`/welcome`-style addition, which is why this touches login, the sidebar, and two e2e specs
instead of being purely additive.

## 4. Affected files

| Path | Change | Notes |
|---|---|---|
| `app/(marketing)/page.tsx` | new | The new `/` |
| `components/flora/landing/*.tsx` | new | One composite per section, 8 files |
| `app/(app)/page.tsx` → `app/(app)/home/page.tsx` | moved | Same component, new URL |
| `app/(auth)/login/page.tsx` | edit | Post-login redirect target |
| `components/flora/app-sidebar.tsx` | edit | Home nav item's `href` |
| `apps/web/e2e/shell.spec.ts` | edit | `goto("/")` → `goto("/home")` |
| `apps/web/e2e/home.spec.ts` | edit | `goto("/")` → `goto("/home")` |
| `apps/web/proxy.ts` | edit | A separate, global auth-gate (Next.js 16's renamed `middleware.ts`) redirects every path except `/login` to `/login` by prefix match — missed in the original plan (easy to miss: it's not under `app/`). `/` now needs an exact-match exception, not a prefix one (prefix would swallow every route) |
| `apps/web/e2e/baselines/` | new | A landing-page visual-diff baseline, matching the existing per-screen pattern (NFR-10) |
| `docs/design-spec.md` | edit | Add the landing page to the screen inventory (§2) once built |

## 5.1 Outcome (2026-08-17) — narrower than §2's original 9-section plan

Two decisions landed mid-build, both from the user directly:

- **The Hero's app-preview is `AppPreview` (`components/flora/landing/app-preview.tsx`)** — the
  real `AppSidebar`/`PageHeader`/`PageContainer`/`KpiRow`/`CropsStockedCard`/`RegenerationCard`/
  `PlantingProductivityCard`/`WeatherCard`/`GatheringRateCard`/`PendingTasksCard` composites,
  rendered with representative sample data shaped by `@flora/contracts`' real `dashboardSchema`
  — not a flattened screenshot. User's explicit call ("can we not use images and use our
  components?"), and it's strictly better than the screenshot-based first pass: it inherits the
  app's real light/dark theming for free, which a PNG can't.
- **Scope narrowed to Hero + Footer only.** Brands, Benefits (as testimonials), both Pricing
  instances, and Blog all needed fabricated content presented as real (customer logos, named
  testimonials, plan pricing, blog posts) — user's call was to drop them from v1 rather than
  invent placeholder-but-specific content. Features and Use Cases weren't explicitly named in
  that decision but were deferred too, for the same reason once inspected: Features' body copy
  is the Figma template's own repeated lorem-ipsum filler ("We play a vital role in promoting
  regenerative practices...", verbatim across all four tabs), not real Flora copy, and its
  fourth tab is the same fictional Energy dashboard the Hero already had to route around.

Shipped: `/` (public, was previously unreachable — every visitor got redirected to `/login`),
`Hero` (headline, real CTAs to `/login`, the live `AppPreview`, a nav strip that's honest about
what's unbuilt — Use Cases/About Us/Contact Us/Blog are all `#` placeholders, not dead anchors
into non-existent sections), `Features` (`components/flora/landing/features.tsx` — real copy
about Flora's four real capabilities, Fields & Crops/Crop Stress/Tasks/Weather, each with an
actual `FieldCard`/`StressSummary`/`TaskCard`/`WeatherDayCard` as its visual instead of the
Figma's repeated filler text and fictional per-tab mockups), `Footer` (logo, real copyright
line, `Home`/`Log in` links only — the Figma's fictional customer names and template-author
credit both dropped).

`Features` is a Client Component (`"use client"`) — its reused composites (`FieldCard`,
`TaskCard`, `StressSummary`) attach real `onClick` handlers to real DOM elements even with
no-op callbacks here, and Next's build fails outright on that without the directive ("If you
need interactivity, consider converting part of this to a Client Component") rather than
silently degrading — caught by `next build`, not `next dev`.

Two more real bugs found and fixed, both pre-existing, both invisible until this task exercised
the code paths:

- **`apps/web/proxy.ts`** (Next.js 16's renamed `middleware.ts` — easy to miss, not under `app/`)
  had a blanket auth-gate: every path except `/login`, matched by prefix, redirected to
  `/login`. `/` needed an *exact-match* exception, not a prefix one (prefix would have swallowed
  every route on the site). Its matcher also doesn't exempt `public/` static assets the way it
  exempts `_next/static`/`_next/image`/`favicon.ico`, so `/landing/*.svg`/`.png` needed their own
  exception too — the landing page rendered with every image broken until this was found.

## 5. Out of scope

- Real About Us / Contact Us pages — placeholder links only (§2.2).
- A real blog (content, CMS, routing) — static section content only.
- Billing/plans backend for Pricing — static design content only.
- Energy and Carbon Offset features — still deferred (architecture §4.3); the landing page must
  not depict them as real, working parts of the product (§1's "important finding").
- Auto-redirecting an authenticated visitor away from `/` — decided against in §2.1, revisit if
  it turns out to be confusing in practice.

## 6. Verification

- `pnpm --filter web run typecheck` / `lint` clean. **Done, both pass.**
- `/` loads unauthenticated, no redirect to `/login`. **Done** — verified via `next build` +
  `next start` + `curl`, then Playwright screenshots (not just an HTTP status check).
- `/home` requires a session and renders the existing Home dashboard unchanged. **Done** — proxy
  redirect confirmed for `/home` while `/` returns 200, same check.
- Login flow: `/login` → successful auth → lands on `/home`, not `/`. **Done** — a third,
  separately-hardcoded assertion (`shell.spec.ts`'s own "valid credentials land on /" test,
  `toHaveURL("/")`) was missed in the original pass and only caught by actually running the
  suite, not by grepping for `goto("/")`.
- `apps/web/e2e/shell.spec.ts` and `home.spec.ts`: **23/23 pass**, run live against local infra
  (`docker ps` confirmed `flora-db-1`/`flora-cache-1`/`flora-storage-1` already up,
  `apps/api` already serving). A first attempt accidentally ran the *entire* e2e suite (20
  unrelated failures in fields/stress/tasks/weather — pre-existing, not caused by this task,
  confirmed by re-running shell+home in isolation clean).
- A new Playwright spec for the landing page, screenshot-diffed against the Figma export — **not
  built**, deferred alongside the sections it would need to cover (§5.1).
- Manual browser check: hero's app-preview shows the real Flora product. **Done, exceeded** —
  not just a real screenshot but the real `components/flora/*` composites themselves, live
  data-shaped, correctly inheriting light/dark theme (confirmed by the user's own screenshot).
