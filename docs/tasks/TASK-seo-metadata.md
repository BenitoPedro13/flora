# TASK-seo-metadata

## 1. Current scenario

`apps/web/app/layout.tsx` exports a static `metadata` object with a bare `title: "Flora"` and
one-line description. No `metadataBase`, no Open Graph or Twitter cards, no per-route titles,
no `robots.txt` / sitemap, and no `opengraph-image` routes. The public landing page at `/`
(TASK-landing-page) and the authenticated app screens all share the same browser-tab title.

`WEB_ORIGIN` is already validated in `packages/config/src/env.ts` and listed in `.env.example`
— it is the correct source for `metadataBase` and canonical URLs.

## 2. Planned changes

### 2.1 Shared SEO utilities (`apps/web/lib/seo/`)

- `site.ts` — product name, default description, `getMetadataBase()` from `WEB_ORIGIN`.
- `metadata.ts` — `createPageMetadata()` helper returning a full Next.js `Metadata` object
  (title, description, canonical, openGraph, twitter, robots).
- `og-colors.ts` — brand hex values mirroring AlignUI tokens in `globals.css` (same precedent
  as `components/map/config.ts`; ImageResponse cannot read CSS variables).
- `og-image.tsx` — shared `ImageResponse` layout (Flora mark, title, optional subtitle/badge).

### 2.2 Root + crawl files

- Extend root `layout.tsx` with `metadataBase`, title template (`%s · Flora`), default OG/Twitter
  fallbacks, and `robots` defaults for the authenticated product.
- Add `app/robots.ts` — allow `/`, disallow session-gated routes.
- Add `app/sitemap.ts` — public routes only (`/`).

### 2.3 Per-route metadata + OG images

| Route | Title source | OG image | Indexable |
|---|---|---|---|
| `/` (marketing) | Static | Branded landing card | yes |
| `/login` | Static via `login/layout.tsx` | Branded sign-in card | no |
| `/home` | Static | Dashboard card | no |
| `/fields` | Static | Fields card | no |
| `/fields/[fieldId]/stress` | `generateMetadata` (field name) | Dynamic card, API fetch with generic fallback | no |
| `/tasks` | Static | Tasks card | no |
| `/weather` | Static | Weather card | no |

Each route gets `export const metadata` or `generateMetadata` plus a colocated
`opengraph-image.tsx` calling the shared renderer. Authenticated routes stay `noindex`; OG
images still render for consistency and for the rare case a crawler hits an image URL directly.

## 3. Why

The landing page is public and needs correct link previews and search snippets. App screens
need distinct browser-tab titles. A single helper keeps Open Graph / Twitter / canonical shapes
consistent and avoids hand-copying metadata objects across seven routes.

## 4. Affected files

| Path | Change |
|---|---|
| `apps/web/lib/seo/*` | new |
| `apps/web/app/layout.tsx` | edit |
| `apps/web/app/robots.ts` | new |
| `apps/web/app/sitemap.ts` | new |
| `apps/web/app/(marketing)/page.tsx` | edit |
| `apps/web/app/(marketing)/opengraph-image.tsx` | new |
| `apps/web/app/(auth)/login/layout.tsx` | new |
| `apps/web/app/(auth)/login/opengraph-image.tsx` | new |
| `apps/web/app/(app)/home/page.tsx` | edit |
| `apps/web/app/(app)/home/opengraph-image.tsx` | new |
| `apps/web/app/(app)/fields/page.tsx` | edit |
| `apps/web/app/(app)/fields/opengraph-image.tsx` | new |
| `apps/web/app/(app)/fields/[fieldId]/stress/page.tsx` | edit |
| `apps/web/app/(app)/fields/[fieldId]/stress/opengraph-image.tsx` | new |
| `apps/web/app/(app)/tasks/page.tsx` | edit |
| `apps/web/app/(app)/tasks/opengraph-image.tsx` | new |
| `apps/web/app/(app)/weather/page.tsx` | edit |
| `apps/web/app/(app)/weather/opengraph-image.tsx` | new |

## 5. Verification

1. `pnpm --filter web typecheck` passes.
2. View source on `/` shows `og:title`, `og:description`, `og:image`, `twitter:card`, and
   `<link rel="canonical">` pointing at `WEB_ORIGIN`.
3. `/home`, `/fields`, `/tasks`, `/weather` each emit a distinct `<title>`.
4. `/fields/[id]/stress` title includes the field name when authenticated.
5. `GET /robots.txt` disallows app routes; `GET /sitemap.xml` lists `/` only.
6. `GET /opengraph-image` (and per-route OG URLs) returns `image/png` 1200×630.

## Out of scope

- JSON-LD structured data.
- Public share URLs for authenticated field stress views (would need a public metadata API).
- Localized / i18n metadata.
