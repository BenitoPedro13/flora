# TASK-seo-expansion — Comprehensive SEO & Open Graph for all routes

## Current scenario

SEO infrastructure exists (`lib/seo/`):
- `createPageMetadata()` helper for route metadata
- `OgImage` component generating 1200x630 dynamic OG images via `next/og`
- Root layout has basic metadata (robots: false, default OG)
- Most routes lack explicit metadata and OG image endpoints

**Issue:** Only landing page renders OG images; other routes fall back to root metadata. User experience for shared links is generic — no route-specific titles, descriptions, or badge context.

## Planned changes

### New files
- Route-specific `opengraph-image.ts` endpoints for:
  - `/` — landing page (hero image context)
  - `/home` — dashboard with farm stats context
  - `/fields` — field management context
  - `/tasks` — task board context
  - `/weather` — weather context
  - `/fields/[fieldId]/stress` — crop stress context
  - `/login` — auth page (minimal)

### Modified files
| Path | Change | Notes |
|------|--------|-------|
| `app/(marketing)/page.tsx` | Add metadata, set `robots: PUBLIC` | Public-facing landing page |
| `app/(auth)/login/page.tsx` | Add metadata | Private app, `robots: PRIVATE` |
| `app/(app)/home/page.tsx` | Add metadata | Protected route |
| `app/(app)/fields/page.tsx` | Add metadata | Protected route |
| `app/(app)/fields/[fieldId]/stress/page.tsx` | Add metadata | Protected, dynamic route |
| `app/(app)/tasks/page.tsx` | Add metadata | Protected route |
| `app/(app)/weather/page.tsx` | Add metadata | Protected route |
| `lib/seo/og-colors.ts` | Add route-specific badge colors (optional) | Enhance visual differentiation |

## Why

- **Social sharing:** Each route gets a custom preview on Slack/Twitter/Discord with context-specific titles and descriptions
- **SEO:** Route-specific metadata improves search indexability and CTR
- **UX:** Shared links show what the recipient will find, not a generic "Flora" title
- **Landing page:** Set `robots: PUBLIC` so search engines index it; protected routes stay `PRIVATE`

## Verification

- [ ] Build passes: `pnpm exec turbo run build`
- [ ] Each route renders correctly with typed metadata
- [ ] OG image endpoints return 1200x630 PNG with route context
- [ ] Landing page robots: true (indexable), protected routes robots: false
- [ ] Visual diff: `/home`, `/fields`, `/tasks` screenshots match expected layout

---

## Implementation notes

**Badge context:** Each OG image will have a route-specific badge:
- Landing page: "Flora™" (default)
- Dashboard: "Dashboard"
- Fields: "Field Management"
- Crop Stress: "Crop Health"
- Tasks: "Task Board"
- Weather: "Weather"

**Dynamic route (stress):** `[fieldId]` route needs `generateMetadata()` to fetch field name and insert into title/description.

**Public vs. Private:** Only the landing page gets `robots: PUBLIC`; all protected (`/app`) routes stay `PRIVATE`.
