import type { Metadata } from "next";
import { DEFAULT_DESCRIPTION, SITE_NAME, getMetadataBase } from "./site";

type RobotsDirective = Metadata["robots"];

export type PageMetadataInput = {
  /** Visible page title — root layout's template appends " · Flora". */
  title: string;
  description?: string;
  /** Pathname including leading slash, e.g. `/fields`. */
  path: string;
  robots?: RobotsDirective;
};

const PRIVATE_ROBOTS: RobotsDirective = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
};

const PUBLIC_ROBOTS: RobotsDirective = {
  index: true,
  follow: true,
  googleBot: { index: true, follow: true },
};

export function createPageMetadata({
  title,
  description = DEFAULT_DESCRIPTION,
  path,
  robots = PRIVATE_ROBOTS,
}: PageMetadataInput): Metadata {
  const metadataBase = getMetadataBase();
  const canonical = new URL(path, metadataBase);

  // No `openGraph.images`/`twitter.images` here — every route has a
  // colocated `opengraph-image.tsx`, and Next's own file convention already
  // auto-injects the correct `og:image`/`twitter:image` tags for it. Its
  // real URL carries a per-build content hash (e.g. `/opengraph-image-pwu6ef`,
  // confirmed by inspecting `.next/routes-manifest.json` — not documented,
  // and not reproducible by hand here), so a hand-built `/opengraph-image`
  // URL doesn't just risk going stale, it 404s outright: setting `images`
  // explicitly overrides the auto-injected one instead of supplementing it.
  // Route-specific alt text likewise belongs to each `opengraph-image.tsx`'s
  // own `export const alt`, not here.
  return {
    title,
    description,
    alternates: { canonical },
    robots,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url: canonical,
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export { PRIVATE_ROBOTS, PUBLIC_ROBOTS };
