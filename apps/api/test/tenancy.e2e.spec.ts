import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { asCookieHeader, relayCookies } from './cookie-utils.js';
import { TenantProbeModule } from './fixtures/tenant-probe.module.js';
import { getServer } from './http.js';
import { getTestApp, seedUserWithOrg } from './setup.js';

interface RegistryEntry {
  name: string;
  method: 'get' | 'post';
  /** Given org B's id, the path an org-A caller should never be able to read. */
  path: (orgBId: string) => string;
}

/**
 * Table-driven so TASK-fields adds a line, not a file, once real org-scoped
 * resources exist (TASK-auth-tenancy §2.9, NFR-7). `organizations by id`
 * runs against the test-only TenantProbeController (fixtures/) — no real
 * resource takes an org-scoped identifier yet.
 */
const REGISTRY: RegistryEntry[] = [
  {
    name: 'organizations by id',
    method: 'get',
    path: (orgBId) => `/api/v1/test-fixtures/organizations/${orgBId}`,
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
    async ({ method, path }) => {
      const orgA = await seedUserWithOrg('owner');
      const orgB = await seedUserWithOrg('owner');
      const server = getServer(app);

      const login = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: orgA.email, password: orgA.password });
      expect(login.status).toBe(204);
      const cookies = asCookieHeader(relayCookies(login));

      const res = await request(server)
        [method](path(orgB.organizationId))
        .set('Cookie', cookies);
      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);

      // Sanity: the same route resolves for org A's own resource.
      const ownRes = await request(server)
        [method](path(orgA.organizationId))
        .set('Cookie', cookies);
      expect(ownRes.status).toBe(200);
    },
  );
});
