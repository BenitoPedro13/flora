import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/seo/og-image";

export const alt = "Flora fields and crops";
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    title: "Fields & Crops",
    description: "Register fields, draw boundaries, and track crop cycles on the map.",
    badge: "Fields",
    icon: "🌾",
  });
}
