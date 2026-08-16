import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ListStressZonesQuery,
  StressZone,
  UpdateStressZone,
} from '@flora/contracts';
import type { Tx } from '@flora/db';
import {
  fieldExists,
  getStressZone,
  listStressZones,
  setStressZoneClassification,
  setStressZoneMuted,
  softDeleteStressZone,
} from '@flora/db';

/** No SQL here (invariant 5); every 404 comes from a `null`/`false` lookup, never a caught RLS error (NFR-7). */
@Injectable()
export class StressZonesService {
  async list(
    tx: Tx,
    organizationId: string,
    fieldId: string,
    query: ListStressZonesQuery,
  ): Promise<StressZone[]> {
    if (!(await fieldExists(tx, organizationId, fieldId))) {
      throw new NotFoundException();
    }
    return listStressZones(tx, organizationId, fieldId, { sort: query.sort });
  }

  async update(
    tx: Tx,
    organizationId: string,
    id: string,
    input: UpdateStressZone,
  ): Promise<StressZone> {
    const existing = await getStressZone(tx, organizationId, id);
    if (!existing) {
      throw new NotFoundException();
    }
    if (input.classification !== undefined) {
      await setStressZoneClassification(
        tx,
        organizationId,
        id,
        input.classification,
      );
    }
    if (input.muted !== undefined) {
      await setStressZoneMuted(tx, organizationId, id, input.muted);
    }
    return (await getStressZone(tx, organizationId, id))!;
  }

  /** Soft — sets `deleted_at`, never a row delete (architecture §5.3). */
  async remove(tx: Tx, organizationId: string, id: string): Promise<void> {
    const deleted = await softDeleteStressZone(tx, organizationId, id);
    if (!deleted) {
      throw new NotFoundException();
    }
  }
}
