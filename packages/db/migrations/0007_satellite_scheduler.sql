-- Hand-written (CLAUDE.md §2.1), same reasoning as 0003/0005: a SECURITY
-- DEFINER function has no Drizzle schema representation. No table changes —
-- TASK-domain-schema already shipped `observations` and `stress_zones` with
-- the exact columns and indexes this task needs.

-- The cross-tenant scheduling problem (TASK-satellite-pipeline §2.4): the
-- worker runs as `flora_app`, which has no BYPASSRLS (asserted at boot,
-- packages/db/src/assert-rls.ts). Under RLS with no
-- `app.current_organization_id` set, `app_current_org()` is NULL and every
-- tenant table — including a plain `SELECT ... FROM fields` here — returns
-- zero rows with no error. The scheduler needs to ask "which fields, across
-- every org, are due for a refresh" before any org context exists, exactly
-- the same shape of problem `auth_memberships_for_user` (0003) solved for
-- login. This is the system's second SECURITY DEFINER function; the
-- `prosecdef` catalog test in packages/db/src/queries/tenancy.spec.ts is now
-- a named allowlist of two instead of a count of one (§2.4 of that task).
--
-- Returns ids and a timezone only — no name, no geometry, no crop, nothing a
-- leak would be interesting about. It is the *only* unscoped step: the
-- refresh itself, and every read/write of real field data, runs inside
-- `withOrganization(db, orgId, ...)` exactly like the API does. Invariant 6
-- (tenancy enforced twice) survives intact.
CREATE FUNCTION scheduler_fields_due_for_refresh()
  RETURNS TABLE (organization_id uuid, farm_id uuid, field_id uuid, timezone text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$
    SELECT DISTINCT f.organization_id, f.farm_id, f.id AS field_id, fa.timezone
    FROM fields f
    JOIN farms fa ON fa.organization_id = f.organization_id AND fa.id = f.farm_id
    JOIN crop_cycles cc ON cc.organization_id = f.organization_id
      AND cc.field_id = f.id AND cc.status = 'growing'
  $$;

GRANT EXECUTE ON FUNCTION scheduler_fields_due_for_refresh() TO flora_app;
