import type { TaskActivity, TaskSort, TaskStatus } from "@flora/contracts";
import { taskStatusValues } from "@flora/contracts";
import { sql } from "drizzle-orm";
import type { Tx } from "../tenancy.js";

/**
 * `tasks` + its three children (TASK-tasks-board §2.2). `position` is always
 * carried as the driver's raw text, never through `Number()` (invariant 3's
 * sibling for ordering, not area) — Postgres `numeric` is arbitrary
 * precision and a JS `Number` round-trip would truncate it exactly when a
 * long midpoint chain needs it most (§2.7). `organizationId` is filtered on
 * every statement — the repository half of invariant 6, RLS the backstop.
 */

export interface TaskAssigneeRecord {
  userId: string;
  name: string | null;
  avatarKey: string | null;
}

export interface TaskRecord {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  activity: TaskActivity;
  progressPct: number | null;
  startsOn: string | null;
  dueOn: string | null;
  position: string;
  field: { id: string; name: string } | null;
  assignees: TaskAssigneeRecord[];
  commentCount: number;
  subtaskCount: number;
  subtaskDoneCount: number;
  waterVolumeM3: number | null;
}

export interface TaskRow {
  [key: string]: unknown;
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  activity: TaskActivity;
  progress_pct: number | null;
  starts_on: string | null;
  due_on: string | null;
  position: string;
  field_id: string | null;
  field_name: string | null;
  assignees: TaskAssigneeRecord[] | null;
  comment_count: number;
  subtask_count: number;
  subtask_done_count: number;
  water_volume_m3: string | null;
}

/** Exported for `rollups.ts`'s Pending Tasks read (§2.8) — one projection, never re-derived. */
export function toTaskRecord(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    activity: row.activity,
    progressPct: row.progress_pct,
    startsOn: row.starts_on,
    dueOn: row.due_on,
    position: row.position,
    field: row.field_id ? { id: row.field_id, name: row.field_name! } : null,
    assignees: row.assignees ?? [],
    commentCount: row.comment_count,
    subtaskCount: row.subtask_count,
    subtaskDoneCount: row.subtask_done_count,
    waterVolumeM3: row.water_volume_m3 === null ? null : Number(row.water_volume_m3),
  };
}

/** Shared by `listBoard`, `getTask`, and `rollups.ts`'s Pending Tasks read — one projection, never re-derived per caller. */
export const TASK_PROJECTION_SQL = sql`
  SELECT
    t.id, t.title, t.description, t.status, t.activity, t.progress_pct,
    t.starts_on, t.due_on, t.position, t.water_volume_m3,
    f.id AS field_id, f.name AS field_name,
    COALESCE(asg.assignees, '[]'::json) AS assignees,
    COALESCE(cc.comment_count, 0) AS comment_count,
    COALESCE(sc.subtask_count, 0) AS subtask_count,
    COALESCE(sc.subtask_done_count, 0) AS subtask_done_count
  FROM tasks t
  LEFT JOIN fields f ON f.organization_id = t.organization_id AND f.id = t.field_id
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object('userId', u.id, 'name', u.name, 'avatarKey', u.avatar_key) ORDER BY u.name) AS assignees
    FROM task_assignees ta
    JOIN users u ON u.id = ta.user_id
    WHERE ta.organization_id = t.organization_id AND ta.task_id = t.id
  ) asg ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS comment_count
    FROM task_comments tc
    WHERE tc.organization_id = t.organization_id AND tc.task_id = t.id
  ) cc ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS subtask_count, count(*) FILTER (WHERE s.done_at IS NOT NULL)::int AS subtask_done_count
    FROM subtasks s
    WHERE s.organization_id = t.organization_id AND s.task_id = t.id
  ) sc ON true
`;

export interface ListBoardParams {
  q?: string;
  fieldId?: string;
  activity?: TaskActivity;
  sort: TaskSort;
}

export interface TaskColumnResult {
  status: TaskStatus;
  total: number;
  tasks: TaskRecord[];
}

/**
 * One statement for all three columns (§2.2, §3) — three status-filtered
 * calls would race each other into an inconsistent render on mount. No
 * pagination: the board shows every matching task, so each column's `total`
 * is just that column's row count, trivially equal to a direct
 * `count(*) GROUP BY status` (§6 item 1).
 */
export async function listBoard(tx: Tx, organizationId: string, params: ListBoardParams): Promise<TaskColumnResult[]> {
  const conditions: ReturnType<typeof sql>[] = [sql`t.organization_id = ${organizationId}`];
  if (params.q) {
    conditions.push(sql`t.title ILIKE ${`%${params.q}%`}`);
  }
  if (params.fieldId) {
    conditions.push(sql`t.field_id = ${params.fieldId}`);
  }
  if (params.activity) {
    conditions.push(sql`t.activity = ${params.activity}`);
  }
  const whereClause = sql.join(conditions, sql` AND `);

  const orderBy =
    params.sort === "due_on"
      ? sql`t.due_on ASC NULLS LAST, t.position ASC`
      : params.sort === "created_at"
        ? sql`t.created_at DESC`
        : sql`t.position ASC`;

  const rows = await tx.execute<TaskRow>(sql`
    ${TASK_PROJECTION_SQL}
    WHERE ${whereClause}
    ORDER BY t.status, ${orderBy}
  `);

  const byStatus = new Map<TaskStatus, TaskRecord[]>(taskStatusValues.map((s) => [s, []]));
  for (const row of rows.rows) {
    byStatus.get(row.status)!.push(toTaskRecord(row));
  }
  return taskStatusValues.map((status) => {
    const tasks = byStatus.get(status)!;
    return { status, total: tasks.length, tasks };
  });
}

export async function getTask(tx: Tx, organizationId: string, id: string): Promise<TaskRecord | null> {
  const rows = await tx.execute<TaskRow>(sql`
    ${TASK_PROJECTION_SQL}
    WHERE t.organization_id = ${organizationId} AND t.id = ${id}
  `);
  const row = rows.rows[0];
  return row ? toTaskRecord(row) : null;
}

/** `max(position) + 1` in the org's status column — the append position for a newly created task. */
export async function nextTaskPosition(tx: Tx, organizationId: string, status: TaskStatus): Promise<string> {
  const rows = await tx.execute<{ next: string }>(sql`
    SELECT (COALESCE(MAX(position), 0) + 1)::text AS next
    FROM tasks
    WHERE organization_id = ${organizationId} AND status = ${status}
  `);
  return rows.rows[0]!.next;
}

export interface InsertTaskInput {
  organizationId: string;
  fieldId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  activity: TaskActivity;
  progressPct: number | null;
  startsOn: string | null;
  dueOn: string | null;
  waterVolumeM3: number | null;
  position: string;
}

export async function insertTask(tx: Tx, input: InsertTaskInput): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    INSERT INTO tasks (
      organization_id, field_id, title, description, status, activity,
      progress_pct, starts_on, due_on, water_volume_m3, position
    )
    VALUES (
      ${input.organizationId}, ${input.fieldId}, ${input.title}, ${input.description},
      ${input.status}, ${input.activity}, ${input.progressPct}, ${input.startsOn}, ${input.dueOn},
      ${input.waterVolumeM3}, ${input.position}
    )
    RETURNING id
  `);
  return rows.rows[0]!.id;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  fieldId?: string | null;
  status?: TaskStatus;
  activity?: TaskActivity;
  progressPct?: number | null;
  startsOn?: string | null;
  dueOn?: string | null;
  waterVolumeM3?: number | null;
}

/** The general `PATCH` (§2.4) — never touches `position`; that's `moveTask`'s job alone. */
export async function updateTask(tx: Tx, organizationId: string, id: string, input: UpdateTaskInput): Promise<boolean> {
  const assignments: ReturnType<typeof sql>[] = [sql`updated_at = now()`];
  if (input.title !== undefined) assignments.push(sql`title = ${input.title}`);
  if (input.description !== undefined) assignments.push(sql`description = ${input.description}`);
  if (input.fieldId !== undefined) assignments.push(sql`field_id = ${input.fieldId}`);
  if (input.status !== undefined) assignments.push(sql`status = ${input.status}`);
  if (input.activity !== undefined) assignments.push(sql`activity = ${input.activity}`);
  if (input.progressPct !== undefined) assignments.push(sql`progress_pct = ${input.progressPct}`);
  if (input.startsOn !== undefined) assignments.push(sql`starts_on = ${input.startsOn}`);
  if (input.dueOn !== undefined) assignments.push(sql`due_on = ${input.dueOn}`);
  if (input.waterVolumeM3 !== undefined) assignments.push(sql`water_volume_m3 = ${input.waterVolumeM3}`);

  const rows = await tx.execute<{ id: string }>(sql`
    UPDATE tasks SET ${sql.join(assignments, sql`, `)}
    WHERE organization_id = ${organizationId} AND id = ${id}
    RETURNING id
  `);
  return rows.rows.length > 0;
}

export interface MoveTaskInput {
  status: TaskStatus;
  beforeId?: string | null;
  afterId?: string | null;
}

/**
 * `select_div_scale()` caps plain `numeric / 2` at ~16 significant digits
 * regardless of operand scale — confirmed empirically against this repo's
 * own Postgres (`docker exec flora-db-1 psql`): a `DO` block halving
 * repeatedly showed `scale=16` from the first division on, with the low-order
 * digits drifting into rounding noise (`2.0000000000000001`) by iteration
 * ~65. Dividing by a literal carrying a large explicit `dscale` instead
 * raises the *target* scale to match — the same block with an
 * 80-zero divisor stayed exact (`scale=46` and climbing, no drift) past the
 * same iteration count. §2.7's "one digit per subdivision" claim holds only
 * with this divisor; plain `/ 2` would have silently corrupted ordering
 * once two independent chains rounded to the same value, long before the
 * `> 20` rebalance threshold ever saw a reason to fire.
 */
const HIGH_PRECISION_TWO = sql.raw(`2.${"0".repeat(80)}`);

/**
 * The drag's own write (§2.4, §2.7): `beforeId`/`afterId` are neighbours,
 * the server computes the midpoint in Postgres `numeric` arithmetic — never
 * in JS, where a `Number` round-trip would truncate a long decimal exactly
 * when a deep chain of subdivisions needs the precision most. A `VALUES (1)`
 * seed row guarantees the `CASE` always has one row to evaluate, even when
 * both neighbours are absent (the only-card-in-an-empty-column case).
 */
export async function moveTask(tx: Tx, organizationId: string, id: string, input: MoveTaskInput): Promise<boolean> {
  const beforeId = input.beforeId ?? null;
  const afterId = input.afterId ?? null;

  const positionRows = await tx.execute<{ position: string }>(sql`
    SELECT trim_scale(
      CASE
        WHEN b.position IS NOT NULL AND a.position IS NOT NULL THEN (b.position + a.position) / ${HIGH_PRECISION_TWO}
        WHEN b.position IS NOT NULL THEN b.position + 1
        WHEN a.position IS NOT NULL THEN a.position - 1
        ELSE 1
      END
    )::text AS position
    FROM (VALUES (1)) seed(x)
    LEFT JOIN (SELECT position FROM tasks WHERE organization_id = ${organizationId} AND id = ${beforeId}) b ON true
    LEFT JOIN (SELECT position FROM tasks WHERE organization_id = ${organizationId} AND id = ${afterId}) a ON true
  `);
  const newPosition = positionRows.rows[0]!.position;

  const rows = await tx.execute<{ id: string }>(sql`
    UPDATE tasks SET status = ${input.status}, position = ${newPosition}, updated_at = now()
    WHERE organization_id = ${organizationId} AND id = ${id}
    RETURNING id
  `);
  const moved = rows.rows.length > 0;
  if (moved) {
    await rebalanceColumnIfNeeded(tx, organizationId, input.status);
  }
  return moved;
}

/**
 * §2.7's threshold: a `numeric` midpoint chain grows one digit per
 * subdivision into the same gap. Past 20 significant digits, renumber the
 * whole column to whole numbers in one `row_number()` pass — reachable only
 * after ~60 successive drops into the same gap (§6 item 6), so this is cheap
 * to check on every move.
 */
export async function rebalanceColumnIfNeeded(tx: Tx, organizationId: string, status: TaskStatus): Promise<void> {
  const check = await tx.execute<{ needs_rebalance: boolean }>(sql`
    SELECT bool_or(length(regexp_replace(position::text, '[^0-9]', '', 'g')) > 20) AS needs_rebalance
    FROM tasks
    WHERE organization_id = ${organizationId} AND status = ${status}
  `);
  if (!check.rows[0]?.needs_rebalance) {
    return;
  }
  await tx.execute(sql`
    UPDATE tasks t SET position = r.rn, updated_at = now()
    FROM (
      SELECT id, row_number() OVER (ORDER BY position) AS rn
      FROM tasks
      WHERE organization_id = ${organizationId} AND status = ${status}
    ) r
    WHERE t.organization_id = ${organizationId} AND t.id = r.id
  `);
}

/** Hard delete — `tasks` has no soft-delete column (unlike `stress_zones`); children cascade via their FKs (§2.4 of the schema). */
export async function deleteTask(tx: Tx, organizationId: string, id: string): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    DELETE FROM tasks WHERE organization_id = ${organizationId} AND id = ${id}
    RETURNING id
  `);
  return rows.rows.length > 0;
}
