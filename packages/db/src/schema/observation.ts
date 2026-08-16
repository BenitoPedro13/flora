import { observationIndexValues, type BBox, type ObservationStats } from "@flora/contracts";
import {
  date,
  foreignKey,
  index as pgIndex,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth.js";
import { fields } from "./field.js";

/** Built from `@flora/contracts`'s `observationIndexValues` (invariant 4). */
export const observationIndex = pgEnum("observation_index", observationIndexValues);

/**
 * The central time series (architecture §5.3). RLS: standard, in 0005.
 * `PRIMARY KEY (field_id, captured_on, index)` exactly as the architecture
 * specifies. Imports the index builder as `pgIndex` — the column below is
 * also named `index`.
 */
export const observations = pgTable(
  "observations",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id").notNull(),
    capturedOn: date("captured_on").notNull(),
    index: observationIndex("index").notNull(),
    // min/max/mean/stddev/p10/p90 — JSONB, not columns, so adding a
    // statistic never needs a migration (architecture §5.3). Validated on
    // write against `observationStatsSchema` in packages/contracts.
    stats: jsonb("stats").notNull().$type<ObservationStats>(),
    // The R2 object key for the rendered PNG — never a signed URL
    // (invariant 2). A persisted signed URL expires in the database.
    rasterKey: text("raster_key").notNull(),
    // The raster's geographic extent, needed to place it as a Mapbox image
    // source (architecture §9.5). Validated against `bboxSchema`.
    bbox: jsonb("bbox").notNull().$type<BBox>(),
    sceneId: text("scene_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.fieldId, table.capturedOn, table.index] }),
    foreignKey({
      columns: [table.organizationId, table.fieldId],
      foreignColumns: [fields.organizationId, fields.id],
      name: "observations_field_fk",
    }).onDelete("cascade"),
    // Serves GET /fields/:id/observations?index=&from=&to= and its /dates
    // sibling (architecture §8.3) under NFR-2's 50ms p95.
    pgIndex("observations_org_field_index_captured_desc").on(
      table.organizationId,
      table.fieldId,
      table.index,
      table.capturedOn.desc(),
    ),
  ],
);
