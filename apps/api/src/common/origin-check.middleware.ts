import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defense in depth alongside SameSite=Lax: rejects any state-changing
 * request whose Origin header doesn't match WEB_ORIGIN. No CSRF token
 * ceremony in v1 — recorded here so the absence is a decision
 * (TASK-auth-tenancy §2.4).
 */
export function originCheckMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const origin = req.headers.origin;
  if (
    !SAFE_METHODS.has(req.method) &&
    typeof origin === 'string' &&
    origin !== process.env.WEB_ORIGIN
  ) {
    res.status(403).end();
    return;
  }
  next();
}
