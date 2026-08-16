-- Hand-written (CLAUDE.md §2.1), same reasoning as 0005/0007: RLS policies
-- and SECURITY DEFINER functions have no Drizzle schema representation.
-- TASK-home-dashboard §2.1/§2.9.

ALTER TABLE farm_daily_rollups ENABLE ROW LEVEL SECURITY;
CREATE POLICY farm_daily_rollups_tenant_isolation ON farm_daily_rollups
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE farm_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY farm_scores_tenant_isolation ON farm_scores
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE weather_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY weather_snapshots_tenant_isolation ON weather_snapshots
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

-- The rollup scheduler's cross-org enumeration problem is exactly
-- scheduler_fields_due_for_refresh's (0007): the worker runs as `flora_app`
-- with no BYPASSRLS and no `app.current_organization_id` set yet. This is
-- the system's third SECURITY DEFINER function — the tenancy.spec.ts
-- allowlist goes from two entries to three (TASK-home-dashboard §2.9).
-- Returns ids and a timezone only, same minimal shape as its sibling.
CREATE FUNCTION scheduler_farms_due_for_rollup()
  RETURNS TABLE (organization_id uuid, farm_id uuid, timezone text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$
    SELECT f.organization_id, f.id AS farm_id, f.timezone
    FROM farms f
  $$;

GRANT EXECUTE ON FUNCTION scheduler_farms_due_for_rollup() TO flora_app;
