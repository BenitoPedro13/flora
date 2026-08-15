import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ACCESS_TOKEN_COOKIE } from './cookies.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import type { AccessTokenClaims } from './types.js';
import type { RequestWithTx } from '../tenancy/tenant.interceptor.js';

/**
 * Registered globally (APP_GUARD in auth.module.ts) — default-deny, so a new
 * controller is authenticated unless it deliberately opts out with
 * `@Public()` (TASK-auth-tenancy §2.4). Reads the access token from a
 * cookie, not an Authorization header — the session is cookie-based
 * end-to-end (architecture §7, §14).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<RequestWithTx>();
    const token: unknown = req.cookies?.[ACCESS_TOKEN_COOKIE];
    if (typeof token !== 'string') {
      throw new UnauthorizedException();
    }

    try {
      req.user = await this.jwtService.verifyAsync<AccessTokenClaims>(token);
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }
}
