import { MARKETING_DESCRIPTION, SITE_NAME, getMetadataBase } from "./site";

/**
 * `Organization` + `WebSite` JSON-LD for the one public, indexable route
 * (`app/(marketing)/page.tsx`). No `SearchAction` — the product has no
 * public search surface. Values come from `site.ts`, not hand-typed here,
 * so they can't drift from the metadata/OG copy that already uses them.
 *
 * Rendered via a native `<script>` tag per Next's own JSON-LD guide
 * (`docs/app/guides/json-ld`), not `next/script` — JSON-LD is structured
 * data, not executable code.
 */
export function getMarketingJsonLd() {
  const base = getMetadataBase().href;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${base}#organization`,
        name: SITE_NAME,
        url: base,
        logo: `${base}landing/logo-leaf.svg`,
      },
      {
        "@type": "WebSite",
        "@id": `${base}#website`,
        name: SITE_NAME,
        url: base,
        description: MARKETING_DESCRIPTION,
        publisher: { "@id": `${base}#organization` },
      },
    ],
  };
}
