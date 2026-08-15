import { sql } from "drizzle-orm";
import type { Database } from "./client.js";

/**
 * The tenancy substrate every tenant-scoped table and query goes through
 * (invariant 6, TASK-auth-tenancy §2.1). Two properties are load-bearing and
 * both are asserted by tests in `queries/tenancy.spec.ts` and
 * `apps/api/test/tenancy.e2e.spec.ts`:
 *
 *  - the GUC is transaction-local (`set_config(..., is_local => true)`, like
 *    `SET LOCAL`) — the next borrower of a pooled connection sees nothing.
 *  - the org id is a bound parameter, never interpolated into SQL text.
 */

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Runs `fn` inside a transaction that has set `app.current_organization_id`
 * to `orgId` for the lifetime of that transaction only. Every tenant-scoped
 * query in the request path goes through this — see
 * `apps/api/src/tenancy/tenant-db.provider.ts`, the only place a controller
 * can obtain a `Tx`.
 */
export function withOrganization<T>(
  db: Database,
  orgId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_organization_id', ${orgId}, true)`);
    return fn(tx);
  });
}

/**
 * Emits the `ENABLE ROW LEVEL SECURITY` + deny-by-default `CREATE POLICY`
 * block for a tenant table, so a migration that adds one pastes this instead
 * of hand-writing it — one place defines what "protected" means, and
 * `queries/tenancy.spec.ts`'s catalog test is what stops a table shipping
 * without it. Not applied automatically at migration time (packages/db/src/migrate.ts
 * runs plain `.sql` files); call this from a script and paste the output into
 * the new migration, reviewed like any other DDL (CLAUDE.md §2.1).
 */
export function tenantRlsSql(tableName: string): string {
  const policyName = `${tableName}_tenant_isolation`;
  return [
    `ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;`,
    `CREATE POLICY ${policyName} ON ${tableName}`,
    `  USING (organization_id = app_current_org())`,
    `  WITH CHECK (organization_id = app_current_org());`,
  ].join("\n");
}
