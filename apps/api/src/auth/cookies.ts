import type { Request, Response } from 'express';
import type { IssuedTokens } from './token.service.js';

export const ACCESS_TOKEN_COOKIE = 'flora_access_token';
export const REFRESH_TOKEN_COOKIE = 'flora_refresh_token';

/**
 * The refresh cookie is scoped to this path only, so it is never sent on
 * ordinary API requests — only on the one endpoint that needs it.
 */
export const REFRESH_TOKEN_PATH = '/api/v1/auth/refresh';

export function requestMeta(req: Request): { userAgent?: string; ip?: string } {
  return { userAgent: req.get('user-agent'), ip: req.ip };
}

/**
 * `Secure` is unconditional, not gated on NODE_ENV: browsers treat
 * `localhost` as a secure context even over plain HTTP, so this is exercised
 * for real in local dev (§6.14), not just assumed for production.
 */
export function setSessionCookies(res: Response, tokens: IssuedTokens): void {
  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: tokens.accessTokenExpiresInSeconds * 1000,
  });
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: REFRESH_TOKEN_PATH,
    maxAge: tokens.refreshTokenExpiresInSeconds * 1000,
  });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: REFRESH_TOKEN_PATH });
}
