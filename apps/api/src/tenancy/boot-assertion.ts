import { assertNonBypassRlsRole } from '@flora/db';

/** Called once from main.ts, before NestFactory.create — TASK-auth-tenancy §2.7. */
export function assertBootRlsRole(): Promise<void> {
  return assertNonBypassRlsRole(process.env.DATABASE_URL!);
}
