import type { BBox, ObservationIndex, ObservationStats } from "@flora/contracts";
import type { DetectedZone } from "@flora/raster";
import { findOverlappingZone, insertStressZone, updateStressZoneGeometry } from "./stress-zones.js";
import { upsertObservation } from "./observations.js";
import type { Tx } from "../tenancy.js";

/**
 * Observations + stress-zone reconciliation (architecture §7.2 step 4,
 * TASK-satellite-pipeline §2.9's re-detection rule). Lives in `packages/db`,
 * not `apps/worker`, so `packages/db/src/seed-satellite.ts` can call the
 * *exact same* reconciliation code the worker's refresh processor uses
 * (§3.5) — the whole point of the seed replaying the fixture through real
 * pipeline code rather than hand-writing rows. Zones with no match this run
 * are left alone, not deleted — they age out of `isNew` on their own.
 */
export interface UpsertObservationAndZonesInput {
  organizationId: string;
  fieldId: string;
  capturedOn: string;
  index: ObservationIndex;
  stats: ObservationStats;
  rasterKey: string;
  bbox: BBox;
  sceneId: string;
  zones: DetectedZone[];
  windowStart: string;
  windowEnd: string;
}

export async function upsertObservationAndZones(tx: Tx, input: UpsertObservationAndZonesInput): Promise<void> {
  await upsertObservation(tx, {
    organizationId: input.organizationId,
    fieldId: input.fieldId,
    capturedOn: input.capturedOn,
    index: input.index,
    stats: input.stats,
    rasterKey: input.rasterKey,
    bbox: input.bbox,
    sceneId: input.sceneId,
  });

  for (const zone of input.zones) {
    const overlap = await findOverlappingZone(tx, input.organizationId, input.fieldId, zone.geometry);
    if (overlap) {
      // Preserves classification and muted_at — an operator's triage
      // survives the next refresh finding the same problem.
      await updateStressZoneGeometry(tx, input.organizationId, overlap.id, {
        geometry: zone.geometry,
        detectedOn: input.capturedOn,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        severity: zone.severity,
        indexValue: zone.indexValue,
      });
    } else {
      await insertStressZone(tx, {
        organizationId: input.organizationId,
        fieldId: input.fieldId,
        geometry: zone.geometry,
        detectedOn: input.capturedOn,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        severity: zone.severity,
        indexValue: zone.indexValue,
      });
    }
  }
}
