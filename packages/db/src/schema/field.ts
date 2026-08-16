import { cropCycleStatusValues } from "@flora/contracts";
import { sql } from "drizzle-orm";
import {
  date,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { geographyMultiPolygon } from "../types/geography.js";
import { organizations } from "./auth.js";
import { crops } from "./crop.js";
import { farms } from "./farm.js";

/** Built from `@flora/contracts`'s `cropCycleStatusValues` (invariant 4). */
export const cropCycleStatus = pgEnum("crop_cycle_status", cropCycleStatusValues);

/**
 * RLS: standard, in 0005. **No `area` column, ever** (invariant 3) —
 * derived through `ST_Area` in queries/fields.ts. No `soil_moisture` or
 * `carbon_ton_potential` (design-spec §5.2's field card): neither has a
 * data source anywhere in the architecture — filed as design-spec §9 gap
 * D15 rather than invented.
 */
export const fields = pgTable(
  "fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    farmId: uuid("farm_id").notNull(),
    name: text("name").notNull(),
    boundary: geographyMultiPolygon("boundary").notNull(),
    // The field list sorts by a mutable position and paginates by cursor
    // (architecture §8.1) — numeric so a reorder writes one row.
    position: numeric("position").notNull(),
    // NFR-8: a stale badge needs the last-success date, never a zero.
    // Deliberately not derived from max(observations.captured_on) — a
    // refresh that ran successfully and found no new cloud-free scene is
    // healthy, and would otherwise read as stale.
    lastRefreshAt: timestamp("last_refresh_at", { withTimezone: true }),
    lastRefreshSucceededAt: timestamp("last_refresh_succeeded_at", { withTimezone: true }),
    lastRefreshError: text("last_refresh_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.farmId],
      foreignColumns: [farms.organizationId, farms.id],
      name: "fields_farm_fk",
    }).onDelete("cascade"),
    unique("fields_organization_id_farm_id_name_unique").on(table.organizationId, table.farmId, table.name),
    // Composite-FK parent for crop_cycles, observations, stress_zones, tasks (§2.4).
    unique("fields_organization_id_id_unique").on(table.organizationId, table.id),
    index("fields_boundary_gist").using("gist", table.boundary),
    // Keyset pagination over `position` and `name` (TASK-fields §2.3) — the
    // trailing `id` makes the `(sortValue, id) > (cursor)` row-value
    // comparison usable even when many rows share a sort value.
    index("fields_org_position_id_idx").on(table.organizationId, table.position, table.id),
    index("fields_org_name_id_idx").on(table.organizationId, table.name, table.id),
  ],
);

/**
 * RLS: standard, in 0005. `growth_pct` is deliberately not a column
 * (Q10, architecture §17) — computable from `plantedOn`/`expectedHarvestOn`
 * in queries/fields.ts, the same reasoning that keeps `area` out of
 * `fields`. A field has at most one `growing` cycle, enforced by the
 * partial unique index below, not application logic.
 */
export const cropCycles = pgTable(
  "crop_cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id").notNull(),
    cropId: uuid("crop_id").notNull(),
    plantedOn: date("planted_on").notNull(),
    expectedHarvestOn: date("expected_harvest_on").notNull(),
    status: cropCycleStatus("status").notNull(),
    quantityKg: numeric("quantity_kg"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.fieldId],
      foreignColumns: [fields.organizationId, fields.id],
      name: "crop_cycles_field_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.cropId],
      foreignColumns: [crops.organizationId, crops.id],
      name: "crop_cycles_crop_fk",
    }).onDelete("cascade"),
    uniqueIndex("crop_cycles_one_growing_per_field")
      .on(table.fieldId)
      .where(sql`status = 'growing'`),
  ],
);
