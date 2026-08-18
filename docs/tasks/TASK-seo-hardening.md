# TASK-seo-hardening

## 1. Current scenario

`TASK-seo-metadata` and `TASK-seo-expansion` already shipped a comprehensive SEO layer:
`lib/seo/site.ts` (`getMetadataBase()` from `WEB_ORIGIN`), `lib/seo/metadata.ts`
(`createPageMetadata()` — title/description/canonical/OG/Twitter/robots per route),
`lib/seo/og-image.tsx` + `og-colors.ts` (a shared branded `next/og` renderer), `app/robots.ts`,
`app/sitemap.ts`, and seven colocated `opengraph-image.tsx` files (one per route, including the
dynamic `/fields/[fieldId]/stress` via `generateMetadata`). This session found and fixed two
regressions in that shipped work (commit `b52ff5a`):

1. `createPageMetadata()` built the root route's OG image URL as `` `${path}/opengraph-image` ``
   — for `path: "/"` this produced `"//opengraph-image"`, which `new URL()` parses as
   protocol-relative (host `opengraph-image`), not a same-origin path. The root page's
   `og:image` resolved to `https://opengraph-image/` instead of the real domain.
2. `proxy.ts`'s public-path allowlist (`PUBLIC_PATHS = ["/login", "/landing"]`) didn't cover
   `/favicon.svg` or any route's `/opengraph-image` output. Every unauthenticated request for
   either — social-preview crawlers included — got 307'd to `/login` instead of the asset, so
   every OG card and the manually-set SVG favicon silently served the login page.

A third regression surfaced after §2's JSON-LD/`themeColor` work shipped: the user reported the
live `og:image` (and, on inspection, `og:url`/canonical too) pointed at `https://flora.farm`, not
the real `https://flora.up.railway.app`. Root cause, confirmed empirically rather than guessed
(§0's rule): `WEB_ORIGIN` **is** correctly set on the Railway `web` service
(`railway variables --service web` shows `WEB_ORIGIN=https://flora.up.railway.app`), but `/` and
`/login` are statically prerendered, so `lib/seo/site.ts`'s `getMetadataBase()` runs once, at
`next build` time on Railway — the same Railpack build-sandbox limitation `next.config.ts`
already documents (and had to work around) for `API_URL`. Verified directly: building locally via
`railway run --service web pnpm --filter web run build` (which genuinely injects Railway's real
variables into the build process) correctly bakes in `flora.up.railway.app`; the actual
git-triggered Railway build does not have the same access, so `site.ts`'s pre-existing
`?? "https://flora.farm"` fallback (added by an earlier, unverified fix, commit `2151b35`) papered
over the missing var with a domain the project has never actually owned. Fixed in `site.ts`:
restored the original hard failure for a genuinely missing `WEB_ORIGIN` at runtime, and scoped the
fallback to `process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD` (Next's own build-time signal,
confirmed by grepping the installed `next` package's build source, not assumed) with the *correct*
current domain, not a fictional one.

Both are fixed. A live meta-tag inspection (`curl` against `flora.up.railway.app`) is what
surfaced the bug — the same "verified live, not by inspection" pattern several earlier tasks
record. This task is the follow-up hardening pass the user asked for: re-verify the fix, then
close the two genuine remaining SEO gaps rather than re-deriving infrastructure that already
works.

## 2. Planned changes

### 2.1 Verify (no code)

Re-run the live `curl` checks against the deployed app once `b52ff5a` is live: confirm
`/favicon.svg`, `/opengraph-image`, and one nested route's `/<path>/opengraph-image` all return
`200 image/*` instead of `307 → /login`, and that `/`'s `og:image` meta tag is a full
`https://flora.up.railway.app/opengraph-image` URL.

### 2.2 JSON-LD structured data on the marketing page

`TASK-seo-metadata` §"Out of scope" explicitly deferred this; reopening it now per the user's
"best SEO" ask. Add an `Organization` + `WebSite` JSON-LD block (`<script type="application/ld+json">`)
to `app/(marketing)/page.tsx` only — the one public, indexable route. No `SearchAction` (the
product has no public search surface). Values sourced from `lib/seo/site.ts` constants, no new
hand-typed strings duplicating `SITE_NAME`/`MARKETING_DESCRIPTION`/`getMetadataBase()`.

### 2.3 `themeColor` in root `viewport`

`app/layout.tsx` has no `themeColor`. Cheap, real: sets the mobile browser chrome /
PWA-install-prompt color on Android Chrome and iOS Safari. `themeColor` moved out of `metadata`
into a separate `viewport` export in Next 14 (confirmed against this repo's own vendored
`node_modules/next/dist/docs/.../generate-viewport.md` per §0's "check current docs" rule) — a
new `export const viewport: Viewport = { themeColor: OG_COLORS.primary }`, not a field on the
existing `metadata` object. Uses `OG_COLORS.primary` (`#22a06b`, already the brand green used
everywhere else colour is needed — invariant 7) so it isn't a new hand-picked hex.

### 2.4 What this deliberately does *not* touch

- **`app/favicon.ico` + the `.ico`/`.svg` dual-icon pattern** — Next's real top-level file
  convention (`favicon.ico`) alongside a vector icon (`favicon.svg`, via an explicit
  `metadata.icons.icon` override) is the documented "ship both an `.ico` fallback and a vector
  icon" pattern the Next.js docs point at (`app-icons.md`'s linked favicon handbook). Not
  rebuilt — it was only ever a reachability bug (§1 item 2), now fixed.
  **Revised same session:** `public/favicon.svg`'s *content*, unlike the delivery mechanism, was
  wrong — a hand-drawn path that only resembled the brand mark, not the real
  `public/landing/logo-leaf.svg` asset the header/footer badge (`components/flora/landing/hero.tsx`,
  `footer.tsx` — `rounded-full bg-primary-base` circle, the leaf inset at 32%-opacity white) use
  everywhere else. User flagged it by screenshot comparison. Rebuilt `favicon.svg` to reuse the
  real leaf path at the real opacity/gradient inside a solid `#22a06b` (`--color-primary-base` /
  `--color-green-600`) circle instead of the old light-mint rounded square, matching the header
  badge's own proportions (a nested `<svg>` sized like the badge's `p-2` inset). Verified visually
  at both 16px (tab-icon scale) and 128px against the reference screenshot before considering it
  done. `app/favicon.ico` (the binary fallback) and the `metadata.icons` wiring are untouched —
  only the SVG's artwork changed.
- **`robots.ts`'s disallow list** — looks redundant with per-route `noindex` at first read
  (Google's own guidance warns disallow-plus-noindex can strand a URL "indexed, no snippet"
  because the crawler never reaches the page to see the noindex tag). But every disallowed path
  here also 307s to `/login` for an unauthenticated request (`proxy.ts`), so a crawler that
  ignored the disallow would just be redirected anyway — the disallow is crawl-budget hygiene,
  not the only thing keeping these pages out of the index. No change.
- **`sitemap.ts`'s single `/` entry** — correct as-is; every other route is session-gated and
  has nothing to index.
- **Apple touch icon / web manifest** — not an SEO ranking factor (home-screen/PWA presentation
  only) and out of scope for what was asked; flagging as a possible separate follow-up, not
  building it here.
- **`og-image.tsx` / `og-colors.ts` rendering** — already branded, already per-route (badge +
  emoji icon + title + description + hostname footer), already statically optimized (no
  request-time API used, so Next caches the render per the docs' "Good to know"). No rebuild.

## 3. Why

The user asked to "rebuild all og images, favicon and seo and metatags to get the best seo"
after seeing the broken `og:image` URL. Read literally, "rebuild all" would mean discarding
working, already-comprehensive infrastructure (`TASK-seo-metadata`/`TASK-seo-expansion`) that
was never actually wrong — it was unreachable, which is now fixed. Doing a literal rebuild would
violate the no-unneeded-abstraction / no-scope-creep conventions this repo runs on for no
benefit: the same files would come back out looking the same, at the cost of re-introducing risk
into code that already works. The two additions in §2.2–2.3 are the concrete, real gaps between
"comprehensive metadata that works" and "best SEO" that are worth the change.

## 4. Affected files

| Path | Change | Notes |
|---|---|---|
| `apps/web/app/(marketing)/page.tsx` | edit | render the JSON-LD `<script>` |
| `apps/web/lib/seo/structured-data.ts` | new | `getMarketingJsonLd()` — `Organization`/`WebSite`, sourced from `site.ts` |
| `apps/web/app/layout.tsx` | edit | new `export const viewport` with `themeColor` |
| `apps/web/public/favicon.svg` | edit | real `logo-leaf.svg` path/gradient in a `bg-primary-base` circle, replacing the invented shape (user-flagged by screenshot, done earlier this session) |
| `apps/web/lib/seo/site.ts` | edit | build-phase-scoped `WEB_ORIGIN` fallback, correct domain, restored runtime hard-fail |

## 5. Verification

1. Live `curl -sI` against `flora.up.railway.app/favicon.svg`, `/opengraph-image`, and
   `/fields/opengraph-image` all return `200`. — done, see commit `b52ff5a`.
2. Live `curl -s .../ | grep og:image` shows the full `https://flora.up.railway.app/opengraph-image`
   URL, not a protocol-relative host. — done, see commit `b52ff5a`.
3. `pnpm exec tsc --noEmit` and `pnpm exec eslint` both clean on the three changed/new files. — done.
4. `pnpm exec next build && pnpm exec next start` locally, `curl localhost:4173/`: confirmed a
   valid `application/ld+json` `<script>` block (`Organization` + `WebSite`, `@id`-linked), a
   correctly-formed `og:image` URL, and `<meta name="theme-color" content="#22a06b">` all present
   in the rendered HTML. (Google's Rich Results Test itself wasn't run — that requires posting the
   page to an external Google tool, which weighed against the value here; the JSON-LD shape was
   checked by hand against schema.org's `Organization`/`WebSite` types instead.)
5. Favicon rebuild verified visually in a browser at both 16px (tab-icon scale) and 128px against
   the user's reference screenshot — done earlier this session.
6. `WEB_ORIGIN` fix: `pnpm exec tsc --noEmit` clean. `env -u WEB_ORIGIN pnpm exec next build`
   (simulating Railway's actual build-phase blind spot) succeeds and bakes `flora.up.railway.app`
   into `.next/server/app/index.html` — confirmed via `grep -oE 'flora\.[a-z.]+'`, `flora.farm` no
   longer present anywhere in the output. Once Railway redeploys this commit, re-run the live
   `curl -s https://flora.up.railway.app/ | grep -oE '<meta property="og:(url|image)"[^>]*>'`
   check to confirm the production build picks it up the same way.

## Out of scope

- Apple touch icon / web app manifest (flagged in §2.4, not built).
- Localized / i18n metadata (already out of scope per `TASK-seo-metadata`).
- Public share URLs for authenticated views (already out of scope per `TASK-seo-metadata`).
