import type { MetadataRoute } from "next";
import { getMetadataBase } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/home", "/fields", "/tasks", "/weather", "/login", "/api/"],
    },
    sitemap: new URL("/sitemap.xml", getMetadataBase()).href,
  };
}
