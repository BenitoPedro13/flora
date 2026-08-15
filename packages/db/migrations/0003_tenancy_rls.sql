-- Hand-written (CLAUDE.md §2.1): CREATE ROLE, GRANT, and SECURITY DEFINER
-- functions have no Drizzle schema representation, and RLS policies live here
-- rather than in the generated 0002 because CREATE POLICY ... requires the
-- role it references to already exist — splitting that across a generated
-- and a hand-written file that must run in a fixed order would create a
-- circular dependency between them. See TASK-auth-tenancy.md §2.2 for the
-- resolved [VERIFY] on drizzle-kit's pgPolicy/pgRole support.

-- Non-bypass-RLS application role. apps/api and apps/worker connect as this
-- role (DATABASE_URL); packages/db scripts connect as the owner (flora,
-- DATABASE_MIGRATION_URL). "Enforced twice" (invariant 6) is only true if the
-- application layer cannot bypass RLS even when a repository filter is wrong
-- — a role that owns nothing and cannot BYPASSRLS is what makes that true.
--
-- The password below is a local-development placeholder, matching
-- infra/docker-compose.yml and .env.example. Any non-local environment MUST
-- rotate it immediately after this migration runs —
--   ALTER ROLE flora_app WITH PASSWORD '<value from the secrets manager>';
-- — before DATABASE_URL is ever pointed at it. Migrations are committed to
-- git and must never be a real credential's source of truth.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flora_app') THEN
    CREATE ROLE flora_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT
      PASSWORD 'flora-app-dev-secret';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO flora_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO flora_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO flora_app;

-- So a future migration's new tables (TASK-domain-schema's eight) are
-- covered without a per-table grant — verified in TASK-auth-tenancy §6.4
-- once that task adds one.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO flora_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO flora_app;

-- Deny-by-default tenant resolution. STABLE, not IMMUTABLE: its result
-- depends on a session GUC that changes within a session (packages/db/src/tenancy.ts).
-- When the GUC is unset, current_setting(..., true) returns '', nullif makes
-- that NULL, and every `organization_id = app_current_org()` comparison is
-- NULL — zero rows, not all rows. A forgotten withOrganization() fails
-- closed and loudly, not open and silently.
CREATE FUNCTION app_current_org() RETURNS uuid
  LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.current_organization_id', true), '')::uuid $$;

GRANT EXECUTE ON FUNCTION app_current_org() TO flora_app;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY organizations_tenant_isolation ON organizations
  USING (id = app_current_org())
  WITH CHECK (id = app_current_org());

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY memberships_tenant_isolation ON memberships
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

-- users and refresh_tokens carry no RLS (TASK-auth-tenancy §2.1.5): identity,
-- not tenant data. Every access is keyed by a user id taken from a verified
-- token, never a request parameter. Recorded explicitly so the catalog
-- test's carve-out list (packages/db/src/queries/tenancy.spec.ts) is a
-- decision, not an oversight.

-- The one deliberate cross-tenant carve-out (§2.1.5): login has to read a
-- user's memberships before any org context exists, exactly when the
-- policies above would return zero rows. SECURITY DEFINER runs this as the
-- table owner, so it sees across orgs — scoped to exactly one question
-- ("which orgs does this user belong to"), taking the user id as its only
-- argument. It is the only such function in the system; §6.12 asserts the
-- system-wide prosecdef count stays at 1.
CREATE FUNCTION auth_memberships_for_user(p_user_id uuid)
  RETURNS TABLE (organization_id uuid, organization_name text, role membership_role)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$
    SELECT o.id, o.name, m.role
    FROM memberships m
    JOIN organizations o ON o.id = m.organization_id
    WHERE m.user_id = p_user_id
    ORDER BY m.created_at ASC
  $$;

GRANT EXECUTE ON FUNCTION auth_memberships_for_user(uuid) TO flora_app;
