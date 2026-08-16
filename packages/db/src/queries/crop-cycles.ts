import { and, eq, sql } from "drizzle-orm";
import { cropCycles } from "../schema/field.js";
import type { Tx } from "../tenancy.js";
import { GROWTH_PCT_SQL } from "./fields.js";

/**
 * `crop_cycles_one_growing_per_field`'s unique-index violation (Postgres
 * `23505`), mapped to a typed error so the API returns **409**, not a 500
 * (TASK-fields §2.3).
 */
export class OneGrowingCycleError extends Error {
  constructor() {
    super("This field already has a growing crop cycle");
    this.name = "OneGrowingCycleError";
  }
}

function isUniqueViolation(err: unknown, constraint: string): boolean {
  const cause = (err as { cause?: unknown } | undefined)?.cause;
  const pgError = cause as { code?: string; constraint?: string } | undefined;
  return pgError?.code === "23505" && pgError.constraint === constraint;
}

export interface InsertCropCycleInput {
  organizationId: string;
  fieldId: string;
  cropId: string;
  plantedOn: string;
  expectedHarvestOn: string;
  status: "planned" | "growing" | "harvested" | "failed";
  quantityKg: number | null;
}

export async function insertCropCycle(tx: Tx, input: InsertCropCycleInput): Promise<string> {
  try {
    const [row] = await tx
      .insert(cropCycles)
      .values({
        organizationId: input.organizationId,
        fieldId: input.fieldId,
        cropId: input.cropId,
        plantedOn: input.plantedOn,
        expectedHarvestOn: input.expectedHarvestOn,
        status: input.status,
        quantityKg: input.quantityKg === null ? null : String(input.quantityKg),
      })
      .returning({ id: cropCycles.id });
    return row!.id;
  } catch (err) {
    if (isUniqueViolation(err, "crop_cycles_one_growing_per_field")) {
      throw new OneGrowingCycleError();
    }
    throw err;
  }
}

export interface UpdateCropCycleInput {
  cropId?: string;
  plantedOn?: string;
  expectedHarvestOn?: string;
  status?: "planned" | "growing" | "harvested" | "failed";
  quantityKg?: number | null;
}

/** Returns the updated row's id, or `null` if no row in this org matched (the caller's 404). */
export async function updateCropCycle(
  tx: Tx,
  organizationId: string,
  id: string,
  patch: UpdateCropCycleInput,
): Promise<string | null> {
  try {
    const [row] = await tx
      .update(cropCycles)
      .set({
        ...(patch.cropId !== undefined ? { cropId: patch.cropId } : {}),
        ...(patch.plantedOn !== undefined ? { plantedOn: patch.plantedOn } : {}),
        ...(patch.expectedHarvestOn !== undefined ? { expectedHarvestOn: patch.expectedHarvestOn } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.quantityKg !== undefined
          ? { quantityKg: patch.quantityKg === null ? null : String(patch.quantityKg) }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(cropCycles.organizationId, organizationId), eq(cropCycles.id, id)))
      .returning({ id: cropCycles.id });
    return row?.id ?? null;
  } catch (err) {
    if (isUniqueViolation(err, "crop_cycles_one_growing_per_field")) {
      throw new OneGrowingCycleError();
    }
    throw err;
  }
}

export interface CropCycleRecord {
  id: string;
  cropId: string;
  cropName: string;
  plantedOn: string;
  expectedHarvestOn: string;
  status: "planned" | "growing" | "harvested" | "failed";
  quantityKg: number | null;
}

export interface CropCycleWithGrowthRecord extends CropCycleRecord {
  growthPct: number;
}

/** The response shape for `POST /fields/:id/crop-cycles` and `PATCH /crop-cycles/:id` — `id` is org-scoped, RLS-backed (NFR-7). */
export async function getCropCycleById(tx: Tx, organizationId: string, id: string): Promise<CropCycleWithGrowthRecord | null> {
  const result = await tx.execute<{
    id: string;
    crop_id: string;
    crop_name: string;
    planted_on: string;
    expected_harvest_on: string;
    status: "planned" | "growing" | "harvested" | "failed";
    quantity_kg: string | null;
    growth_pct: string | number;
  }>(sql`
      SELECT cc.id, cc.crop_id, c.name AS crop_name, cc.planted_on, cc.expected_harvest_on,
        cc.status, cc.quantity_kg, ${GROWTH_PCT_SQL} AS growth_pct
      FROM crop_cycles cc
      JOIN crops c ON c.organization_id = cc.organization_id AND c.id = cc.crop_id
      JOIN fields f ON f.organization_id = cc.organization_id AND f.id = cc.field_id
      JOIN farms fa ON fa.organization_id = f.organization_id AND fa.id = f.farm_id
      WHERE cc.organization_id = ${organizationId} AND cc.id = ${id}
    `);
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    cropId: row.crop_id,
    cropName: row.crop_name,
    plantedOn: row.planted_on,
    expectedHarvestOn: row.expected_harvest_on,
    status: row.status,
    quantityKg: row.quantity_kg === null ? null : Number(row.quantity_kg),
    growthPct: Number(row.growth_pct),
  };
}

export async function listCropCyclesForField(
  tx: Tx,
  organizationId: string,
  fieldId: string,
): Promise<CropCycleRecord[]> {
  const result = await tx.execute<{
    id: string;
    crop_id: string;
    crop_name: string;
    planted_on: string;
    expected_harvest_on: string;
    status: "planned" | "growing" | "harvested" | "failed";
    quantity_kg: string | null;
  }>(sql`
      SELECT cc.id, cc.crop_id, c.name AS crop_name, cc.planted_on, cc.expected_harvest_on, cc.status, cc.quantity_kg
      FROM crop_cycles cc
      JOIN crops c ON c.organization_id = cc.organization_id AND c.id = cc.crop_id
      WHERE cc.organization_id = ${organizationId} AND cc.field_id = ${fieldId}
      ORDER BY cc.planted_on DESC
    `);
  return result.rows.map((row) => ({
    id: row.id,
    cropId: row.crop_id,
    cropName: row.crop_name,
    plantedOn: row.planted_on,
    expectedHarvestOn: row.expected_harvest_on,
    status: row.status,
    quantityKg: row.quantity_kg === null ? null : Number(row.quantity_kg),
  }));
}
