import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Tx } from '@flora/db';
import type { RequestWithTx } from './tenant.interceptor.js';

/**
 * The transaction TenantInterceptor opened for this request, already inside
 * `withOrganization` for the token's org (TASK-auth-tenancy §2.4). This is
 * the only way a controller gets a scoped connection — importing `@flora/db`
 * directly from outside `tenancy/` or `auth/` fails §6.13's grep.
 *
 * A plain param decorator reading `req.tx`, not a Scope.REQUEST-injected
 * provider: a request-scoped controller (one whose constructor depends on a
 * REQUEST-scoped provider) is resolved by Nest as part of invoking the route
 * handler, and in practice that resolution did not reliably happen after
 * TenantInterceptor's "before" code ran — this decorator sidesteps request
 * scoping entirely, the same way @CurrentUser() reads req.user.
 */
export const TenantTx = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Tx => {
    const req = ctx.switchToHttp().getRequest<RequestWithTx>();
    if (!req.tx) {
      throw new Error(
        'No tenant transaction on this request. TenantInterceptor must run before @TenantTx() is read — ' +
          'check it is registered as a global APP_INTERCEPTOR and that the route is not @Public().',
      );
    }
    return req.tx;
  },
);
