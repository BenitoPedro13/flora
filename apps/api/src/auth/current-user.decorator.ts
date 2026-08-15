import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AccessTokenClaims } from './types.js';
import type { RequestWithTx } from '../tenancy/tenant.interceptor.js';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AccessTokenClaims | undefined => {
    return ctx.switchToHttp().getRequest<RequestWithTx>().user;
  },
);
