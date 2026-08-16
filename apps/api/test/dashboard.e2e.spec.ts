import { dashboardSchema, type Dashboard } from '@flora/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { asCookieHeader, relayCookies } from './cookie-utils.js';
import { getServer } from './http.js';
import { getTestApp, seedFarmAndCrop, seedUserWithOrg } from './setup.js';

async function loginAndSetup() {
  const seeded = await seedUserWithOrg('owner');
  const farm = await seedFarmAndCrop(seeded.organizationId);
  const app = await getTestApp();
  const server = getServer(app);
  const login = await request(server)
    .post('/api/v1/auth/login')
    .send({ email: seeded.email, password: seeded.password });
  const cookies = asCookieHeader(relayCookies(login));
  return { server, cookies, farmId: farm.farmId };
}

/**
 * TASK-home-dashboard §2.14. The miss path (a farm with no rollup row ever)
 * — `buildFarmRollup` runs inline (§2.8's "why"), never a "pending" state.
 */
describe('dashboard (e2e)', () => {
  it('GET /farms/:id/dashboard builds a rollup on the first request and matches the contract', async () => {
    const { server, cookies, farmId } = await loginAndSetup();

    const res = await request(server)
      .get(`/api/v1/farms/${farmId}/dashboard`)
      .set('Cookie', cookies);

    expect(res.status).toBe(200);
    const dashboard = dashboardSchema.parse(res.body) as Dashboard;
    expect(dashboard.regeneration.current.formulaVersion).toBe('v1');
    // No 7-day-old rollup exists yet — every KPI delta is null, not a fabricated 0%.
    expect(dashboard.kpis.cropsStockedKg.deltaPct).toBeNull();
    expect(dashboard.kpis.fieldsAtRisk.deltaPct).toBeNull();
    expect(dashboard.kpis.waterUsedM3.deltaPct).toBeNull();
  });

  it('reflects a task completed after the rollup was built (§3 — never read from the rollup)', async () => {
    const { server, cookies, farmId } = await loginAndSetup();

    // Trigger the rollup build (miss path) before the task even exists.
    await request(server).get(`/api/v1/farms/${farmId}/dashboard`).set('Cookie', cookies);

    const created = await request(server)
      .post('/api/v1/tasks')
      .set('Cookie', cookies)
      .send({ title: 'Fresh pending task', activity: 'planting' });
    expect(created.status).toBe(201);

    const res = await request(server)
      .get(`/api/v1/farms/${farmId}/dashboard`)
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    const dashboard = res.body as Dashboard;
    expect(dashboard.pendingTasks.some((t) => t.title === 'Fresh pending task')).toBe(true);
  });

  it('another org gets 404 on a foreign farm id', async () => {
    const { server, cookies } = await loginAndSetup();
    const res = await request(server)
      .get(`/api/v1/farms/00000000-0000-0000-0000-000000000000/dashboard`)
      .set('Cookie', cookies);
    expect(res.status).toBe(404);
  });
});
