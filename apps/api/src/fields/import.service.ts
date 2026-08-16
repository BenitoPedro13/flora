import { Injectable } from '@nestjs/common';
import type {
  ImportCommit,
  ImportCommitResult,
  ImportFeatureCollection,
  ImportPreview,
  ImportPreviewRow,
} from '@flora/contracts';
import { multiPolygonSchema } from '@flora/contracts';
import type { Tx } from '@flora/db';
import {
  checkBoundaryValidity,
  insertField,
  listFieldNames,
  nextFieldPosition,
} from '@flora/db';

/**
 * GeoJSON-only import, preview-then-commit (TASK-fields §2.9). Nothing is
 * written before `commit` — architecture §11.5's rule (*silently importing
 * misprojected polygons is worse than failing*) is the entire reason for the
 * two-step, and it's what makes doing this synchronously, with no queue,
 * acceptable: the expensive, irreversible half sits behind an explicit
 * confirmation.
 */
@Injectable()
export class ImportService {
  async preview(
    tx: Tx,
    organizationId: string,
    body: ImportFeatureCollection,
  ): Promise<ImportPreview> {
    const existingNames = new Set(await listFieldNames(tx, organizationId));
    const rows: ImportPreviewRow[] = [];

    for (const [index, feature] of body.features.entries()) {
      const name = resolveName(feature.properties, index);
      const geometry = feature.geometry;

      if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
        rows.push({
          index,
          name,
          boundary: null,
          areaM2: null,
          valid: false,
          reason: `Skipped: ${geometry.type} is not a polygon`,
        });
        continue;
      }

      const asMultiPolygon: unknown =
        geometry.type === 'Polygon'
          ? { type: 'MultiPolygon', coordinates: [geometry.coordinates] }
          : geometry;
      const parsed = multiPolygonSchema.safeParse(asMultiPolygon);
      if (!parsed.success) {
        rows.push({
          index,
          name,
          boundary: null,
          areaM2: null,
          valid: false,
          reason: parsed.error.issues[0]?.message ?? 'Invalid geometry',
        });
        continue;
      }

      const validity = await checkBoundaryValidity(tx, parsed.data);
      if (!validity.valid) {
        rows.push({
          index,
          name,
          boundary: parsed.data,
          areaM2: null,
          valid: false,
          reason: validity.reason,
        });
        continue;
      }

      if (existingNames.has(name)) {
        rows.push({
          index,
          name,
          boundary: parsed.data,
          areaM2: validity.areaM2,
          valid: false,
          reason: 'A field with this name already exists',
        });
        continue;
      }

      rows.push({
        index,
        name,
        boundary: parsed.data,
        areaM2: validity.areaM2,
        valid: true,
        reason: null,
      });
    }

    return { rows };
  }

  async commit(
    tx: Tx,
    organizationId: string,
    body: ImportCommit,
  ): Promise<ImportCommitResult> {
    const startingPosition = await nextFieldPosition(
      tx,
      organizationId,
      body.farmId,
    );
    for (const [offset, row] of body.rows.entries()) {
      await insertField(tx, {
        organizationId,
        farmId: body.farmId,
        name: row.name,
        boundary: row.boundary,
        position: startingPosition + offset,
      });
    }
    return { created: body.rows.length };
  }
}

function resolveName(
  properties: Record<string, unknown> | null | undefined,
  index: number,
): string {
  const candidate = properties?.name ?? properties?.Name ?? properties?.NAME;
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : `Imported field ${index + 1}`;
}
