import { customType } from "drizzle-orm/pg-core";

/**
 * Postgres `citext` (case-insensitive text) — no native Drizzle column type,
 * same situation as the `geography` types in ./geography.ts. Used for `email`
 * and `slug` so uniqueness is case-insensitive in the database itself, not in
 * application code that can be bypassed. Requires `CREATE EXTENSION citext`,
 * added at the top of migrations/0002_auth_tables.sql.
 */
export const citext = customType<{ data: string }>({
  dataType: () => "citext",
});
