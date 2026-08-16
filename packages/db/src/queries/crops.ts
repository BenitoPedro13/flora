import { eq } from "drizzle-orm";
import { crops } from "../schema/crop.js";
import type { Tx } from "../tenancy.js";

export interface CropRecord {
  id: string;
  name: string;
  slug: string;
}

export async function listCrops(tx: Tx, organizationId: string): Promise<CropRecord[]> {
  const rows = await tx
    .select({ id: crops.id, name: crops.name, slug: crops.slug })
    .from(crops)
    .where(eq(crops.organizationId, organizationId))
    .orderBy(crops.name);
  return rows;
}

/** `crops_organization_id_slug_unique` (citext) is the backstop — this is a best-effort human-readable slug, not the uniqueness guarantee. */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The editor's inline "add species" path (§2.8) — `POST /crops`. */
export async function insertCrop(tx: Tx, organizationId: string, name: string): Promise<CropRecord> {
  const [row] = await tx
    .insert(crops)
    .values({ organizationId, name, slug: slugify(name) })
    .returning({ id: crops.id, name: crops.name, slug: crops.slug });
  return row!;
}
