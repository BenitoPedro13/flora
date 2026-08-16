import { taskActivityValues, taskStatusValues } from "@flora/contracts";
import {
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { memberships, organizations } from "./auth.js";
import { fields } from "./field.js";

/** Built from `@flora/contracts` (invariant 4). */
export const taskStatus = pgEnum("task_status", taskStatusValues);
export const taskActivity = pgEnum("task_activity", taskActivityValues);

/**
 * RLS: standard, in 0005. `field_id` is nullable — a task with no field is
 * legitimate. The FK uses PG16's column-list `ON DELETE SET NULL (field_id)`
 * (§2.4, verified against a live PG16): deleting a field nulls only
 * `field_id` and leaves `organization_id NOT NULL` intact, and under
 * `MATCH SIMPLE` a NULL `field_id` skips the FK check entirely. `ON DELETE
 * CASCADE` was rejected — deleting a field must not erase the record of
 * work done on it. `position` is `numeric` (architecture §5.3): a
 * drag-and-drop reorder is one row updated between two neighbours.
 */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id"),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatus("status").notNull(),
    progressPct: integer("progress_pct"),
    activity: taskActivity("activity").notNull(),
    startsOn: date("starts_on"),
    dueOn: date("due_on"),
    position: numeric("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.fieldId],
      foreignColumns: [fields.organizationId, fields.id],
      name: "tasks_field_fk",
    }).onDelete("set null"),
    // Composite-FK parent for task_assignees, task_comments, subtasks (§2.4).
    unique("tasks_organization_id_id_unique").on(table.organizationId, table.id),
    // The board's per-column ordered read (architecture §8.3).
    index("tasks_org_status_position").on(table.organizationId, table.status, table.position),
  ],
);

/**
 * RLS: standard, in 0005. References `memberships (organization_id,
 * user_id)`, not `users (id)` (§2.4) — an assignee is provably a member of
 * the owning org, which a plain FK to `users` could not guarantee.
 */
export const taskAssignees = pgTable(
  "task_assignees",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").notNull(),
    userId: uuid("user_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.userId] }),
    foreignKey({
      columns: [table.organizationId, table.taskId],
      foreignColumns: [tasks.organizationId, tasks.id],
      name: "task_assignees_task_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.userId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "task_assignees_membership_fk",
    }).onDelete("cascade"),
  ],
);

/** RLS: standard, in 0005. `authorId` is provably a member — see `taskAssignees`. */
export const taskComments = pgTable(
  "task_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").notNull(),
    authorId: uuid("author_id").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.taskId],
      foreignColumns: [tasks.organizationId, tasks.id],
      name: "task_comments_task_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.authorId],
      foreignColumns: [memberships.organizationId, memberships.userId],
      name: "task_comments_author_fk",
    }).onDelete("cascade"),
  ],
);

/** RLS: standard, in 0005. */
export const subtasks = pgTable(
  "subtasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").notNull(),
    title: text("title").notNull(),
    doneAt: timestamp("done_at", { withTimezone: true }),
    position: numeric("position").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.taskId],
      foreignColumns: [tasks.organizationId, tasks.id],
      name: "subtasks_task_fk",
    }).onDelete("cascade"),
  ],
);
