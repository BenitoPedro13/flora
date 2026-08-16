import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateTask,
  ListTasksQuery,
  MoveTask,
  Task,
  TaskBoard,
  UpdateTask,
} from '@flora/contracts';
import type { Tx } from '@flora/db';
import {
  deleteTask,
  getTask,
  insertTask,
  listBoard,
  moveTask,
  nextTaskPosition,
  updateTask,
} from '@flora/db';

/**
 * Wraps `packages/db`'s task queries — no SQL here (invariant 5). 404s come
 * from a `null`/`false` lookup, never a caught RLS error (NFR-7): the
 * repository filter is what actually returns nothing for a foreign-org id,
 * RLS is the backstop.
 */
@Injectable()
export class TasksService {
  async board(
    tx: Tx,
    organizationId: string,
    query: ListTasksQuery,
  ): Promise<TaskBoard> {
    const columns = await listBoard(tx, organizationId, {
      q: query.q,
      fieldId: query.fieldId,
      activity: query.activity,
      sort: query.sort,
    });
    return { columns };
  }

  async get(tx: Tx, organizationId: string, id: string): Promise<Task> {
    const task = await getTask(tx, organizationId, id);
    if (!task) {
      throw new NotFoundException();
    }
    return task;
  }

  /** `waterVolumeM3` is only ever stored for a `watering` task (§2.3's design gap, contract doesn't enforce the pairing itself). */
  async create(
    tx: Tx,
    organizationId: string,
    input: CreateTask,
  ): Promise<Task> {
    const status = input.status ?? 'todo';
    const position = await nextTaskPosition(tx, organizationId, status);
    const id = await insertTask(tx, {
      organizationId,
      fieldId: input.fieldId ?? null,
      title: input.title,
      description: input.description ?? null,
      status,
      activity: input.activity,
      progressPct: input.progressPct ?? null,
      startsOn: input.startsOn ?? null,
      dueOn: input.dueOn ?? null,
      waterVolumeM3:
        input.activity === 'watering' ? (input.waterVolumeM3 ?? null) : null,
      position,
    });
    return this.get(tx, organizationId, id);
  }

  /** Never touches `position` or `status`'s ordering side effects — a drag goes through `move` instead (§2.4). */
  async update(
    tx: Tx,
    organizationId: string,
    id: string,
    input: UpdateTask,
  ): Promise<Task> {
    const existing = await getTask(tx, organizationId, id);
    if (!existing) {
      throw new NotFoundException();
    }
    const nextActivity = input.activity ?? existing.activity;
    const waterVolumeM3 =
      nextActivity !== 'watering' ? null : input.waterVolumeM3;

    await updateTask(tx, organizationId, id, {
      title: input.title,
      description: input.description,
      fieldId: input.fieldId,
      status: input.status,
      activity: input.activity,
      progressPct: input.progressPct,
      startsOn: input.startsOn,
      dueOn: input.dueOn,
      waterVolumeM3,
    });
    return this.get(tx, organizationId, id);
  }

  async move(
    tx: Tx,
    organizationId: string,
    id: string,
    input: MoveTask,
  ): Promise<Task> {
    const moved = await moveTask(tx, organizationId, id, input);
    if (!moved) {
      throw new NotFoundException();
    }
    return this.get(tx, organizationId, id);
  }

  async remove(tx: Tx, organizationId: string, id: string): Promise<void> {
    const deleted = await deleteTask(tx, organizationId, id);
    if (!deleted) {
      throw new NotFoundException();
    }
  }
}
