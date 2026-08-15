import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { Database } from '@flora/db';
import { users } from '@flora/db';
import type { Membership, Role } from '@flora/contracts';
import { DATABASE } from '../tenancy/database.tokens.js';
import { PasswordService } from './password.service.js';
import type { IssuedTokens } from './token.service.js';
import { TokenService } from './token.service.js';

interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * An unknown email and a wrong password return the same 401 in the same
   * time — the unknown-email path still runs a real argon2id verify against
   * a fixed dummy hash, so response time can't be used to enumerate accounts
   * (TASK-auth-tenancy §2.5, measured by §6.7).
   */
  async login(
    email: string,
    password: string,
    meta: RequestMeta,
  ): Promise<IssuedTokens> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      await this.passwords.verifyDummy(password);
      throw new UnauthorizedException('invalid credentials');
    }

    const valid = await this.passwords.verify(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException('invalid credentials');
    }

    const [membership] = await this.membershipsForUser(user.id);
    if (!membership) {
      throw new UnauthorizedException('no organization membership');
    }

    await this.db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    return this.tokens.issueNewSession(
      user.id,
      membership.organizationId,
      membership.role,
      meta,
    );
  }

  refresh(presentedToken: string, meta: RequestMeta): Promise<IssuedTokens> {
    return this.tokens.rotate(presentedToken, meta);
  }

  logout(presentedToken: string): Promise<void> {
    return this.tokens.revokeByToken(presentedToken);
  }

  /**
   * The one deliberate cross-tenant read (TASK-auth-tenancy §2.1.5): calls
   * the SECURITY DEFINER function directly, because login has no org context
   * yet for `withOrganization` to establish. A user's oldest membership is
   * their default org — organization switching is out of scope (§5).
   */
  private async membershipsForUser(userId: string): Promise<Membership[]> {
    const result = await this.db.execute<{
      organization_id: string;
      organization_name: string;
      role: Role;
    }>(sql`SELECT * FROM auth_memberships_for_user(${userId})`);
    return result.rows.map((row) => ({
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      role: row.role,
    }));
  }
}
