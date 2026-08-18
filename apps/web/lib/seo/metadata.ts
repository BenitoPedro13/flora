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
  // `path` is "/" for the root route — naively appending "/opengraph-image"
  // produces "//opengraph-image", which `new URL` parses as protocol-relative
  // (host "opengraph-image"), not a same-origin path. Strip the trailing
  // slash first so root and nested paths both join with exactly one slash.
  const imagePath = path === "/" ? "/opengraph-image" : `${path}/opengraph-image`;
  const imageUrl = new URL(imagePath, metadataBase);
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
      images: [{ url: imageUrl.toString(), width: 1200, height: 630, alt: imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: imageUrl.toString(), alt: imageAlt }],
    },
  };
}

export { PRIVATE_ROBOTS, PUBLIC_ROBOTS };
