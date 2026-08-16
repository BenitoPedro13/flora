import { z } from "zod";
import { taskActivitySchema, taskStatusSchema } from "./enums.js";

/**
 * `progressPct`/`waterVolumeM3` are user-entered, unlike `crop-cycle.ts`'s
 * derived `growthPct` — nothing computes them server-side. `waterVolumeM3` is
 * canonical SI (architecture §5.3, `units.ts`), meaningful only when
 * `activity === "watering"`; the editor hides the field otherwise, and the
 * contract does not enforce the pairing since the design's placement for it
 * is invented (`TASK-tasks-board` §2.3).
 */
export const taskSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(200),
  description: z.string().nullable(),
  status: taskStatusSchema,
  activity: taskActivitySchema,
  progressPct: z.number().int().min(0).max(100).nullable(),
  startsOn: z.iso.date().nullable(),
  dueOn: z.iso.date().nullable(),
  position: z.string(),
  field: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  assignees: z.array(z.object({ userId: z.uuid(), name: z.string().nullable(), avatarKey: z.string().nullable() })),
  commentCount: z.number().int().nonnegative(),
  subtaskCount: z.number().int().nonnegative(),
  subtaskDoneCount: z.number().int().nonnegative(),
  waterVolumeM3: z.number().nonnegative().nullable(),
});
export type Task = z.infer<typeof taskSchema>;

export const taskBoardColumnSchema = z.object({
  status: taskStatusSchema,
  total: z.number().int().nonnegative(),
  tasks: z.array(taskSchema),
});
export type TaskBoardColumn = z.infer<typeof taskBoardColumnSchema>;

/** `?view=board`'s grouped payload (§2.4) — one round trip renders all three columns. */
export const taskBoardSchema = z.object({
  columns: z.array(taskBoardColumnSchema),
});
export type TaskBoard = z.infer<typeof taskBoardSchema>;

export const createTaskSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(4000).nullable().optional(),
    fieldId: z.uuid().nullable().optional(),
    status: taskStatusSchema.default("todo"),
    activity: taskActivitySchema,
    progressPct: z.number().int().min(0).max(100).nullable().optional(),
    startsOn: z.iso.date().nullable().optional(),
    dueOn: z.iso.date().nullable().optional(),
    waterVolumeM3: z.number().nonnegative().nullable().optional(),
  })
  .refine((t) => !t.startsOn || !t.dueOn || t.dueOn >= t.startsOn, {
    path: ["dueOn"],
    message: "Due date must be on or after the start date",
  });
export type CreateTask = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).nullable().optional(),
  fieldId: z.uuid().nullable().optional(),
  status: taskStatusSchema.optional(),
  activity: taskActivitySchema.optional(),
  progressPct: z.number().int().min(0).max(100).nullable().optional(),
  startsOn: z.iso.date().nullable().optional(),
  dueOn: z.iso.date().nullable().optional(),
  waterVolumeM3: z.number().nonnegative().nullable().optional(),
});
export type UpdateTask = z.infer<typeof updateTaskSchema>;

/**
 * A drag's own contract (§2.4, §2.7) — neighbours, not an absolute
 * `position`. The server owns the midpoint math so two concurrent drags
 * can't write the same value from stale reads.
 */
export const moveTaskSchema = z
  .object({
    status: taskStatusSchema,
    beforeId: z.uuid().nullable().optional(),
    afterId: z.uuid().nullable().optional(),
  })
  .refine((m) => m.beforeId !== undefined || m.afterId !== undefined, {
    message: "At least one of beforeId/afterId must be present (both null means the only card in the column)",
  });
export type MoveTask = z.infer<typeof moveTaskSchema>;

export const taskSortValues = ["position", "due_on", "created_at"] as const;
export const taskSortSchema = z.enum(taskSortValues);
export type TaskSort = z.infer<typeof taskSortSchema>;

export const listTasksQuerySchema = z.object({
  view: z.literal("board").default("board"),
  q: z.string().max(120).optional(),
  fieldId: z.uuid().optional(),
  activity: taskActivitySchema.optional(),
  sort: taskSortSchema.default("position"),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
