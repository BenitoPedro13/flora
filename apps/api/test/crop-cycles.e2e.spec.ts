import type { CropCycle, Field } from '@flora/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { asCookieHeader, relayCookies } from './cookie-utils.js';
import { getServer } from './http.js';
import { getTestApp, seedFarmAndCrop, seedUserWithOrg } from './setup.js';

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

async function loginAndSetup() {
  const seeded = await seedUserWithOrg('owner');
  const { farmId, cropId } = await seedFarmAndCrop(seeded.organizationId);
  const app = await getTestApp();
  const server = getServer(app);
  const login = await request(server)
    .post('/api/v1/auth/login')
    .send({ email: seeded.email, password: seeded.password });
  const cookies = asCookieHeader(relayCookies(login));

  const field = await request(server)
    .post('/api/v1/fields')
    .set('Cookie', cookies)
    .send({ farmId, name: 'Crop Cycle Field', boundary: square(-93.9, 42.03) });

  return { server, cookies, farmId, cropId, fieldId: (field.body as Field).id };
}

// getTestApp() is a shared, process-lifetime singleton (test/setup.ts) —
// every e2e spec file reuses the same compiled app and must not close it.
describe('crop cycles (e2e)', () => {
  it('rejects an expected harvest date before the planted date', async () => {
    const { server, cookies, fieldId, cropId } = await loginAndSetup();
    const res = await request(server)
      .post(`/api/v1/fields/${fieldId}/crop-cycles`)
      .set('Cookie', cookies)
      .send({
        cropId,
        plantedOn: '2026-06-01',
        expectedHarvestOn: '2026-01-01',
        status: 'planned',
        quantityKg: null,
      });
    expect(res.status).toBe(400);
  });

  it('PATCH updates a field, and 409s when flipping a second cycle on the same field to growing (§6 item 8)', async () => {
    const { server, cookies, fieldId, cropId } = await loginAndSetup();
    const growing = await request(server)
      .post(`/api/v1/fields/${fieldId}/crop-cycles`)
      .set('Cookie', cookies)
      .send({
        cropId,
        plantedOn: '2026-01-01',
        expectedHarvestOn: '2026-06-01',
        status: 'growing',
        quantityKg: 1000,
      });
    expect(growing.status).toBe(201);
    const growingBody = growing.body as CropCycle;
    expect(growingBody.growthPct).toBeGreaterThanOrEqual(0);
    expect(growingBody.growthPct).toBeLessThanOrEqual(100);

    // A second cycle on the *same* field, status 'planned' — allowed to
    // coexist with a growing cycle (the unique index only restricts
    // 'growing' rows).
    const planned = await request(server)
      .post(`/api/v1/fields/${fieldId}/crop-cycles`)
      .set('Cookie', cookies)
      .send({
        cropId,
        plantedOn: '2027-01-01',
        expectedHarvestOn: '2027-06-01',
        status: 'planned',
        quantityKg: null,
      });
    expect(planned.status).toBe(201);
    const plannedBody = planned.body as CropCycle;

    const rename = await request(server)
      .patch(`/api/v1/crop-cycles/${plannedBody.id}`)
      .set('Cookie', cookies)
      .send({ quantityKg: 500 });
    expect(rename.status).toBe(200);
    expect((rename.body as CropCycle).quantityKg).toBe(500);

    const flipToGrowing = await request(server)
      .patch(`/api/v1/crop-cycles/${plannedBody.id}`)
      .set('Cookie', cookies)
      .send({ status: 'growing' });
    expect(flipToGrowing.status).toBe(409);
    expect(flipToGrowing.headers['content-type']).toContain(
      'application/problem+json',
    );
  });

  it('PATCH /crop-cycles/:id on an unknown id is 404', async () => {
    const { server, cookies } = await loginAndSetup();
    const res = await request(server)
      .patch('/api/v1/crop-cycles/00000000-0000-0000-0000-000000000000')
      .set('Cookie', cookies)
      .send({ quantityKg: 1 });
    expect(res.status).toBe(404);
  });
});
