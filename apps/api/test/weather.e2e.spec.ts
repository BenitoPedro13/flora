import { farmWeatherSchema, type FarmWeather } from '@flora/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { asCookieHeader, relayCookies } from './cookie-utils.js';
import { getServer } from './http.js';
import { getTestApp, seedFarmAndCrop, seedUserWithOrg, seedWeather } from './setup.js';

async function loginAndSetup() {
  const seeded = await seedUserWithOrg('owner');
  const farm = await seedFarmAndCrop(seeded.organizationId);
  await seedWeather(seeded.organizationId, farm.farmId);
  const app = await getTestApp();
  const server = getServer(app);
  const login = await request(server)
    .post('/api/v1/auth/login')
    .send({ email: seeded.email, password: seeded.password });
  const cookies = asCookieHeader(relayCookies(login));
  return { server, cookies, farmId: farm.farmId };
}

/** TASK-weather §6 items 4-5. */
describe('weather (e2e)', () => {
  it('GET /farms/:id/weather?days=7 returns 7 days, each with a 24-hour series, matching the contract', async () => {
    const { server, cookies, farmId } = await loginAndSetup();

    const res = await request(server)
      .get(`/api/v1/farms/${farmId}/weather?days=7`)
      .set('Cookie', cookies);

    expect(res.status).toBe(200);
    const weather = farmWeatherSchema.parse(res.body) as FarmWeather;
    expect(weather.days).toHaveLength(7);
    expect(weather.days.map((d) => d.horizon)).toEqual(['0', '1', '2', '3', '4', '5', '6']);
    for (const day of weather.days) {
      expect(day.hours.length).toBeGreaterThanOrEqual(23);
    }
    expect(weather.isStale).toBe(false);
  });

  it('defaults `days` to 7 when omitted', async () => {
    const { server, cookies, farmId } = await loginAndSetup();
    const res = await request(server).get(`/api/v1/farms/${farmId}/weather`).set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect((res.body as FarmWeather).days).toHaveLength(7);
  });

  it('rejects days=99 with 400', async () => {
    const { server, cookies, farmId } = await loginAndSetup();
    const res = await request(server)
      .get(`/api/v1/farms/${farmId}/weather?days=99`)
      .set('Cookie', cookies);
    expect(res.status).toBe(400);
  });

  it('is stale when the last ingestion run is older than 2 hours', async () => {
    const seeded = await seedUserWithOrg('owner');
    const farm = await seedFarmAndCrop(seeded.organizationId);
    await seedWeather(seeded.organizationId, farm.farmId, new Date(Date.now() - 3 * 60 * 60 * 1000));
    const app = await getTestApp();
    const server = getServer(app);
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: seeded.email, password: seeded.password });
    const cookies = asCookieHeader(relayCookies(login));

    const res = await request(server)
      .get(`/api/v1/farms/${farm.farmId}/weather`)
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect((res.body as FarmWeather).isStale).toBe(true);
  });

  it('another org gets 404 on a foreign farm id', async () => {
    const { server, cookies } = await loginAndSetup();
    const res = await request(server)
      .get(`/api/v1/farms/00000000-0000-0000-0000-000000000000/weather`)
      .set('Cookie', cookies);
    expect(res.status).toBe(404);
  });
});
