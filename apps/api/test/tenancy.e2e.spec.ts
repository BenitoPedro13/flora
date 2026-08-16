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
import {
  getTestApp,
  seedFarmAndCrop,
  seedObservation,
  seedStressZone,
  seedUserWithOrg,
} from './setup.js';

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

async function createTask(
  app: INestApplication,
  cookies: string,
  title: string,
): Promise<string> {
  const res = await request(getServer(app))
    .post('/api/v1/tasks')
    .set('Cookie', cookies)
    .send({ title, activity: 'watering' });
  return (res.body as { id: string }).id;
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
  {
    name: 'GET /fields/:id/observations',
    build: async (app) => {
      const orgA = await seedUserWithOrg('owner');
      const orgB = await seedUserWithOrg('owner');
      const [farmA, farmB] = await Promise.all([
        seedFarmAndCrop(orgA.organizationId),
        seedFarmAndCrop(orgB.organizationId),
      ]);
      const cookiesA = await loginAs(app, orgA.email, orgA.password);
      const cookiesB = await loginAs(app, orgB.email, orgB.password);
      const fieldAId = await createField(app, cookiesA, farmA.farmId, -94.1);
      const fieldBId = await createField(app, cookiesB, farmB.farmId, -94.2);
      await seedObservation(orgA.organizationId, fieldAId);
      await seedObservation(orgB.organizationId, fieldBId);
      return {
        cookies: cookiesA,
        method: 'get',
        ownPath: `/api/v1/fields/${fieldAId}/observations`,
        otherPath: `/api/v1/fields/${fieldBId}/observations`,
      };
    },
  },
  {
    name: 'GET /fields/:id/observations/dates',
    build: async (app) => {
      const orgA = await seedUserWithOrg('owner');
      const orgB = await seedUserWithOrg('owner');
      const [farmA, farmB] = await Promise.all([
        seedFarmAndCrop(orgA.organizationId),
        seedFarmAndCrop(orgB.organizationId),
      ]);
      const cookiesA = await loginAs(app, orgA.email, orgA.password);
      const cookiesB = await loginAs(app, orgB.email, orgB.password);
      const fieldAId = await createField(app, cookiesA, farmA.farmId, -94.3);
      const fieldBId = await createField(app, cookiesB, farmB.farmId, -94.4);
      await seedObservation(orgA.organizationId, fieldAId);
      await seedObservation(orgB.organizationId, fieldBId);
      return {
        cookies: cookiesA,
        method: 'get',
        ownPath: `/api/v1/fields/${fieldAId}/observations/dates`,
        otherPath: `/api/v1/fields/${fieldBId}/observations/dates`,
      };
    },
  },
  {
    name: 'POST /fields/:id/observations/refresh',
    build: async (app) => {
      const orgA = await seedUserWithOrg('owner');
      const orgB = await seedUserWithOrg('owner');
      const [farmA, farmB] = await Promise.all([
        seedFarmAndCrop(orgA.organizationId),
        seedFarmAndCrop(orgB.organizationId),
      ]);
      const cookiesA = await loginAs(app, orgA.email, orgA.password);
      const cookiesB = await loginAs(app, orgB.email, orgB.password);
      const fieldAId = await createField(app, cookiesA, farmA.farmId, -94.5);
      const fieldBId = await createField(app, cookiesB, farmB.farmId, -94.6);
      return {
        cookies: cookiesA,
        method: 'post',
        ownPath: `/api/v1/fields/${fieldAId}/observations/refresh`,
        otherPath: `/api/v1/fields/${fieldBId}/observations/refresh`,
      };
    },
  },
  {
    name: 'GET /fields/:id/observations/refresh/:jobId',
    build: async (app) => {
      const orgA = await seedUserWithOrg('owner');
      const orgB = await seedUserWithOrg('owner');
      const [farmA, farmB] = await Promise.all([
        seedFarmAndCrop(orgA.organizationId),
        seedFarmAndCrop(orgB.organizationId),
      ]);
      const cookiesA = await loginAs(app, orgA.email, orgA.password);
      const cookiesB = await loginAs(app, orgB.email, orgB.password);
      const fieldAId = await createField(app, cookiesA, farmA.farmId, -94.85);
      const fieldBId = await createField(app, cookiesB, farmB.farmId, -94.86);
      const refreshA = await request(getServer(app))
        .post(`/api/v1/fields/${fieldAId}/observations/refresh`)
        .set('Cookie', cookiesA);
      const refreshB = await request(getServer(app))
        .post(`/api/v1/fields/${fieldBId}/observations/refresh`)
        .set('Cookie', cookiesB);
      const jobIdA = (refreshA.body as { jobId: string }).jobId;
      const jobIdB = (refreshB.body as { jobId: string }).jobId;
      return {
        cookies: cookiesA,
        method: 'get',
        ownPath: `/api/v1/fields/${fieldAId}/observations/refresh/${jobIdA}`,
        otherPath: `/api/v1/fields/${fieldAId}/observations/refresh/${jobIdB}`,
      };
    },
  },
  {
    name: 'GET /fields/:id/stress-zones',
    build: async (app) => {
      const orgA = await seedUserWithOrg('owner');
      const orgB = await seedUserWithOrg('owner');
      const [farmA, farmB] = await Promise.all([
        seedFarmAndCrop(orgA.organizationId),
        seedFarmAndCrop(orgB.organizationId),
      ]);
      const cookiesA = await loginAs(app, orgA.email, orgA.password);
      const cookiesB = await loginAs(app, orgB.email, orgB.password);
      const fieldAId = await createField(app, cookiesA, farmA.farmId, -94.7);
      const fieldBId = await createField(app, cookiesB, farmB.farmId, -94.8);
      await seedStressZone(orgA.organizationId, fieldAId);
      await seedStressZone(orgB.organizationId, fieldBId);
      return {
        cookies: cookiesA,
        method: 'get',
        ownPath: `/api/v1/fields/${fieldAId}/stress-zones`,
        otherPath: `/api/v1/fields/${fieldBId}/stress-zones`,
      };
    },
  },
  {
    name: 'PATCH /stress-zones/:id',
    build: async (app) => {
      const orgA = await seedUserWithOrg('owner');
      const orgB = await seedUserWithOrg('owner');
      const [farmA, farmB] = await Promise.all([
        seedFarmAndCrop(orgA.organizationId),
        seedFarmAndCrop(orgB.organizationId),
      ]);
      const cookiesA = await loginAs(app, orgA.email, orgA.password);
      const cookiesB = await loginAs(app, orgB.email, orgB.password);
      const fieldAId = await createField(app, cookiesA, farmA.farmId, -94.9);
      const fieldBId = await createField(app, cookiesB, farmB.farmId, -95.0);
      const zoneAId = await seedStressZone(orgA.organizationId, fieldAId);
      const zoneBId = await seedStressZone(orgB.organizationId, fieldBId);
      return {
        cookies: cookiesA,
        method: 'patch',
        ownPath: `/api/v1/stress-zones/${zoneAId}`,
        otherPath: `/api/v1/stress-zones/${zoneBId}`,
        body: { muted: true },
      };
    },
  },
  {
    name: 'DELETE /stress-zones/:id',
    build: async (app) => {
      const orgA = await seedUserWithOrg('owner');
      const orgB = await seedUserWithOrg('owner');
      const [farmA, farmB] = await Promise.all([
        seedFarmAndCrop(orgA.organizationId),
        seedFarmAndCrop(orgB.organizationId),
      ]);
      const cookiesA = await loginAs(app, orgA.email, orgA.password);
      const cookiesB = await loginAs(app, orgB.email, orgB.password);
      const fieldAId = await createField(app, cookiesA, farmA.farmId, -95.1);
      const fieldBId = await createField(app, cookiesB, farmB.farmId, -95.2);
      const zoneAId = await seedStressZone(orgA.organizationId, fieldAId);
      const zoneBId = await seedStressZone(orgB.organizationId, fieldBId);
      return {
        cookies: cookiesA,
        method: 'delete',
        ownPath: `/api/v1/stress-zones/${zoneAId}`,
        otherPath: `/api/v1/stress-zones/${zoneBId}`,
      };
    },
  },
  {
    name: 'GET /farms/:id/dashboard',
    build: async (app) => {
      const orgA = await seedUserWithOrg('owner');
      const orgB = await seedUserWithOrg('owner');
      const [farmA, farmB] = await Promise.all([
        seedFarmAndCrop(orgA.organizationId),
        seedFarmAndCrop(orgB.organizationId),
      ]);
      const cookiesA = await loginAs(app, orgA.email, orgA.password);
      return {
        cookies: cookiesA,
        method: 'get',
        ownPath: `/api/v1/farms/${farmA.farmId}/dashboard`,
        otherPath: `/api/v1/farms/${farmB.farmId}/dashboard`,
      };
    },
  },
  {
    name: 'GET /farms/:id/weather',
    build: async (app) => {
      const orgA = await seedUserWithOrg('owner');
      const orgB = await seedUserWithOrg('owner');
      const [farmA, farmB] = await Promise.all([
        seedFarmAndCrop(orgA.organizationId),
        seedFarmAndCrop(orgB.organizationId),
      ]);
      const cookiesA = await loginAs(app, orgA.email, orgA.password);
      return {
        cookies: cookiesA,
        method: 'get',
        ownPath: `/api/v1/farms/${farmA.farmId}/weather`,
        otherPath: `/api/v1/farms/${farmB.farmId}/weather`,
      };
    },
  },
  {
    name: 'PATCH /tasks/:id',
    build: async (app) => {
      const orgA = await seedUserWithOrg('owner');
      const orgB = await seedUserWithOrg('owner');
      const cookiesA = await loginAs(app, orgA.email, orgA.password);
      const cookiesB = await loginAs(app, orgB.email, orgB.password);
      const taskAId = await createTask(app, cookiesA, 'Tenancy Task A');
      const taskBId = await createTask(app, cookiesB, 'Tenancy Task B');
      return {
        cookies: cookiesA,
        method: 'patch',
        ownPath: `/api/v1/tasks/${taskAId}`,
        otherPath: `/api/v1/tasks/${taskBId}`,
        body: { title: 'Renamed' },
      };
    },
  },
  {
    name: 'PATCH /tasks/:id/move',
    build: async (app) => {
      const orgA = await seedUserWithOrg('owner');
      const orgB = await seedUserWithOrg('owner');
      const cookiesA = await loginAs(app, orgA.email, orgA.password);
      const cookiesB = await loginAs(app, orgB.email, orgB.password);
      const taskAId = await createTask(app, cookiesA, 'Tenancy Move A');
      const taskBId = await createTask(app, cookiesB, 'Tenancy Move B');
      return {
        cookies: cookiesA,
        method: 'patch',
        ownPath: `/api/v1/tasks/${taskAId}/move`,
        otherPath: `/api/v1/tasks/${taskBId}/move`,
        body: { status: 'in_progress', beforeId: null, afterId: null },
      };
    },
  },
  {
    name: 'DELETE /tasks/:id',
    build: async (app) => {
      const orgA = await seedUserWithOrg('owner');
      const orgB = await seedUserWithOrg('owner');
      const cookiesA = await loginAs(app, orgA.email, orgA.password);
      const cookiesB = await loginAs(app, orgB.email, orgB.password);
      // Two of org A's own tasks — the sanity 200 check deletes one, and it
      // must not be the same task the 404 check targets (same reasoning as
      // 'DELETE /fields/:id' above).
      const taskAId = await createTask(app, cookiesA, 'Tenancy Delete A');
      await createTask(app, cookiesA, 'Tenancy Delete A2');
      const taskBId = await createTask(app, cookiesB, 'Tenancy Delete B');
      return {
        cookies: cookiesA,
        method: 'delete',
        ownPath: `/api/v1/tasks/${taskAId}`,
        otherPath: `/api/v1/tasks/${taskBId}`,
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
      expect([200, 201, 202, 204]).toContain(ownRes.status);
    },
  );
});
