import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { citext } from "../types/citext.js";
import { organizations } from "./auth.js";

/**
 * Tenant-scoped, not a global reference table (TASK-domain-schema §2.2): a
 * global table would carry no organization_id, which the catalog test
 * (queries/tenancy.spec.ts) cannot see without a written carve-out, and an
 * org that grows something outside a fixed list would have nowhere to put
 * it. RLS: standard, in 0005.
 */
export const crops = pgTable(
  "crops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: citext("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("crops_organization_id_slug_unique").on(table.organizationId, table.slug),
    // Composite-FK parent for `crop_cycles` (§2.4).
    unique("crops_organization_id_id_unique").on(table.organizationId, table.id),
  ],
);
