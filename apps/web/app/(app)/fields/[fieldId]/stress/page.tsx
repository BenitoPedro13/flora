import { z } from "zod";
import {
  fieldFeatureCollectionSchema,
  fieldSchema,
  fieldSummarySchema,
  observationSchema,
  pageSchema,
  stressZoneSchema,
} from "@flora/contracts";
import { apiFetchServer } from "@/lib/api-client.server";
import { StressPanel } from "./stress-panel";

/**
 * The Crop Stress screen (`18:6567`, TASK-crop-stress §2.7) — reads the
 * write path `TASK-satellite-pipeline` built. Four fetches in parallel
 * server-side; the client component seeds its TanStack Query cache from
 * this via `initialData`, so switching date/index/sort is instant without a
 * loading flash on first paint.
 */
export default async function CropStressPage({ params }: { params: Promise<{ fieldId: string }> }) {
  const { fieldId } = await params;

  const [field, observations, stressZones, geojson, fieldsPage] = await Promise.all([
    apiFetchServer(`/api/v1/fields/${fieldId}`, fieldSchema),
    apiFetchServer(`/api/v1/fields/${fieldId}/observations?index=ndvi`, z.array(observationSchema)),
    apiFetchServer(`/api/v1/fields/${fieldId}/stress-zones?sort=priority`, z.array(stressZoneSchema)),
    apiFetchServer("/api/v1/fields/geojson", fieldFeatureCollectionSchema),
    apiFetchServer("/api/v1/fields?sort=position&limit=100", pageSchema(fieldSummarySchema)),
  ]);

  return (
    <StressPanel
      fieldId={fieldId}
      initialField={field}
      initialObservations={observations}
      initialStressZones={stressZones}
      initialGeojson={geojson}
      initialFields={fieldsPage.items}
    />
  );
}
