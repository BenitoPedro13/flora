/** Product-wide SEO constants — keep copy aligned with the landing hero (TASK-landing-page). */

export const SITE_NAME = "Flora";
export const SITE_NAME_MARK = "Flora™";

export const DEFAULT_DESCRIPTION =
  "Operations console for regenerative farms — satellite crop health, field management, tasks, and weather in one place.";

export const MARKETING_DESCRIPTION =
  "Our platform empowers agriculture to restore ecosystems, turning your farm into a regenerative success story.";

// `/` and `/login` are statically prerendered, so their metadata (og:image,
// canonical, og:url) is computed once at `next build`, not per-request —
// WEB_ORIGIN must be present at build time, which apps/web/Dockerfile
// guarantees via a build arg (TASK-aws-deploy §2.4). No fallback: a
// placeholder here once shipped wrong OG URLs silently (TASK-railway-deploy).
export function getMetadataBase(): URL {
  const origin = process.env.WEB_ORIGIN;
  if (!origin) {
    throw new Error("WEB_ORIGIN is not set");
  }
  return new URL(origin);
}
