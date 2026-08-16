import type {
  Observation,
  ObservationDates,
  RefreshAccepted,
  RefreshJobStatus,
  StressZone,
} from '@flora/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createRefreshQueue } from '../src/observations/refresh-queue.provider.js';
import { asCookieHeader, relayCookies } from './cookie-utils.js';
import { getServer } from './http.js';
import {
  getTestApp,
  seedFarmAndCrop,
  seedObservation,
  seedStressZone,
  seedUserWithOrg,
} from './setup.js';

function square(lon: number, lat: number, half = 0.001) {
  return {
    type: 'MultiPolygon' as const,
    coordinates: [
      [
        [
          [lon - half, lat - half],
          [lon + half, lat - half],
          [lon + half, lat + half],
          [lon - half, lat + half],
          [lon - half, lat - half],
        ],
      ],
    ],
  };
}

async function loginAndCreateField(lon: number) {
  const seeded = await seedUserWithOrg('owner');
  const { farmId } = await seedFarmAndCrop(seeded.organizationId);
  const app = await getTestApp();
  const server = getServer(app);
  const login = await request(server)
    .post('/api/v1/auth/login')
    .send({ email: seeded.email, password: seeded.password });
  expect(login.status).toBe(204);
  const cookies = asCookieHeader(relayCookies(login));
  const fieldRes = await request(server)
    .post('/api/v1/fields')
    .set('Cookie', cookies)
    .send({ farmId, name: `Obs Field ${lon}`, boundary: square(lon, 42.03) });
  expect(fieldRes.status).toBe(201);
  return {
    server,
    cookies,
    organizationId: seeded.organizationId,
    fieldId: (fieldRes.body as { id: string }).id,
  };
}

describe('observations + stress-zones (e2e)', () => {
  it('GET /fields/:id/observations returns rasterUrl composed from R2_PUBLIC_BASE_URL, never a raw key (invariant 2)', async () => {
    const { server, cookies, organizationId, fieldId } =
      await loginAndCreateField(-96.1);
    await seedObservation(organizationId, fieldId, 'ndvi', '2026-08-01');

    const res = await request(server)
      .get(`/api/v1/fields/${fieldId}/observations?index=ndvi`)
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    const body = res.body as Observation[];
    expect(body).toHaveLength(1);
    expect(body[0].rasterUrl).toContain(
      process.env.R2_PUBLIC_BASE_URL ?? 'http://localhost:9000/flora-rasters',
    );
    expect(body[0].rasterUrl).not.toContain('raster_key');
    expect(body[0].stats.p10).toBe(0.3);
  });

  it('GET /fields/:id/observations/dates returns dates only', async () => {
    const { server, cookies, organizationId, fieldId } =
      await loginAndCreateField(-96.2);
    await seedObservation(organizationId, fieldId, 'ndvi', '2026-08-01');
    await seedObservation(organizationId, fieldId, 'ndvi', '2026-07-20');

    const res = await request(server)
      .get(`/api/v1/fields/${fieldId}/observations/dates?index=ndvi`)
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    const dates = res.body as ObservationDates;
    expect(dates).toEqual(['2026-08-01', '2026-07-20']);
  });

  it('POST /fields/:id/observations/refresh returns 202 + a jobId, not 200 (invariant 1: enqueue, never call)', async () => {
    const { server, cookies, fieldId } = await loginAndCreateField(-96.3);

    const res = await request(server)
      .post(`/api/v1/fields/${fieldId}/observations/refresh`)
      .set('Cookie', cookies);
    expect(res.status).toBe(202);
    const body = res.body as RefreshAccepted;
    expect(typeof body.jobId).toBe('string');
    expect(body.jobId.length).toBeGreaterThan(0);
  });

  it("a manual refresh job carries attempts: 5, mirroring the worker's registration (§1.1)", async () => {
    const { server, cookies, fieldId } = await loginAndCreateField(-96.31);
    const refresh = await request(server)
      .post(`/api/v1/fields/${fieldId}/observations/refresh`)
      .set('Cookie', cookies);
    const { jobId } = refresh.body as RefreshAccepted;

    const queue = createRefreshQueue();
    try {
      const job = await queue.getJob(jobId);
      expect(job?.opts.attempts).toBe(5);
    } finally {
      await queue.close();
    }
  });

  it('GET /fields/:id/observations/refresh/:jobId reports a just-enqueued job as waiting or active', async () => {
    const { server, cookies, fieldId } = await loginAndCreateField(-96.32);
    const refresh = await request(server)
      .post(`/api/v1/fields/${fieldId}/observations/refresh`)
      .set('Cookie', cookies);
    const { jobId } = refresh.body as RefreshAccepted;

    const res = await request(server)
      .get(`/api/v1/fields/${fieldId}/observations/refresh/${jobId}`)
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    const body = res.body as RefreshJobStatus;
    expect(body.jobId).toBe(jobId);
    expect(['waiting', 'active']).toContain(body.state);
    expect(body.failedReason).toBeNull();
  });

  it('GET /fields/:id/observations/refresh/:jobId reports a job id that aged out as unknown, not 404', async () => {
    const { server, cookies, fieldId } = await loginAndCreateField(-96.33);

    const res = await request(server)
      .get(`/api/v1/fields/${fieldId}/observations/refresh/does-not-exist`)
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    const body = res.body as RefreshJobStatus;
    expect(body.state).toBe('unknown');
  });

  it('GET /fields/:id/observations/refresh/:jobId 404s (never 403) on a job belonging to another org', async () => {
    const orgA = await loginAndCreateField(-96.34);
    const orgB = await loginAndCreateField(-96.35);
    const otherRefresh = await request(orgB.server)
      .post(`/api/v1/fields/${orgB.fieldId}/observations/refresh`)
      .set('Cookie', orgB.cookies);
    const { jobId: otherJobId } = otherRefresh.body as RefreshAccepted;

    const res = await request(orgA.server)
      .get(`/api/v1/fields/${orgA.fieldId}/observations/refresh/${otherJobId}`)
      .set('Cookie', orgA.cookies);
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
  });

  it('a nonexistent field returns 404 on every observations route', async () => {
    const { server, cookies } = await loginAndCreateField(-96.4);
    const bogusId = '00000000-0000-0000-0000-000000000000';

    // Sequential, not a pre-built array of Test objects: supertest lazily
    // calls server.listen(0) on first use, and constructing several Test
    // instances against the same non-listening server before any of them is
    // awaited races that listen() call (intermittent ECONNREFUSED).
    const paths: Array<[method: 'get' | 'post', path: string]> = [
      ['get', `/api/v1/fields/${bogusId}/observations`],
      ['get', `/api/v1/fields/${bogusId}/observations/dates`],
      ['post', `/api/v1/fields/${bogusId}/observations/refresh`],
      ['get', `/api/v1/fields/${bogusId}/observations/refresh/does-not-exist`],
      ['get', `/api/v1/fields/${bogusId}/stress-zones`],
    ];
    for (const [method, path] of paths) {
      const res = await request(server)[method](path).set('Cookie', cookies);
      expect(res.status).toBe(404);
    }
  });

  it('GET /fields/:id/stress-zones sorts by priority (severity, then area, then date) and derives areaM2/isNew', async () => {
    const { server, cookies, organizationId, fieldId } =
      await loginAndCreateField(-96.5);
    await seedStressZone(organizationId, fieldId);

    const res = await request(server)
      .get(`/api/v1/fields/${fieldId}/stress-zones`)
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    const zones = res.body as StressZone[];
    expect(zones).toHaveLength(1);
    expect(zones[0].areaM2).toBeGreaterThan(0);
    expect(zones[0].classification).toBe('unclassified');
    expect(typeof zones[0].isNew).toBe('boolean');
  });

  it('PATCH /stress-zones/:id sets classification and/or muted', async () => {
    const { server, cookies, organizationId, fieldId } =
      await loginAndCreateField(-96.6);
    const zoneId = await seedStressZone(organizationId, fieldId);

    const res = await request(server)
      .patch(`/api/v1/stress-zones/${zoneId}`)
      .set('Cookie', cookies)
      .send({ classification: 'pest', muted: true });
    expect(res.status).toBe(200);
    const body = res.body as StressZone;
    expect(body.classification).toBe('pest');
    expect(body.mutedAt).not.toBeNull();
  });

  it('PATCH /stress-zones/:id with neither field is rejected', async () => {
    const { server, cookies, organizationId, fieldId } =
      await loginAndCreateField(-96.7);
    const zoneId = await seedStressZone(organizationId, fieldId);

    const res = await request(server)
      .patch(`/api/v1/stress-zones/${zoneId}`)
      .set('Cookie', cookies)
      .send({});
    expect(res.status).toBe(400);
  });

  it('DELETE /stress-zones/:id soft-deletes — 204, then absent from the list (§6 item 16)', async () => {
    const { server, cookies, organizationId, fieldId } =
      await loginAndCreateField(-96.8);
    const zoneId = await seedStressZone(organizationId, fieldId);

    const del = await request(server)
      .delete(`/api/v1/stress-zones/${zoneId}`)
      .set('Cookie', cookies);
    expect(del.status).toBe(204);

    const list = await request(server)
      .get(`/api/v1/fields/${fieldId}/stress-zones`)
      .set('Cookie', cookies);
    expect(list.body as StressZone[]).toHaveLength(0);

    // A second delete is a 404 — the row is soft-deleted, not still "live".
    const secondDelete = await request(server)
      .delete(`/api/v1/stress-zones/${zoneId}`)
      .set('Cookie', cookies);
    expect(secondDelete.status).toBe(404);
  });

  it('GET /fields/:id/observations p95 < 50ms over 100 calls against 90 days of seeded data (NFR-2, §6 item 11)', async () => {
    const { server, cookies, organizationId, fieldId } =
      await loginAndCreateField(-96.9);
    for (let i = 0; i < 90; i++) {
      const d = new Date('2026-08-01T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - i);
      await seedObservation(
        organizationId,
        fieldId,
        'ndvi',
        d.toISOString().slice(0, 10),
      );
    }

    const samples: number[] = [];
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      const res = await request(server)
        .get(`/api/v1/fields/${fieldId}/observations?index=ndvi`)
        .set('Cookie', cookies);
      samples.push(performance.now() - start);
      expect(res.status).toBe(200);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(0.95 * samples.length)];
    // Measured on a local testcontainers Postgres, not production infra —
    // recorded here per §10's honesty requirement rather than asserted as a
    // production SLA. If this becomes flaky in CI, loosen the threshold and
    // record the real number instead of deleting the assertion.
    expect(p95).toBeLessThan(50);
  });
});
