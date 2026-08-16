import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CropCycle, Field } from '@flora/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { asCookieHeader, relayCookies } from './cookie-utils.js';
import { TenantProbeModule } from './fixtures/tenant-probe.module.js';
import { getServer } from './http.js';
import { getTestApp, seedFarmAndCrop, seedUserWithOrg } from './setup.js';

type Method = 'get' | 'post' | 'patch' | 'delete';

interface RegistryEntry {
  name: string;
  /** Builds a fresh org A / org B pair and the request each check needs — self-contained so entries never share state (some routes, like DELETE, are destructive). */
  build: (app: INestApplication) => Promise<{
    cookies: string;
    method: Method;
    ownPath: string;
    otherPath: string;
    body?: Record<string, unknown>;
  }>;
}

function square(lon: number) {
  return {
    type: 'MultiPolygon' as const,
    coordinates: [
      [
        [
          [lon - 0.001, 42.03],
          [lon + 0.001, 42.03],
          [lon + 0.001, 42.031],
          [lon - 0.001, 42.031],
          [lon - 0.001, 42.03],
        ],
      ],
    ],
  };
}

async function loginAs(
  app: INestApplication,
  email: string,
  password: string,
): Promise<string> {
  const login = await request(getServer(app))
    .post('/api/v1/auth/login')
    .send({ email, password });
  return asCookieHeader(relayCookies(login));
}

async function createField(
  app: INestApplication,
  cookies: string,
  farmId: string,
  lon: number,
): Promise<string> {
  const res = await request(getServer(app))
    .post('/api/v1/fields')
    .set('Cookie', cookies)
    .send({ farmId, name: `Tenancy Field ${lon}`, boundary: square(lon) });
  return (res.body as Field).id;
}

/**
 * Table-driven so TASK-fields adds a line, not a file, once real org-scoped
 * resources exist (TASK-auth-tenancy §2.9, NFR-7). `organizations by id`
 * runs against the test-only TenantProbeController (fixtures/) — every other
 * entry is a real TASK-fields resource.
 */
const REGISTRY: RegistryEntry[] = [
  {
    name: 'organizations by id',
    build: async (app) => {
      const orgA = await seedUserWithOrg('owner');
      const orgB = await seedUserWithOrg('owner');
      const cookies = await loginAs(app, orgA.email, orgA.password);
      return {
        cookies,
        method: 'get',
        ownPath: `/api/v1/test-fixtures/organizations/${orgA.organizationId}`,
        otherPath: `/api/v1/test-fixtures/organizations/${orgB.organizationId}`,
      };
    },
  },
  {
    name: 'GET /fields/:id',
    build: async (app) => {
      const orgA = await seedUserWithOrg('owner');
      const orgB = await seedUserWithOrg('owner');
      const [farmA, farmB] = await Promise.all([
        seedFarmAndCrop(orgA.organizationId),
        seedFarmAndCrop(orgB.organizationId),
      ]);
      const cookiesA = await loginAs(app, orgA.email, orgA.password);
      const cookiesB = await loginAs(app, orgB.email, orgB.password);
      const fieldAId = await createField(app, cookiesA, farmA.farmId, -93.1);
      const fieldBId = await createField(app, cookiesB, farmB.farmId, -93.2);
      return {
        cookies: cookiesA,
        method: 'get',
        ownPath: `/api/v1/fields/${fieldAId}`,
        otherPath: `/api/v1/fields/${fieldBId}`,
      };
    },
  },
  {
    name: 'PATCH /fields/:id',
    build: async (app) => {
      const orgA = await seedUserWithOrg('owner');
      const orgB = await seedUserWithOrg('owner');
      const [farmA, farmB] = await Promise.all([
        seedFarmAndCrop(orgA.organizationId),
        seedFarmAndCrop(orgB.organizationId),
      ]);
      const cookiesA = await loginAs(app, orgA.email, orgA.password);
      const cookiesB = await loginAs(app, orgB.email, orgB.password);
      const fieldAId = await createField(app, cookiesA, farmA.farmId, -93.3);
      const fieldBId = await createField(app, cookiesB, farmB.farmId, -93.4);
      return {
        cookies: cookiesA,
        method: 'patch',
        ownPath: `/api/v1/fields/${fieldAId}`,
        otherPath: `/api/v1/fields/${fieldBId}`,
        body: { name: 'Renamed' },
      };
    },
  },
  {
    name: 'DELETE /fields/:id',
    build: async (app) => {
      const orgA = await seedUserWithOrg('owner');
      const orgB = await seedUserWithOrg('owner');
      const [farmA, farmB] = await Promise.all([
        seedFarmAndCrop(orgA.organizationId),
        seedFarmAndCrop(orgB.organizationId),
      ]);
      const cookiesA = await loginAs(app, orgA.email, orgA.password);
      const cookiesB = await loginAs(app, orgB.email, orgB.password);
      // Two of org A's own fields: the sanity 200 check deletes one, so it
      // must not be the same field another entry depends on — each entry
      // already gets its own fixtures, but this keeps the delete itself from
      // being the thing that makes org A's own-path check fail to 200 twice.
      const fieldAId = await createField(app, cookiesA, farmA.farmId, -93.5);
      const fieldBId = await createField(app, cookiesB, farmB.farmId, -93.6);
      return {
        cookies: cookiesA,
        method: 'delete',
        ownPath: `/api/v1/fields/${fieldAId}`,
        otherPath: `/api/v1/fields/${fieldBId}`,
      };
    },
  },
  {
    name: 'POST /fields/:id/crop-cycles',
    build: async (app) => {
      const orgA = await seedUserWithOrg('owner');
      const orgB = await seedUserWithOrg('owner');
      const [farmA, farmB] = await Promise.all([
        seedFarmAndCrop(orgA.organizationId),
        seedFarmAndCrop(orgB.organizationId),
      ]);
      const cookiesA = await loginAs(app, orgA.email, orgA.password);
      const cookiesB = await loginAs(app, orgB.email, orgB.password);
      const fieldAId = await createField(app, cookiesA, farmA.farmId, -93.7);
      const fieldBId = await createField(app, cookiesB, farmB.farmId, -93.8);
      return {
        cookies: cookiesA,
        method: 'post',
        ownPath: `/api/v1/fields/${fieldAId}/crop-cycles`,
        otherPath: `/api/v1/fields/${fieldBId}/crop-cycles`,
        body: {
          cropId: farmA.cropId,
          plantedOn: '2026-01-01',
          expectedHarvestOn: '2026-06-01',
          status: 'planned',
          quantityKg: null,
        },
      };
    },
  },
  {
    name: 'PATCH /crop-cycles/:id',
    build: async (app) => {
      const orgA = await seedUserWithOrg('owner');
      const orgB = await seedUserWithOrg('owner');
      const [farmA, farmB] = await Promise.all([
        seedFarmAndCrop(orgA.organizationId),
        seedFarmAndCrop(orgB.organizationId),
      ]);
      const cookiesA = await loginAs(app, orgA.email, orgA.password);
      const cookiesB = await loginAs(app, orgB.email, orgB.password);
      const fieldAId = await createField(app, cookiesA, farmA.farmId, -93.9);
      const fieldBId = await createField(app, cookiesB, farmB.farmId, -94.0);
      const cycleA = await request(getServer(app))
        .post(`/api/v1/fields/${fieldAId}/crop-cycles`)
        .set('Cookie', cookiesA)
        .send({
          cropId: farmA.cropId,
          plantedOn: '2026-01-01',
          expectedHarvestOn: '2026-06-01',
          status: 'planned',
          quantityKg: null,
        });
      const cycleB = await request(getServer(app))
        .post(`/api/v1/fields/${fieldBId}/crop-cycles`)
        .set('Cookie', cookiesB)
        .send({
          cropId: farmB.cropId,
          plantedOn: '2026-01-01',
          expectedHarvestOn: '2026-06-01',
          status: 'planned',
          quantityKg: null,
        });
      return {
        cookies: cookiesA,
        method: 'patch',
        ownPath: `/api/v1/crop-cycles/${(cycleA.body as CropCycle).id}`,
        otherPath: `/api/v1/crop-cycles/${(cycleB.body as CropCycle).id}`,
        body: { quantityKg: 42 },
      };
    },
  },
];

describe('cross-tenant suite (e2e, NFR-7)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Shares the same testcontainers infra as every other e2e file
    // (startTestInfra() is cached), but this app additionally mounts the
    // test-only probe controller the registry above exercises.
    await getTestApp();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, TenantProbeModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('has a non-empty registry', () => {
    expect(REGISTRY.length).toBeGreaterThan(0);
    console.log(`cross-tenant registry: ${REGISTRY.length} route(s)`);
  });

  it.each(REGISTRY)(
    "$name: org A gets 404, never 403, on org B's resource",
    async ({ build }) => {
      const { cookies, method, ownPath, otherPath, body } = await build(app);
      const server = getServer(app);

      const res = await request(server)
        [method](otherPath)
        .set('Cookie', cookies)
        .send(body);
      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);

      // Sanity: the same route resolves for org A's own resource.
      const ownRes = await request(server)
        [method](ownPath)
        .set('Cookie', cookies)
        .send(body);
      expect([200, 201, 204]).toContain(ownRes.status);
    },
  );
});
