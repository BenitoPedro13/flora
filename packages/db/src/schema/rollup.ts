import type {
  FarmRollupPayload,
  RegenerationClass,
  RegenerationComponentResult,
  WeatherHorizon,
  WeatherSnapshotPayload,
} from "@flora/contracts";
import { weatherHorizonValues } from "@flora/contracts";
import {
  date,
  foreignKey,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth.js";
import { farms } from "./farm.js";

/** Built from `@flora/contracts` (invariant 4). */
export const weatherHorizon = pgEnum("weather_horizon", weatherHorizonValues);

/**
 * TASK-home-dashboard §2.1. All three tables carry a composite FK to
 * `farms (organization_id, id)` — `farms_organization_id_id_unique` is the
 * unique constraint that makes the composite FK possible — `ON DELETE
 * CASCADE`, and standard RLS added in the accompanying hand-written
 * migration (CLAUDE.md §2.1, same reasoning as `stress.ts`/`observation.ts`).
 *
 * `payload` is JSONB, not columns, for the reason `observations.stats` is
 * (architecture §5.3): a new widget must not need a migration. It is
 * validated against `farmRollupPayloadSchema` on write and on read, never
 * trusted because it came out of our own table.
 */
export const farmDailyRollups = pgTable(
  "farm_daily_rollups",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    farmId: uuid("farm_id").notNull(),
    day: date("day").notNull(),
    payload: jsonb("payload").notNull().$type<FarmRollupPayload>(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.farmId, table.day] }),
    foreignKey({
      columns: [table.organizationId, table.farmId],
      foreignColumns: [farms.organizationId, farms.id],
      name: "farm_daily_rollups_farm_fk",
    }).onDelete("cascade"),
  ],
);

/**
 * One row per computed day, never overwritten — `formula_version` makes a
 * formula change visible in the data, not just in git (§2.4).
 */
export const farmScores = pgTable(
  "farm_scores",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    farmId: uuid("farm_id").notNull(),
    computedOn: date("computed_on").notNull(),
    score: numeric("score").notNull(),
    class: text("class").$type<RegenerationClass>().notNull(),
    components: jsonb("components").notNull().$type<RegenerationComponentResult[]>(),
    formulaVersion: text("formula_version").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.farmId, table.computedOn] }),
    foreignKey({
      columns: [table.organizationId, table.farmId],
      foreignColumns: [farms.organizationId, farms.id],
      name: "farm_scores_farm_fk",
    }).onDelete("cascade"),
  ],
);

/**
 * `observed_at` is the ingestion run's timestamp, not the forecast's target
 * date — `horizon` (days-ahead) plus `observed_at` locate a calendar day;
 * Home reads only `horizon IN ('0', '1')` (§2.6). One hourly job writes one
 * row per horizon (8 rows) per farm.
 */
export const weatherSnapshots = pgTable(
  "weather_snapshots",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    farmId: uuid("farm_id").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    horizon: weatherHorizon("horizon").notNull(),
    payload: jsonb("payload").notNull().$type<WeatherSnapshotPayload>(),
  },
  (table) => [
    primaryKey({ columns: [table.farmId, table.observedAt, table.horizon] }),
    foreignKey({
      columns: [table.organizationId, table.farmId],
      foreignColumns: [farms.organizationId, farms.id],
      name: "weather_snapshots_farm_fk",
    }).onDelete("cascade"),
  ],
);
