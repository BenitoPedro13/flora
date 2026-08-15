import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * `[VERIFY: check the OWASP Password Storage Cheat Sheet at implementation
 * time and use its current argon2id figures rather than these]` —
 * TASK-auth-tenancy §2.3.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * A real argon2id hash (same cost parameters as ARGON2_OPTIONS) of a fixed,
 * unguessable value — not a placeholder string. Verifying against it costs
 * the same as a real password check, so an unknown-email login attempt takes
 * as long as a wrong-password one and response time can't be used to
 * enumerate accounts (TASK-auth-tenancy §2.5, verified by §6.7).
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$dWcMwZs9/TyBiBG1k0V0qw$nvr0oqYglM6/PYbulwY6Ljia8iAY0+UpV3fQf6EtA2I';

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return hash(plain, ARGON2_OPTIONS);
  }

  verify(passwordHash: string, plain: string): Promise<boolean> {
    return verify(passwordHash, plain, ARGON2_OPTIONS);
  }

  /** Runs the same cost as `verify` without a real hash to check against. */
  verifyDummy(plain: string): Promise<boolean> {
    return verify(DUMMY_HASH, plain, ARGON2_OPTIONS);
  }
}
