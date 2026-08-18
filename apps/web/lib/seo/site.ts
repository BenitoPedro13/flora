/** Product-wide SEO constants — keep copy aligned with the landing hero (TASK-landing-page). */

export const SITE_NAME = "Flora";
export const SITE_NAME_MARK = "Flora™";

export const DEFAULT_DESCRIPTION =
  "Operations console for regenerative farms — satellite crop health, field management, tasks, and weather in one place.";

export const MARKETING_DESCRIPTION =
  "Our platform empowers agriculture to restore ecosystems, turning your farm into a regenerative success story.";

export function getMetadataBase(): URL {
  const origin = process.env.WEB_ORIGIN;
  if (!origin) {
    throw new Error("WEB_ORIGIN is not set");
  }
  return new URL(origin);
}
