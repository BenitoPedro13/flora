import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/seo/og-image";

export const alt = "Flora tasks board";
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    title: "Tasks",
    description: "Plan, track, and complete farm work on the Kanban board.",
    badge: "Tasks",
  });
}
