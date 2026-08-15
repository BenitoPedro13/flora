import { membershipRoleValues } from "@flora/contracts";
import { inet, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { customType } from "drizzle-orm/pg-core";
import { citext } from "../types/citext.js";

/**
 * Built from `@flora/contracts`'s `membershipRoleValues`, not redeclared, so
 * the database enum and the API enum cannot drift (invariant 4).
 */
export const membershipRole = pgEnum("membership_role", membershipRoleValues);

/**
 * `bytea` — no native Drizzle column type. Used for token hashes (SHA-256,
 * always 32 bytes) so the raw bytes are stored rather than a hex/base64
 * re-encoding of them.
 */
const bytea = customType<{ data: Buffer }>({
  dataType: () => "bytea",
});

/**
 * RLS: `id = app_current_org()`. Enabled and policed in
 * migrations/0003_tenancy_rls.sql, not here — see that file's header for why
 * the policy can't live in generated DDL.
 */
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: citext("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * No RLS (TASK-auth-tenancy §2.1.5): identity, not tenant data. Every access
 * is keyed by a user id taken from a verified token, never a request
 * parameter.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: citext("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  avatarKey: text("avatar_key"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** RLS: standard `organization_id = app_current_org()`, in 0003. */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.organizationId, table.userId)],
);

/**
 * No RLS (TASK-auth-tenancy §2.1.5) — same reasoning as `users`. Carries
 * `organizationId` because the access token's `org` claim is minted from it,
 * not because a query filters refresh tokens by tenant.
 */
export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  familyId: uuid("family_id").notNull(),
  tokenHash: bytea("token_hash").notNull().unique(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  userAgent: text("user_agent"),
  ip: inet("ip"),
});
