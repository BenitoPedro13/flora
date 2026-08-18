import { farmSchema, cropSchema, fieldFeatureCollectionSchema, fieldSummarySchema, pageSchema } from "@flora/contracts";
import { z } from "zod";
import { apiFetchServer } from "@/lib/api-client.server";
import { FieldListPanel } from "./field-list-panel";
import { createPageMetadata } from "@/lib/seo/metadata";

export const metadata = createPageMetadata({
  title: "Fields & Crops",
  description: "Manage field boundaries, crop cycles, and satellite-derived health on the map.",
  path: "/fields",
  ogImageAlt: "Flora fields and crops",
});

/**
 * The Fields screen (design-spec §5.2, `1:35172`) — the first task-doc
 * spine screen (architecture §16): register the crop, see it struggle, act
 * on it. This page fetches page 1 + the map's geometry + farms/crops
 * server-side (the client's `useInfiniteQuery` seeds from this via
 * `initialData`, TASK-fields §2.11) and hands everything to the one client
 * component that owns the screen's interactive state.
 */
export default async function FieldsPage() {
  const [fieldsPage, geojson, farms, crops] = await Promise.all([
    apiFetchServer("/api/v1/fields?sort=position", pageSchema(fieldSummarySchema)),
    apiFetchServer("/api/v1/fields/geojson", fieldFeatureCollectionSchema),
    apiFetchServer("/api/v1/farms", z.array(farmSchema)),
    apiFetchServer("/api/v1/crops", z.array(cropSchema)),
  ]);

  return <FieldListPanel initialFieldsPage={fieldsPage} initialGeojson={geojson} farms={farms} crops={crops} />;
}
