import { Controller, Get, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { organizations, users } from '@flora/db';
import type { Tx } from '@flora/db';
import type { Session } from '@flora/contracts';
import { TenantTx } from '../tenancy/tenant-tx.decorator.js';
import { CurrentUser } from './current-user.decorator.js';
import type { AccessTokenClaims } from './types.js';

@Controller('me')
export class MeController {
  @Get()
  async getMe(
    @CurrentUser() claims: AccessTokenClaims,
    @TenantTx() tx: Tx,
  ): Promise<Session> {
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, claims.sub))
      .limit(1);
    const [organization] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, claims.org))
      .limit(1);

    if (!user || !organization) {
      throw new UnauthorizedException();
    }

    return {
      user: { id: user.id, email: user.email, name: user.name },
      organization: { id: organization.id, name: organization.name },
      role: claims.role,
    };
  }
}
