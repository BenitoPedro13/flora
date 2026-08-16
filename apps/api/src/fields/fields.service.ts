import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateCropCycle,
  CreateField,
  CropCycle,
  Field,
  FieldFeatureCollection,
  FieldGeojsonQuery,
  FieldSummary,
  ListFieldsQuery,
  Page,
  UpdateCropCycle,
  UpdateField,
} from '@flora/contracts';
import type { Tx } from '@flora/db';
import {
  deleteField,
  getCropCycleById,
  getFieldWithCycle,
  insertCropCycle,
  insertField,
  listFieldGeometries,
  listFields,
  nextFieldPosition,
  updateCropCycle,
  updateField,
} from '@flora/db';

/**
 * Wraps `packages/db`'s field queries — no SQL here (invariant 5), every
 * call takes the `Tx` `TenantTx()` handed the controller. 404s come from a
 * `null` lookup, never a caught RLS error (NFR-7): the repository filter is
 * what actually returns nothing for a foreign-org id, RLS is the backstop.
 */
@Injectable()
export class FieldsService {
  async list(
    tx: Tx,
    organizationId: string,
    query: ListFieldsQuery,
  ): Promise<Page<FieldSummary>> {
    const result = await listFields(tx, organizationId, {
      farmId: query.farmId,
      q: query.q,
      cropId: query.cropId,
      sort: query.sort,
      cursor: query.cursor,
      limit: query.limit,
    });
    return { items: result.items, nextCursor: result.nextCursor };
  }

  async geojson(
    tx: Tx,
    organizationId: string,
    query: FieldGeojsonQuery,
  ): Promise<FieldFeatureCollection> {
    return listFieldGeometries(tx, organizationId, query.bbox);
  }

  async create(
    tx: Tx,
    organizationId: string,
    input: CreateField,
  ): Promise<Field> {
    const position = await nextFieldPosition(tx, organizationId, input.farmId);
    const fieldId = await insertField(tx, {
      organizationId,
      farmId: input.farmId,
      name: input.name,
      boundary: input.boundary,
      position,
    });
    if (input.cropCycle) {
      await insertCropCycle(tx, {
        organizationId,
        fieldId,
        cropId: input.cropCycle.cropId,
        plantedOn: input.cropCycle.plantedOn,
        expectedHarvestOn: input.cropCycle.expectedHarvestOn,
        status: input.cropCycle.status,
        quantityKg: input.cropCycle.quantityKg,
      });
    }
    return this.get(tx, organizationId, fieldId);
  }

  async get(
    tx: Tx,
    organizationId: string,
    id: string,
  ): Promise<Field & { cropCycle: FieldSummary['cropCycle'] }> {
    const row = await getFieldWithCycle(tx, organizationId, id);
    if (!row) {
      throw new NotFoundException();
    }
    return row;
  }

  async update(
    tx: Tx,
    organizationId: string,
    id: string,
    input: UpdateField,
  ): Promise<Field & { cropCycle: FieldSummary['cropCycle'] }> {
    const existing = await getFieldWithCycle(tx, organizationId, id);
    if (!existing) {
      throw new NotFoundException();
    }
    await updateField(tx, organizationId, id, {
      name: input.name,
      boundary: input.boundary,
    });
    return this.get(tx, organizationId, id);
  }

  async remove(tx: Tx, organizationId: string, id: string): Promise<void> {
    const existing = await getFieldWithCycle(tx, organizationId, id);
    if (!existing) {
      throw new NotFoundException();
    }
    await deleteField(tx, organizationId, id);
  }

  async addCropCycle(
    tx: Tx,
    organizationId: string,
    fieldId: string,
    input: CreateCropCycle,
  ): Promise<CropCycle> {
    const field = await getFieldWithCycle(tx, organizationId, fieldId);
    if (!field) {
      throw new NotFoundException();
    }
    const cropCycleId = await insertCropCycle(tx, {
      organizationId,
      fieldId,
      cropId: input.cropId,
      plantedOn: input.plantedOn,
      expectedHarvestOn: input.expectedHarvestOn,
      status: input.status,
      quantityKg: input.quantityKg,
    });
    return (await getCropCycleById(tx, organizationId, cropCycleId))!;
  }

  async updateCropCycleById(
    tx: Tx,
    organizationId: string,
    id: string,
    input: UpdateCropCycle,
  ): Promise<CropCycle> {
    const updatedId = await updateCropCycle(tx, organizationId, id, input);
    if (!updatedId) {
      throw new NotFoundException();
    }
    return (await getCropCycleById(tx, organizationId, updatedId))!;
  }
}
