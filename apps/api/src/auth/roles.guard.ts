import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@flora/contracts';
import { ROLES_KEY } from './roles.decorator.js';
import type { RequestWithTx } from '../tenancy/tenant.interceptor.js';

/**
 * Not global — applied per-route with `@UseGuards(RolesGuard)` + `@Roles(...)`.
 * No role-gated resource exists yet (TASK-auth-tenancy §5); the real gates
 * land with TASK-fields and TASK-tasks-board. Exercised here only against a
 * fixture controller in roles.guard.spec.ts.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<RequestWithTx>().user;
    return !!user && required.includes(user.role);
  }
}
