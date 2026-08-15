import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * 5 attempts / 15 min per (IP, email) — not IP alone, so one attacker email
 * doesn't lock out every other account behind the same NAT, and one IP
 * spraying many emails still gets caught per-email (TASK-auth-tenancy §2.4).
 * Falls back to IP-only when the body carries no email (POST /auth/refresh).
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const body = req.body as { email?: unknown } | undefined;
    const email =
      typeof body?.email === 'string' ? body.email.toLowerCase() : '';
    return Promise.resolve(`${String(req.ip)}:${email}`);
  }
}
