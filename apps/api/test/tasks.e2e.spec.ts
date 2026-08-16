import type { Task, TaskBoard } from '@flora/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { asCookieHeader, relayCookies } from './cookie-utils.js';
import { getServer } from './http.js';
import { getTestApp, seedUserWithOrg } from './setup.js';

async function loginAndSetup() {
  const seeded = await seedUserWithOrg('owner');
  const app = await getTestApp();
  const server = getServer(app);
  const login = await request(server)
    .post('/api/v1/auth/login')
    .send({ email: seeded.email, password: seeded.password });
  const cookies = asCookieHeader(relayCookies(login));
  return { server, cookies };
}

// getTestApp() is a shared, process-lifetime singleton (test/setup.ts) —
// every e2e spec file reuses the same compiled app and must not close it.
describe('tasks (e2e)', () => {
  it('GET /tasks groups into three columns whose totals equal their tasks length', async () => {
    const { server, cookies } = await loginAndSetup();

    for (const status of ['todo', 'in_progress', 'done'] as const) {
      const res = await request(server)
        .post('/api/v1/tasks')
        .set('Cookie', cookies)
        .send({ title: `Task ${status}`, activity: 'watering', status });
      expect(res.status).toBe(201);
    }

    const board = await request(server)
      .get('/api/v1/tasks')
      .set('Cookie', cookies);
    expect(board.status).toBe(200);
    const body = board.body as TaskBoard;
    expect(body.columns.map((c) => c.status)).toEqual([
      'todo',
      'in_progress',
      'done',
    ]);
    for (const column of body.columns) {
      expect(column.total).toBe(column.tasks.length);
      expect(column.total).toBeGreaterThanOrEqual(1);
    }
  });

  it('rejects a due date before the start date (400)', async () => {
    const { server, cookies } = await loginAndSetup();
    const res = await request(server)
      .post('/api/v1/tasks')
      .set('Cookie', cookies)
      .send({
        title: 'Bad dates',
        activity: 'planting',
        startsOn: '2026-09-10',
        dueOn: '2026-09-01',
      });
    expect(res.status).toBe(400);
  });

  it('stores waterVolumeM3 for a watering task and clears it if the activity changes away from watering', async () => {
    const { server, cookies } = await loginAndSetup();
    const created = await request(server)
      .post('/api/v1/tasks')
      .set('Cookie', cookies)
      .send({
        title: 'Water the north field',
        activity: 'watering',
        waterVolumeM3: 12.5,
      });
    expect(created.status).toBe(201);
    expect((created.body as Task).waterVolumeM3).toBe(12.5);

    const switched = await request(server)
      .patch(`/api/v1/tasks/${(created.body as Task).id}`)
      .set('Cookie', cookies)
      .send({ activity: 'planting' });
    expect(switched.status).toBe(200);
    expect((switched.body as Task).waterVolumeM3).toBeNull();
  });

  it('PATCH /tasks/:id/move re-parents a card into another column, both counts update, and the position lands between its neighbours', async () => {
    const { server, cookies } = await loginAndSetup();
    const a = await request(server)
      .post('/api/v1/tasks')
      .set('Cookie', cookies)
      .send({ title: 'A', activity: 'harvesting', status: 'in_progress' });
    const b = await request(server)
      .post('/api/v1/tasks')
      .set('Cookie', cookies)
      .send({ title: 'B', activity: 'harvesting', status: 'in_progress' });
    const c = await request(server)
      .post('/api/v1/tasks')
      .set('Cookie', cookies)
      .send({ title: 'C', activity: 'harvesting', status: 'todo' });

    const before = await request(server)
      .get('/api/v1/tasks')
      .set('Cookie', cookies);
    const beforeBody = before.body as TaskBoard;
    const beforeTodo = beforeBody.columns.find(
      (col) => col.status === 'todo',
    )!.total;
    const beforeInProgress = beforeBody.columns.find(
      (col) => col.status === 'in_progress',
    )!.total;

    const cId = (c.body as Task).id;
    const move = await request(server)
      .patch(`/api/v1/tasks/${cId}/move`)
      .set('Cookie', cookies)
      .send({
        status: 'in_progress',
        beforeId: (a.body as Task).id,
        afterId: (b.body as Task).id,
      });
    expect(move.status).toBe(200);
    expect((move.body as Task).status).toBe('in_progress');

    const after = await request(server)
      .get('/api/v1/tasks')
      .set('Cookie', cookies);
    const afterBody = after.body as TaskBoard;
    const afterTodo = afterBody.columns.find((col) => col.status === 'todo')!;
    const afterInProgress = afterBody.columns.find(
      (col) => col.status === 'in_progress',
    )!;
    expect(afterTodo.total).toBe(beforeTodo - 1);
    expect(afterInProgress.total).toBe(beforeInProgress + 1);

    const order = afterInProgress.tasks.map((t) => t.title);
    expect(order.indexOf('C')).toBeGreaterThan(order.indexOf('A'));
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('B'));
  });

  it('DELETE /tasks/:id removes it from the board; a repeat DELETE is 404', async () => {
    const { server, cookies } = await loginAndSetup();
    const created = await request(server)
      .post('/api/v1/tasks')
      .set('Cookie', cookies)
      .send({ title: 'To delete', activity: 'pest_control' });
    const id = (created.body as Task).id;

    const del = await request(server)
      .delete(`/api/v1/tasks/${id}`)
      .set('Cookie', cookies);
    expect(del.status).toBe(204);

    const repeat = await request(server)
      .delete(`/api/v1/tasks/${id}`)
      .set('Cookie', cookies);
    expect(repeat.status).toBe(404);
  });

  it('PATCH /tasks/:id on an unknown id is 404', async () => {
    const { server, cookies } = await loginAndSetup();
    const res = await request(server)
      .patch('/api/v1/tasks/00000000-0000-0000-0000-000000000000')
      .set('Cookie', cookies)
      .send({ title: 'Nope' });
    expect(res.status).toBe(404);
  });
});
