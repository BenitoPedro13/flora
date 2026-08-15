import { Client } from "pg";

/**
 * Boot-time guard against invariant 6's silent failure mode: pointing
 * `DATABASE_URL` at the owner role instead of `flora_app` disables RLS
 * completely and produces no other symptom (TASK-auth-tenancy §2.7). Call
 * once at process start, before anything else runs, from both apps/api and
 * apps/worker.
 */
export async function assertNonBypassRlsRole(databaseUrl: string): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>("SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user");
    const role = rows[0];
    if (!role || role.rolsuper || role.rolbypassrls) {
      throw new Error(
        `DATABASE_URL connects as role '${role?.rolname ?? "unknown"}' ` +
          `(rolsuper=${role?.rolsuper}, rolbypassrls=${role?.rolbypassrls}), which can bypass ` +
          `row-level security. It must be the flora_app role. Check whether DATABASE_URL and ` +
          `DATABASE_MIGRATION_URL have been swapped.`,
      );
    }
  } finally {
    await client.end();
  }
}
