import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/seo/og-image";

export const alt = "Flora home dashboard";
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    title: "Home",
    description: "KPIs, regeneration score, productivity, weather, and tasks at a glance.",
    badge: "Dashboard",
  });
}
