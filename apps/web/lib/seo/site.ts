import { PHASE_PRODUCTION_BUILD } from "next/constants";

/** Product-wide SEO constants — keep copy aligned with the landing hero (TASK-landing-page). */

export const SITE_NAME = "Flora";
export const SITE_NAME_MARK = "Flora™";

export const DEFAULT_DESCRIPTION =
  "Operations console for regenerative farms — satellite crop health, field management, tasks, and weather in one place.";

export const MARKETING_DESCRIPTION =
  "Our platform empowers agriculture to restore ecosystems, turning your farm into a regenerative success story.";

// Mirrors next.config.ts's API_URL fallback, and for the identical reason:
// `WEB_ORIGIN` is a real, correctly-set Railway service variable (verified
// live via `railway variables --service web`), but `next build`'s Railpack
// build sandbox doesn't expose it — only the running deployment sees it.
// `/` and `/login` are statically prerendered, so their metadata (og:image,
// canonical, og:url) is computed once at that build, not per-request; with
// no fallback it silently baked in an unrelated placeholder domain
// ("flora.farm", never actually owned by this project) instead of the real
// one. `process.env.NEXT_PHASE` is Next's own build-time signal (set at
// `node_modules/next/dist/build/index.js`, not something invented here) —
// scoping the fallback to it, rather than making it unconditional, keeps a
// genuinely missing `WEB_ORIGIN` at runtime a hard failure instead of a
// silently wrong domain.
export function getMetadataBase(): URL {
  const origin =
    process.env.WEB_ORIGIN ??
    (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD ? "https://flora.up.railway.app" : undefined);
  if (!origin) {
    throw new Error("WEB_ORIGIN is not set");
  }
  return new URL(origin);
}
