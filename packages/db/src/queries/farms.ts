import type { Point } from "@flora/contracts";
import { sql } from "drizzle-orm";
import type { Tx } from "../tenancy.js";

export interface FarmRecord {
  id: string;
  name: string;
  location: Point;
  timezone: string;
}

interface FarmRow {
  [key: string]: unknown;
  id: string;
  name: string;
  location: Point;
  timezone: string;
}

/** The `Select` in the field editor (§2.8) — auto-selected and hidden when an org has exactly one farm. */
export async function listFarms(tx: Tx, organizationId: string): Promise<FarmRecord[]> {
  const rows = await tx.execute<FarmRow>(sql`
    SELECT id, name, ST_AsGeoJSON(location)::json AS location, timezone
    FROM farms
    WHERE organization_id = ${organizationId}
    ORDER BY name
  `);
  return rows.rows.map((row) => ({
    id: row.id,
    name: row.name,
    location: row.location,
    timezone: row.timezone,
  }));
}

/** `GET /farms/:id/dashboard`'s 404 check (NFR-7) — TASK-home-dashboard §2.8. */
export async function getFarm(tx: Tx, organizationId: string, id: string): Promise<FarmRecord | null> {
  const rows = await tx.execute<FarmRow>(sql`
    SELECT id, name, ST_AsGeoJSON(location)::json AS location, timezone
    FROM farms
    WHERE organization_id = ${organizationId} AND id = ${id}
  `);
  const row = rows.rows[0];
  return row ? { id: row.id, name: row.name, location: row.location, timezone: row.timezone } : null;
}
