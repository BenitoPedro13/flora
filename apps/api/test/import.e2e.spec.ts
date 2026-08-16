import type { ImportCommitResult, ImportPreview } from '@flora/contracts';
import { createDbClient } from '@flora/db';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { asCookieHeader, relayCookies } from './cookie-utils.js';
import { getServer } from './http.js';
import { getTestApp, seedFarmAndCrop, seedUserWithOrg } from './setup.js';

function ring(lon: number, lat: number, half = 0.001) {
  return [
    [lon - half, lat - half],
    [lon + half, lat - half],
    [lon + half, lat + half],
    [lon - half, lat + half],
    [lon - half, lat - half],
  ];
}

async function loginAndSetup() {
  const seeded = await seedUserWithOrg('owner');
  const { farmId } = await seedFarmAndCrop(seeded.organizationId);
  const app = await getTestApp();
  const server = getServer(app);
  const login = await request(server)
    .post('/api/v1/auth/login')
    .send({ email: seeded.email, password: seeded.password });
  const cookies = asCookieHeader(relayCookies(login));
  return { server, cookies, farmId, organizationId: seeded.organizationId };
}

async function fieldCount(organizationId: string): Promise<number> {
  const { pool } = createDbClient(process.env.DATABASE_MIGRATION_URL!);
  try {
    const { rows } = await pool.query<{ count: string }>(
      'SELECT count(*) FROM fields WHERE organization_id = $1',
      [organizationId],
    );
    return Number(rows[0].count);
  } finally {
    await pool.end();
  }
}

// getTestApp() is a shared, process-lifetime singleton (test/setup.ts) —
// every e2e spec file reuses the same compiled app and must not close it.
describe('fields import — GeoJSON preview then commit (e2e, §6 item 10)', () => {
  it('preview marks 2 valid / 1 invalid out of 3 features, writes nothing, and skips a LineString without coercing it', async () => {
    const { server, cookies, organizationId } = await loginAndSetup();
    const beforeCount = await fieldCount(organizationId);

    const featureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Import Valid A' },
          geometry: { type: 'Polygon', coordinates: [ring(-93.7, 42.03)] },
        },
        {
          type: 'Feature',
          properties: { name: 'Import Valid B' },
          geometry: { type: 'Polygon', coordinates: [ring(-93.71, 42.03)] },
        },
        {
          type: 'Feature',
          properties: { name: 'Import Bowtie' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 1],
                [1, 0],
                [0, 1],
                [0, 0],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { name: 'Import LineString' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [-93.72, 42.03],
              [-93.73, 42.04],
            ],
          },
        },
      ],
    };

    const preview = await request(server)
      .post('/api/v1/fields/import/preview')
      .set('Cookie', cookies)
      .send(featureCollection);
    expect(preview.status).toBe(200);
    const { rows } = preview.body as ImportPreview;
    expect(rows).toHaveLength(4);
    expect(rows.filter((r) => r.valid)).toHaveLength(2);
    const lineStringRow = rows.find((r) => r.name === 'Import LineString')!;
    expect(lineStringRow.valid).toBe(false);
    expect(lineStringRow.boundary).toBeNull();
    expect(lineStringRow.reason).toMatch(/not a polygon/i);
    const bowtieRow = rows.find((r) => r.name === 'Import Bowtie')!;
    expect(bowtieRow.valid).toBe(false);

    const afterPreviewCount = await fieldCount(organizationId);
    expect(afterPreviewCount).toBe(beforeCount);
  });

  it('commit writes exactly the accepted rows', async () => {
    const { server, cookies, organizationId, farmId } = await loginAndSetup();
    const beforeCount = await fieldCount(organizationId);

    const commit = await request(server)
      .post('/api/v1/fields/import/commit')
      .set('Cookie', cookies)
      .send({
        farmId,
        rows: [
          {
            name: 'Commit Field A',
            boundary: {
              type: 'MultiPolygon',
              coordinates: [[ring(-93.8, 42.03)]],
            },
          },
          {
            name: 'Commit Field B',
            boundary: {
              type: 'MultiPolygon',
              coordinates: [[ring(-93.81, 42.03)]],
            },
          },
        ],
      });
    expect(commit.status).toBe(201);
    expect((commit.body as ImportCommitResult).created).toBe(2);

    const afterCount = await fieldCount(organizationId);
    expect(afterCount).toBe(beforeCount + 2);
  });
});
