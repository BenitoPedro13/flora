import { fieldSchema } from "@flora/contracts";
import { apiFetchServer } from "@/lib/api-client.server";
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/seo/og-image";

export const alt = "Flora crop stress";
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ fieldId: string }> }) {
  const { fieldId } = await params;

  try {
    const field = await apiFetchServer(`/api/v1/fields/${fieldId}`, fieldSchema);
    return renderOgImage({
      title: field.name,
      description: "Satellite crop stress, stress zones, and detections.",
      badge: "Crop Stress",
      icon: "⚠️",
    });
  } catch {
    return renderOgImage({
      title: "Crop Stress",
      description: "Satellite-derived crop health and stress zones.",
      badge: "Crop Stress",
      icon: "⚠️",
    });
  }
}
