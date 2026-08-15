import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Database, Tx } from '@flora/db';
import { withOrganization } from '@flora/db';
import type { Request } from 'express';
import { firstValueFrom, from, type Observable } from 'rxjs';
import type { AccessTokenClaims } from '../auth/types.js';
import { DATABASE } from './database.tokens.js';

export type RequestWithTx = Request & { user?: AccessTokenClaims; tx?: Tx };

/**
 * Global interceptor (registered in AppModule). For every authenticated
 * request, wraps the route handler in `withOrganization(db, user.org, ...)`
 * and stashes the resulting `Tx` on the request so the `@TenantTx()` param
 * decorator (tenant-tx.decorator.ts) can hand it to controllers — this is
 * the repository-layer half of invariant 6 (TASK-auth-tenancy §2.4).
 * Public routes (no `req.user`, set by JwtAuthGuard) pass through untouched.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestWithTx>();
    if (!req.user) {
      return next.handle();
    }

    return from(
      withOrganization(this.db, req.user.org, async (tx): Promise<unknown> => {
        req.tx = tx;
        return firstValueFrom(next.handle(), { defaultValue: undefined });
      }),
    );
  }
}
