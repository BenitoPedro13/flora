import type { MetadataRoute } from "next";
import { getMetadataBase } from "@/lib/seo/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getMetadataBase();

  return [
    {
      url: base.href,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
