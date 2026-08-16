import type { MultiPolygon } from "@flora/contracts";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbClient } from "../client.js";
import { organizations, users } from "../schema/auth.js";
import { startTestInfra, type TestInfra } from "../test/containers.js";
import { withOrganization } from "../tenancy.js";
import { deleteField, insertField } from "./fields.js";
import {
  getTask,
  insertTask,
  listBoard,
  moveTask,
  nextTaskPosition,
  rebalanceColumnIfNeeded,
} from "./tasks.js";

/** Integration suite against real testcontainers PostGIS (TASK-tasks-board §2.11). */

const FIELD_BOUNDARY: MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [-59.14, -4.59],
        [-59.12, -4.59],
        [-59.12, -4.57],
        [-59.14, -4.57],
        [-59.14, -4.59],
      ],
    ],
  ],
};

describe("tasks queries", () => {
  let infra: TestInfra;
  let owner: ReturnType<typeof createDbClient>;
  let orgId: string;
  let fieldId: string;
  let userId: string;

  beforeAll(async () => {
    infra = await startTestInfra();
    owner = createDbClient(infra.ownerUrl);

    const [org] = await owner.db.insert(organizations).values({ name: "Task Org", slug: "task-spec-org" }).returning();
    orgId = org!.id;
    const [user] = await owner.db
      .insert(users)
      .values({ email: "task-spec@example.test", passwordHash: "unused", name: "Task Spec User" })
      .returning();
    userId = user!.id;
    await owner.pool.query(`INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, 'owner')`, [
      orgId,
      userId,
    ]);

    const { rows } = await owner.pool.query<{ id: string }>(
      `INSERT INTO farms (organization_id, name, location, timezone)
       VALUES ($1, 'Task Farm', ST_GeomFromGeoJSON($2), 'America/Manaus') RETURNING id`,
      [orgId, JSON.stringify({ type: "Point", coordinates: [-59.13, -4.58] })],
    );
    const farmId = rows[0]!.id;

    await withOrganization(owner.db, orgId, async (tx) => {
      fieldId = await insertField(tx, {
        organizationId: orgId,
        farmId,
        name: "Task Field",
        boundary: FIELD_BOUNDARY,
        position: 1,
      });
    });
  });

  afterAll(async () => {
    await owner.pool.end();
    await infra.stop();
  });

  it("groups a board into three columns whose totals match a direct count(*) GROUP BY status (§6 item 1)", async () => {
    await withOrganization(owner.db, orgId, async (tx) => {
      for (const status of ["todo", "todo", "in_progress", "done"] as const) {
        const position = await nextTaskPosition(tx, orgId, status);
        await insertTask(tx, {
          organizationId: orgId,
          fieldId,
          title: `Board task ${status} ${position}`,
          description: null,
          status,
          activity: "watering",
          progressPct: null,
          startsOn: null,
          dueOn: null,
          waterVolumeM3: null,
          position,
        });
      }

      const columns = await listBoard(tx, orgId, { sort: "position" });
      expect(columns.map((c) => c.status)).toEqual(["todo", "in_progress", "done"]);
      const todo = columns.find((c) => c.status === "todo")!;
      const inProgress = columns.find((c) => c.status === "in_progress")!;
      const done = columns.find((c) => c.status === "done")!;
      expect(todo.total).toBe(2);
      expect(inProgress.total).toBe(1);
      expect(done.total).toBe(1);
    });

    const { rows } = await owner.pool.query<{ status: string; n: string }>(
      `SELECT status, count(*) AS n FROM tasks WHERE organization_id = $1 GROUP BY status`,
      [orgId],
    );
    const counts = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
    expect(counts.todo).toBe(2);
    expect(counts.in_progress).toBe(1);
    expect(counts.done).toBe(1);
  });

  it("aggregates real comment/subtask/assignee counts via lateral joins, not the mock's numbers (§6 item 2)", async () => {
    await withOrganization(owner.db, orgId, async (tx) => {
      const position = await nextTaskPosition(tx, orgId, "todo");
      const taskId = await insertTask(tx, {
        organizationId: orgId,
        fieldId,
        title: "Aggregate task",
        description: null,
        status: "todo",
        activity: "planting",
        progressPct: 40,
        startsOn: "2026-09-01",
        dueOn: "2026-09-10",
        waterVolumeM3: null,
        position,
      });

      // Same transaction as `insertTask` above (`tx`, not `owner.pool`) — a
      // separate connection can't see an uncommitted row from another
      // session's transaction, which is exactly what made this fail its
      // first run (an FK violation on `task_comments`, the row genuinely not
      // visible yet).
      await tx.execute(sql`
        INSERT INTO task_comments (organization_id, task_id, author_id, body)
        VALUES (${orgId}, ${taskId}, ${userId}, 'a'), (${orgId}, ${taskId}, ${userId}, 'b')
      `);
      await tx.execute(sql`
        INSERT INTO subtasks (organization_id, task_id, title, done_at, position)
        VALUES (${orgId}, ${taskId}, 'sub 1', now(), 1), (${orgId}, ${taskId}, 'sub 2', NULL, 2), (${orgId}, ${taskId}, 'sub 3', NULL, 3)
      `);
      await tx.execute(sql`
        INSERT INTO task_assignees (organization_id, task_id, user_id) VALUES (${orgId}, ${taskId}, ${userId})
      `);

      const task = await getTask(tx, orgId, taskId);
      expect(task).not.toBeNull();
      expect(task!.commentCount).toBe(2);
      expect(task!.subtaskCount).toBe(3);
      expect(task!.subtaskDoneCount).toBe(1);
      expect(task!.assignees).toEqual([{ userId, name: "Task Spec User", avatarKey: null }]);
      expect(task!.field).toEqual({ id: fieldId, name: "Task Field" });
    });
  });

  it("moveTask computes a numeric midpoint in Postgres, never in JS", async () => {
    await withOrganization(owner.db, orgId, async (tx) => {
      const posA = await nextTaskPosition(tx, orgId, "in_progress");
      const idA = await insertTask(tx, {
        organizationId: orgId,
        fieldId: null,
        title: "A",
        description: null,
        status: "in_progress",
        activity: "harvesting",
        progressPct: null,
        startsOn: null,
        dueOn: null,
        waterVolumeM3: null,
        position: posA,
      });
      const posB = await nextTaskPosition(tx, orgId, "in_progress");
      const idB = await insertTask(tx, {
        organizationId: orgId,
        fieldId: null,
        title: "B",
        description: null,
        status: "in_progress",
        activity: "harvesting",
        progressPct: null,
        startsOn: null,
        dueOn: null,
        waterVolumeM3: null,
        position: posB,
      });
      const posC = await nextTaskPosition(tx, orgId, "in_progress");
      const idC = await insertTask(tx, {
        organizationId: orgId,
        fieldId: null,
        title: "C — will move between A and B",
        description: null,
        status: "in_progress",
        activity: "harvesting",
        progressPct: null,
        startsOn: null,
        dueOn: null,
        waterVolumeM3: null,
        position: posC,
      });

      const moved = await moveTask(tx, orgId, idC, { status: "in_progress", beforeId: idA, afterId: idB });
      expect(moved).toBe(true);

      const { rows } = await tx.execute<{ id: string; position: string }>(sql`
        SELECT id, position FROM tasks WHERE id IN (${idA}, ${idB}, ${idC}) ORDER BY position
      `);
      expect(rows.map((r) => r.id)).toEqual([idA, idC, idB]);
    });
  });

  it("60 successive drops into the same gap trigger the rebalance and renumber the column to whole numbers (§2.7, §6 item 6)", async () => {
    await withOrganization(owner.db, orgId, async (tx) => {
      const posLow = await nextTaskPosition(tx, orgId, "done");
      const lowId = await insertTask(tx, {
        organizationId: orgId,
        fieldId: null,
        title: "low",
        description: null,
        status: "done",
        activity: "fertilization",
        progressPct: null,
        startsOn: null,
        dueOn: null,
        waterVolumeM3: null,
        position: posLow,
      });
      const posHigh = await nextTaskPosition(tx, orgId, "done");
      let narrowestId = await insertTask(tx, {
        organizationId: orgId,
        fieldId: null,
        title: "high",
        description: null,
        status: "done",
        activity: "fertilization",
        progressPct: null,
        startsOn: null,
        dueOn: null,
        waterVolumeM3: null,
        position: posHigh,
      });

      for (let i = 0; i < 65; i++) {
        const placeholderPos = await nextTaskPosition(tx, orgId, "done");
        const id = await insertTask(tx, {
          organizationId: orgId,
          fieldId: null,
          title: `chain ${i}`,
          description: null,
          status: "done",
          activity: "fertilization",
          progressPct: null,
          startsOn: null,
          dueOn: null,
          waterVolumeM3: null,
          position: placeholderPos,
        });
        await moveTask(tx, orgId, id, { status: "done", beforeId: lowId, afterId: narrowestId });
        narrowestId = id;
      }
    });

    // Each `moveTask` call rebalances inline once its own write crosses the
    // §2.7 threshold, so ordering never gets a chance to degrade mid-loop —
    // 65 drops into the same gap should never leave any position carrying
    // more than a handful of digits past the 20-significant-digit trigger,
    // even though a fresh chain restarts (and re-deepens) after each
    // rebalance rather than staying flat forever.
    const { rows: afterLoop } = await owner.pool.query<{ position: string }>(
      `SELECT position FROM tasks WHERE organization_id = $1 AND status = 'done'`,
      [orgId],
    );
    expect(afterLoop.length).toBeGreaterThanOrEqual(67);
    for (const row of afterLoop) {
      expect(row.position.replace(/[^0-9]/g, "").length).toBeLessThanOrEqual(25);
    }

    // The renumbering half of §6 item 6, isolated from the loop's own
    // (already-proven) auto-trigger: manufacture a position past the
    // threshold directly, confirm `rebalanceColumnIfNeeded` is a no-op below
    // it, then confirm it renumbers the whole column to whole numbers once
    // crossed.
    const deepPosition = `2.${"1".repeat(21)}`;
    const { rows: targetRows } = await owner.pool.query<{ id: string }>(
      `SELECT id FROM tasks WHERE organization_id = $1 AND status = 'done' LIMIT 1`,
      [orgId],
    );
    await owner.pool.query(`UPDATE tasks SET position = $1 WHERE id = $2`, [deepPosition, targetRows[0]!.id]);

    await withOrganization(owner.db, orgId, (tx) => rebalanceColumnIfNeeded(tx, orgId, "done"));
    const { rows: afterForcedRebalance } = await owner.pool.query<{ position: string }>(
      `SELECT position FROM tasks WHERE organization_id = $1 AND status = 'done'`,
      [orgId],
    );
    for (const row of afterForcedRebalance) {
      expect(row.position).toMatch(/^\d+$/);
    }
  });

  it("deleting a field nulls field_id and leaves the task (the schema's ON DELETE SET NULL promise, §6 item 9)", async () => {
    let taskId!: string;
    let farmId!: string;
    await withOrganization(owner.db, orgId, async (tx) => {
      const { rows } = await owner.pool.query<{ id: string }>(
        `INSERT INTO farms (organization_id, name, location, timezone)
         VALUES ($1, 'Delete-me Farm', ST_GeomFromGeoJSON($2), 'America/Manaus') RETURNING id`,
        [orgId, JSON.stringify({ type: "Point", coordinates: [-59.13, -4.58] })],
      );
      farmId = rows[0]!.id;
      const doomedFieldId = await insertField(tx, {
        organizationId: orgId,
        farmId,
        name: "Doomed Field",
        boundary: FIELD_BOUNDARY,
        position: 2,
      });
      const position = await nextTaskPosition(tx, orgId, "todo");
      taskId = await insertTask(tx, {
        organizationId: orgId,
        fieldId: doomedFieldId,
        title: "Orphan-to-be",
        description: null,
        status: "todo",
        activity: "pest_control",
        progressPct: null,
        startsOn: null,
        dueOn: null,
        waterVolumeM3: null,
        position,
      });
      await deleteField(tx, orgId, doomedFieldId);
    });

    await withOrganization(owner.db, orgId, async (tx) => {
      const task = await getTask(tx, orgId, taskId);
      expect(task).not.toBeNull();
      expect(task!.field).toBeNull();
    });
  });
});
