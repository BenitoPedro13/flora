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
  /** Passed through to openGraph.images alt text when set. */
  ogImageAlt?: string;
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
  ogImageAlt,
}: PageMetadataInput): Metadata {
  const metadataBase = getMetadataBase();
  const canonical = new URL(path, metadataBase);
  const imageAlt = ogImageAlt ?? title;

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
      images: [{ url: "./opengraph-image", width: 1200, height: 630, alt: imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: "./opengraph-image", alt: imageAlt }],
    },
  };
}

export { PRIVATE_ROBOTS, PUBLIC_ROBOTS };
