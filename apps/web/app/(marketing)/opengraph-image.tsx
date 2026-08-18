import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/seo/og-image";
import { MARKETING_DESCRIPTION } from "@/lib/seo/site";

export const alt = "Flora — regenerative farm operations platform";
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    title: "Regenerative farm operations",
    description: MARKETING_DESCRIPTION,
    icon: "🌱",
  });
}
