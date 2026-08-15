import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { geographyMultiPolygon } from "../types/geography.js";

/**
 * Temporary. Exists only to prove the PostGIS round-trip (architecture.md
 * §5.2, §2.5 of TASK-foundations). Dropped in TASK-domain-schema once the
 * real `fields` table lands.
 */
export const geoSpike = pgTable("geo_spike", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  boundary: geographyMultiPolygon("boundary").notNull(),
});
