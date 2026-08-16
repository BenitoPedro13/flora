import { createDbClient, refreshTokens } from '@flora/db';
import type { Session } from '@flora/contracts';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { asCookieHeader, cookieValue, relayCookies } from './cookie-utils.js';
import { getServer } from './http.js';
import { getTestApp, seedUserWithOrg } from './setup.js';

describe('auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // getTestApp() is a shared, process-lifetime singleton (test/setup.ts) —
    // every e2e spec file reuses the same compiled app, so it must not be
    // closed here. Closing it in one file's afterAll starved every file that
    // runs after it (fileParallelism: false runs every file in one worker).
    // Testcontainers' own reaper cleans up the containers at process exit.
    app = await getTestApp();
  });

  it('logs in, reads /me, refreshes, and logs out — the full cookie flow', async () => {
    const seeded = await seedUserWithOrg('owner');
    const server = getServer(app);

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: seeded.email, password: seeded.password });
    expect(login.status).toBe(204);

    // Flags live on the raw Set-Cookie header, not the name=value pairs
    // relayCookies() extracts for resending on later requests.
    const rawSetCookie = login.headers['set-cookie'] as unknown as string[];
    const accessSetCookie = rawSetCookie.find((c) =>
      c.startsWith('flora_access_token='),
    )!;
    expect(accessSetCookie).toContain('HttpOnly');
    expect(accessSetCookie).toContain('Secure');
    expect(accessSetCookie).toContain('SameSite=Lax');
    const refreshSetCookie = rawSetCookie.find((c) =>
      c.startsWith('flora_refresh_token='),
    )!;
    expect(refreshSetCookie).toContain('Path=/api/v1/auth/refresh');

    const loginCookies = relayCookies(login);

    const accessToken = cookieValue(loginCookies, 'flora_access_token')!;
    const [, payloadB64] = accessToken.split('.');
    const claims = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8'),
    ) as { exp: number; iat: number };
    expect(claims.exp - claims.iat).toBe(900);

    const me = await request(server)
      .get('/api/v1/me')
      .set('Cookie', asCookieHeader(loginCookies));
    expect(me.status).toBe(200);
    const meBody = me.body as Session;
    expect(meBody.user.email).toBe(seeded.email);
    expect(meBody.organization.id).toBe(seeded.organizationId);
    expect(meBody.role).toBe('owner');

    const refresh = await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', asCookieHeader(loginCookies));
    expect(refresh.status).toBe(204);
    const rotatedCookies = relayCookies(refresh);
    expect(cookieValue(rotatedCookies, 'flora_access_token')).not.toBe(
      accessToken,
    );

    const logout = await request(server)
      .post('/api/v1/auth/logout')
      .set('Cookie', asCookieHeader(rotatedCookies));
    expect(logout.status).toBe(204);
    const logoutSetCookie = logout.headers['set-cookie'] as unknown as string[];
    expect(
      logoutSetCookie.find((c) => c.startsWith('flora_access_token=')),
    ).toMatch(/Expires=|Max-Age=0/);
    expect(
      logoutSetCookie.find((c) => c.startsWith('flora_refresh_token=')),
    ).toMatch(/Expires=|Max-Age=0/);

    // The access token is a stateless JWT — logout revokes the refresh-token
    // family (verified below), not individual outstanding access tokens; a
    // short 15-minute TTL is the mitigation, not a revocation list. So the
    // guarantee logout actually makes is: the session can no longer refresh.
    const refreshAfterLogout = await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', asCookieHeader(rotatedCookies));
    expect(refreshAfterLogout.status).toBe(401);
  });

  it('rejects /me with an expired access token', async () => {
    const seeded = await seedUserWithOrg('owner');
    const { JwtService } = await import('@nestjs/jwt');
    const jwt = new JwtService({ secret: process.env.JWT_SIGNING_KEY });
    const expiredToken = jwt.sign(
      {
        sub: seeded.userId,
        org: seeded.organizationId,
        role: 'owner',
        jti: 'expired',
      },
      { expiresIn: -10 },
    );

    const res = await request(getServer(app))
      .get('/api/v1/me')
      .set('Cookie', `flora_access_token=${expiredToken}`);
    expect(res.status).toBe(401);
  });

  it('does not enumerate: unknown email and wrong password look and cost the same', async () => {
    const attempts = 200;
    const unknownTimings: number[] = [];
    const wrongPasswordTimings: number[] = [];
    let unknownBody: unknown;
    let wrongBody: unknown;

    // AuthThrottlerGuard tracks (IP, email) — a distinct real user per
    // attempt on the "wrong password" side, same as the "unknown email" side
    // already has, so this measures the enumeration property without
    // tripping the rate limiter it's genuinely supposed to trip on repeat
    // attempts against one account (covered separately below).
    const realUsers: Awaited<ReturnType<typeof seedUserWithOrg>>[] = [];
    for (let i = 0; i < attempts; i++) {
      realUsers.push(await seedUserWithOrg('owner'));
    }

    for (let i = 0; i < attempts; i++) {
      const start = performance.now();
      const res = await request(getServer(app))
        .post('/api/v1/auth/login')
        .send({
          email: `nobody-${i}@example.test`,
          password: 'whatever-password',
        });
      unknownTimings.push(performance.now() - start);
      unknownBody = res.body;
      expect(res.status).toBe(401);
    }

    for (let i = 0; i < attempts; i++) {
      const start = performance.now();
      const res = await request(getServer(app))
        .post('/api/v1/auth/login')
        .send({
          email: realUsers[i].email,
          password: 'definitely-wrong-password',
        });
      wrongPasswordTimings.push(performance.now() - start);
      wrongBody = res.body;
      expect(res.status).toBe(401);
    }

    expect(unknownBody).toEqual(wrongBody);

    const median = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };
    const diff = Math.abs(
      median(unknownTimings) - median(wrongPasswordTimings),
    );
    expect(diff).toBeLessThan(25);
  }, 60_000);

  it('detects refresh-token reuse and revokes the whole family', async () => {
    const seeded = await seedUserWithOrg('owner');
    const server = getServer(app);

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: seeded.email, password: seeded.password });
    const loginCookies = relayCookies(login);
    const originalRefresh = cookieValue(loginCookies, 'flora_refresh_token')!;

    // Rotate once, legitimately, capturing T'.
    const firstRotation = await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', asCookieHeader(loginCookies));
    expect(firstRotation.status).toBe(204);
    const rotatedRefresh = cookieValue(
      relayCookies(firstRotation),
      'flora_refresh_token',
    )!;

    // Replay the original token T — reuse of an already-used token.
    const replay = await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `flora_refresh_token=${originalRefresh}`);
    expect(replay.status).toBe(401);

    // T' must now also be rejected — the whole family was revoked.
    const rotatedNowRejected = await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `flora_refresh_token=${rotatedRefresh}`);
    expect(rotatedNowRejected.status).toBe(401);

    const { db, pool } = createDbClient(process.env.DATABASE_MIGRATION_URL!);
    try {
      const rows = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, seeded.userId));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
    } finally {
      await pool.end();
    }
  });

  it('rate limits after 5 failed attempts for the same (IP, email), 429 with Retry-After', async () => {
    const seeded = await seedUserWithOrg('owner');
    const server = getServer(app);

    let last: request.Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: seeded.email, password: 'wrong-password' });
    }
    expect(last!.status).toBe(429);
    expect(last!.headers['retry-after']).toBeDefined();

    const otherEmail = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: `different-${seeded.email}`, password: 'wrong-password' });
    expect(otherEmail.status).toBe(401);
  });
});
