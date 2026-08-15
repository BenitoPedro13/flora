import type { Role } from '@flora/contracts';

/** Access token claims (TASK-auth-tenancy §2.3): `sub` user, `org` active organization, `role`, `jti`. */
export interface AccessTokenClaims {
  sub: string;
  org: string;
  role: Role;
  jti: string;
}
