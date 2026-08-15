import type { Response } from 'supertest';

/**
 * Every session cookie is `Secure` (TASK-auth-tenancy §2.8, verified by
 * §6.8's raw Set-Cookie assertion). A real browser resends `Secure` cookies
 * to `localhost` over plain HTTP as a special case; superagent's cookie jar
 * does not, so `request.agent()`'s automatic persistence silently drops them
 * between calls here. These tests relay Set-Cookie → Cookie by hand instead
 * of weakening the flag to make an imperfect test client happy.
 */
export function relayCookies(res: Response): string[] {
  return (
    (res.headers['set-cookie'] as unknown as string[] | undefined) ?? []
  ).map((c) => c.split(';')[0]);
}

export function asCookieHeader(cookies: string[]): string {
  return cookies.join('; ');
}

export function cookieValue(
  cookies: string[],
  name: string,
): string | undefined {
  const found = cookies.find((c) => c.startsWith(`${name}=`));
  return found?.slice(name.length + 1);
}
