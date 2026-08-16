import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { geographyPoint } from "../types/geography.js";
import { organizations } from "./auth.js";

/**
 * RLS: standard `organization_id = app_current_org()`, in 0005. Every field
 * belongs to one (architecture §5.1); `timezone` is not decoration — the
 * daily refresh schedules at "03:00 farm-local" (architecture §7.2).
 */
export const farms = pgTable(
  "farms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    location: geographyPoint("location").notNull(),
    timezone: text("timezone").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Composite-FK parent for `fields` (TASK-domain-schema §2.4) — every
    // child FK includes organization_id so a row pointing at another org's
    // parent is a constraint violation, not a silent tenancy leak.
    unique("farms_organization_id_id_unique").on(table.organizationId, table.id),
    index("farms_location_gist").using("gist", table.location),
  ],
);
