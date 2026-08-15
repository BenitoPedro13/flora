import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Database } from '@flora/db';
import { and, eq } from 'drizzle-orm';
import { memberships, refreshTokens, withOrganization } from '@flora/db';
import type { Role } from '@flora/contracts';
import { DATABASE } from '../tenancy/database.tokens.js';
import type { AccessTokenClaims } from './types.js';

const REFRESH_TOKEN_BYTES = 32;

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  refreshTokenExpiresInSeconds: number;
}

interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

/**
 * Access + refresh token issuance, rotation, and reuse detection
 * (TASK-auth-tenancy §2.3). The refresh token itself is 32 random bytes,
 * stored only as its SHA-256 hash — not argon2, which exists to make
 * low-entropy human passwords expensive to guess. A 256-bit random string
 * has nothing to brute-force; running a 19 MiB KDF on every refresh would be
 * cost with no benefit.
 */
@Injectable()
export class TokenService {
  private readonly accessTtlSeconds = Number(
    process.env.ACCESS_TOKEN_TTL_SECONDS ?? 900,
  );
  private readonly refreshTtlSeconds = Number(
    process.env.REFRESH_TOKEN_TTL_SECONDS ?? 2_592_000,
  );

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jwtService: JwtService,
  ) {}

  /** New login: mints a fresh token family. */
  issueNewSession(
    userId: string,
    orgId: string,
    role: Role,
    meta: RequestMeta,
  ): Promise<IssuedTokens> {
    return this.issueTokens(userId, orgId, role, randomUUID(), meta);
  }

  /**
   * Rotates a presented refresh token. If the presented token was already
   * used, the entire family is revoked — the signature of a stolen token
   * being replayed, and the only response that also ends the sessions
   * descended from the theft.
   */
  async rotate(
    presentedToken: string,
    meta: RequestMeta,
  ): Promise<IssuedTokens> {
    const tokenHash = hashToken(presentedToken);
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedException('invalid refresh token');
    }

    if (row.usedAt) {
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException('invalid refresh token');
    }

    await this.db
      .update(refreshTokens)
      .set({ usedAt: new Date() })
      .where(eq(refreshTokens.id, row.id));

    const role = await this.currentRole(row.userId, row.organizationId);
    return this.issueTokens(
      row.userId,
      row.organizationId,
      role,
      row.familyId,
      meta,
    );
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.familyId, familyId));
  }

  async revokeByToken(presentedToken: string): Promise<void> {
    const tokenHash = hashToken(presentedToken);
    const [row] = await this.db
      .select({ familyId: refreshTokens.familyId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    if (row) {
      await this.revokeFamily(row.familyId);
    }
  }

  private async issueTokens(
    userId: string,
    orgId: string,
    role: Role,
    familyId: string,
    meta: RequestMeta,
  ): Promise<IssuedTokens> {
    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTtlSeconds * 1000);

    await this.db.insert(refreshTokens).values({
      userId,
      organizationId: orgId,
      familyId,
      tokenHash: hashToken(refreshToken),
      expiresAt,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });

    const claims: Omit<AccessTokenClaims, 'jti'> = {
      sub: userId,
      org: orgId,
      role,
    };
    const accessToken = this.jwtService.sign(
      { ...claims, jti: randomUUID() },
      { expiresIn: this.accessTtlSeconds },
    );

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresInSeconds: this.accessTtlSeconds,
      refreshTokenExpiresInSeconds: this.refreshTtlSeconds,
    };
  }

  /** Re-read at every refresh so a role change since login takes effect immediately. */
  private currentRole(userId: string, orgId: string): Promise<Role> {
    return withOrganization(this.db, orgId, async (tx) => {
      const [row] = await tx
        .select({ role: memberships.role })
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, userId),
            eq(memberships.organizationId, orgId),
          ),
        )
        .limit(1);
      if (!row) {
        throw new UnauthorizedException('membership revoked');
      }
      return row.role;
    });
  }
}

function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}
