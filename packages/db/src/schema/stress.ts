import { stressClassificationValues, stressSeverityValues } from "@flora/contracts";
import { sql } from "drizzle-orm";
import { date, foreignKey, index, numeric, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { geographyPolygon } from "../types/geography.js";
import { organizations } from "./auth.js";
import { fields } from "./field.js";

/** Built from `@flora/contracts` (invariant 4). */
export const stressClassification = pgEnum("stress_classification", stressClassificationValues);
export const stressSeverity = pgEnum("stress_severity", stressSeverityValues);

/**
 * RLS: standard, in 0005. Soft delete (architecture §5.3): an operator
 * deleting a true positive stays auditable — `DELETE /stress-zones/:id` is a
 * `deleted_at` write, not a row delete. The re-detection rule (§7.5) is
 * worker logic in `TASK-crop-stress`, not a constraint here; the GIST index
 * is what makes it cheap.
 */
export const stressZones = pgTable(
  "stress_zones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id").notNull(),
    geometry: geographyPolygon("geometry").notNull(),
    detectedOn: date("detected_on").notNull(),
    windowStart: date("window_start").notNull(),
    windowEnd: date("window_end").notNull(),
    classification: stressClassification("classification").notNull(),
    severity: stressSeverity("severity").notNull(),
    indexValue: numeric("index_value").notNull(),
    mutedAt: timestamp("muted_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.fieldId],
      foreignColumns: [fields.organizationId, fields.id],
      name: "stress_zones_field_fk",
    }).onDelete("cascade"),
    index("stress_zones_geometry_gist").using("gist", table.geometry),
    index("stress_zones_org_field_detected_desc")
      .on(table.organizationId, table.fieldId, table.detectedOn.desc())
      .where(sql`deleted_at IS NULL`),
  ],
);
