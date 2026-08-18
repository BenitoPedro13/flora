import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/seo/og-image";

export const alt = "Flora weather forecast";
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    title: "Weather",
    description: "Eight-day forecast with temperature, wind, UV, and hourly detail.",
    badge: "Weather",
  });
}
