import type {
  Field,
  FieldFeatureCollection,
  FieldSummary,
  Page,
  ProblemDetails,
} from '@flora/contracts';
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

const BOWTIE = {
  type: 'MultiPolygon' as const,
  coordinates: [
    [
      [
        [0, 0],
        [1, 1],
        [1, 0],
        [0, 1],
        [0, 0],
      ],
    ],
  ],
};

async function loginAndSetup() {
  const seeded = await seedUserWithOrg('owner');
  const { farmId, cropId } = await seedFarmAndCrop(seeded.organizationId);
  const app = await getTestApp();
  const server = getServer(app);
  const login = await request(server)
    .post('/api/v1/auth/login')
    .send({ email: seeded.email, password: seeded.password });
  expect(login.status).toBe(204);
  const cookies = asCookieHeader(relayCookies(login));
  return {
    server,
    cookies,
    farmId,
    cropId,
    organizationId: seeded.organizationId,
  };
}

// getTestApp() is a shared, process-lifetime singleton (test/setup.ts) —
// every e2e spec file reuses the same compiled app and must not close it.
describe('fields (e2e)', () => {
  it('creates a field, derives areaM2/centroid server-side, and ignores a submitted areaM2 (§6 item 2)', async () => {
    const { server, cookies, farmId } = await loginAndSetup();

    const res = await request(server)
      .post('/api/v1/fields')
      .set('Cookie', cookies)
      .send({
        farmId,
        name: 'Created Field',
        boundary: square(-93.6, 42.03),
        areaM2: 1,
      });
    expect(res.status).toBe(201);
    const body = res.body as Field;
    expect(body.areaM2).not.toBe(1);
    expect(body.areaM2).toBeGreaterThan(0);
    expect(body.centroid.type).toBe('Point');
    expect(body.name).toBe('Created Field');
  });

  it('rejects a self-intersecting boundary with 422 and writes nothing (§6 item 7)', async () => {
    const { server, cookies, farmId } = await loginAndSetup();

    const res = await request(server)
      .post('/api/v1/fields')
      .set('Cookie', cookies)
      .send({ farmId, name: 'Bowtie Field', boundary: BOWTIE });
    expect(res.status).toBe(422);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect((res.body as ProblemDetails).detail).toBeTruthy();

    const list = await request(server)
      .get('/api/v1/fields')
      .set('Cookie', cookies);
    const listBody = list.body as Page<FieldSummary>;
    expect(listBody.items.some((f) => f.name === 'Bowtie Field')).toBe(false);
  });

  it('a geometry over the vertex ceiling is rejected by zod with 400, before any SQL runs', async () => {
    const { server, cookies, farmId } = await loginAndSetup();
    const hugeRing: [number, number][] = Array.from(
      { length: 10_001 },
      (_, i) => [i / 10_001, i / 10_001],
    );
    hugeRing.push(hugeRing[0]);
    const res = await request(server)
      .post('/api/v1/fields')
      .set('Cookie', cookies)
      .send({
        farmId,
        name: 'Huge Field',
        boundary: { type: 'MultiPolygon', coordinates: [[hugeRing]] },
      });
    expect(res.status).toBe(400);
  });

  it('gets, updates, and deletes a field; a deleted field 404s afterward', async () => {
    const { server, cookies, farmId } = await loginAndSetup();
    const created = await request(server)
      .post('/api/v1/fields')
      .set('Cookie', cookies)
      .send({
        farmId,
        name: 'Lifecycle Field',
        boundary: square(-93.61, 42.03),
      });
    const id = (created.body as Field).id;

    const got = await request(server)
      .get(`/api/v1/fields/${id}`)
      .set('Cookie', cookies);
    expect(got.status).toBe(200);
    expect((got.body as Field).name).toBe('Lifecycle Field');

    const updated = await request(server)
      .patch(`/api/v1/fields/${id}`)
      .set('Cookie', cookies)
      .send({ name: 'Renamed Field' });
    expect(updated.status).toBe(200);
    expect((updated.body as Field).name).toBe('Renamed Field');

    const deleted = await request(server)
      .delete(`/api/v1/fields/${id}`)
      .set('Cookie', cookies);
    expect(deleted.status).toBe(204);

    const afterDelete = await request(server)
      .get(`/api/v1/fields/${id}`)
      .set('Cookie', cookies);
    expect(afterDelete.status).toBe(404);
  });

  it('GET /fields/:id on an unknown uuid is 404', async () => {
    const { server, cookies } = await loginAndSetup();
    const res = await request(server)
      .get('/api/v1/fields/00000000-0000-0000-0000-000000000000')
      .set('Cookie', cookies);
    expect(res.status).toBe(404);
  });

  it('paginates the list with a cursor and no duplicates across two pages', async () => {
    const { server, cookies, farmId } = await loginAndSetup();
    for (let i = 0; i < 5; i++) {
      const res = await request(server)
        .post('/api/v1/fields')
        .set('Cookie', cookies)
        .send({
          farmId,
          name: `Page Field ${i}`,
          boundary: square(-93.62 + i * 0.01, 42.03),
        });
      expect(res.status).toBe(201);
    }

    const page1 = await request(server)
      .get('/api/v1/fields')
      .query({ limit: 3, sort: 'position' })
      .set('Cookie', cookies);
    expect(page1.status).toBe(200);
    const page1Body = page1.body as Page<FieldSummary>;
    expect(page1Body.items).toHaveLength(3);
    expect(page1Body.nextCursor).toBeTruthy();

    const page2 = await request(server)
      .get('/api/v1/fields')
      .query({ limit: 3, sort: 'position', cursor: page1Body.nextCursor! })
      .set('Cookie', cookies);
    expect(page2.status).toBe(200);
    const page2Body = page2.body as Page<FieldSummary>;
    const page1Ids = page1Body.items.map((f) => f.id);
    const page2Ids = page2Body.items.map((f) => f.id);
    expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false);
  });

  it('GET /fields/geojson returns geometry the list omits', async () => {
    const { server, cookies, farmId } = await loginAndSetup();
    await request(server)
      .post('/api/v1/fields')
      .set('Cookie', cookies)
      .send({ farmId, name: 'Geo Field', boundary: square(-93.63, 42.03) });

    const res = await request(server)
      .get('/api/v1/fields/geojson')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    const body = res.body as FieldFeatureCollection;
    expect(body.type).toBe('FeatureCollection');
    expect(body.features.length).toBeGreaterThan(0);
    expect(body.features[0].geometry.type).toBe('MultiPolygon');
  });

  it('creates a field with a crop cycle in one request, and 409s on a second growing cycle (§6 item 8)', async () => {
    const { server, cookies, farmId, cropId } = await loginAndSetup();
    const created = await request(server)
      .post('/api/v1/fields')
      .set('Cookie', cookies)
      .send({
        farmId,
        name: 'Cycle Field',
        boundary: square(-93.64, 42.03),
        cropCycle: {
          cropId,
          plantedOn: '2026-01-01',
          expectedHarvestOn: '2026-06-01',
          status: 'growing',
          quantityKg: 1900,
        },
      });
    expect(created.status).toBe(201);
    const createdBody = created.body as Field & {
      cropCycle: NonNullable<FieldSummary['cropCycle']>;
    };
    expect(createdBody.cropCycle.status).toBe('growing');
    expect(createdBody.cropCycle.quantityKg).toBe(1900);

    const second = await request(server)
      .post(`/api/v1/fields/${createdBody.id}/crop-cycles`)
      .set('Cookie', cookies)
      .send({
        cropId,
        plantedOn: '2026-02-01',
        expectedHarvestOn: '2026-07-01',
        status: 'growing',
        quantityKg: null,
      });
    expect(second.status).toBe(409);
    expect(second.headers['content-type']).toContain(
      'application/problem+json',
    );
  });

  it('search q and cropId filter, and compose', async () => {
    const { server, cookies, farmId, cropId } = await loginAndSetup();
    await request(server)
      .post('/api/v1/fields')
      .set('Cookie', cookies)
      .send({
        farmId,
        name: 'Searchable Corn Field',
        boundary: square(-93.65, 42.03),
        cropCycle: {
          cropId,
          plantedOn: '2026-01-01',
          expectedHarvestOn: '2026-06-01',
          status: 'growing',
          quantityKg: null,
        },
      });
    await request(server)
      .post('/api/v1/fields')
      .set('Cookie', cookies)
      .send({ farmId, name: 'Other Field', boundary: square(-93.66, 42.03) });

    const byQ = await request(server)
      .get('/api/v1/fields')
      .query({ q: 'searchable' })
      .set('Cookie', cookies);
    const byQBody = byQ.body as Page<FieldSummary>;
    expect(byQBody.items.map((f) => f.name)).toEqual(['Searchable Corn Field']);

    const byCrop = await request(server)
      .get('/api/v1/fields')
      .query({ cropId })
      .set('Cookie', cookies);
    const byCropBody = byCrop.body as Page<FieldSummary>;
    expect(byCropBody.items.map((f) => f.name)).toContain(
      'Searchable Corn Field',
    );
    expect(byCropBody.items.map((f) => f.name)).not.toContain('Other Field');
  });

  it('an empty org (no fields) returns an empty items array, not an error', async () => {
    const { server, cookies } = await loginAndSetup();
    const res = await request(server)
      .get('/api/v1/fields')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    const body = res.body as Page<FieldSummary>;
    expect(body.items).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });
});
