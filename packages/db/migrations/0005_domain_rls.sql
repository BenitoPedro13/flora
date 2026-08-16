-- Hand-written (CLAUDE.md §2.1), same reasoning as 0003: RLS policies have
-- no Drizzle schema representation and must run after their tables exist.
-- The tenantRlsSql(t) blocks below are pasted output from a throwaway
-- `tsx -e` against packages/db/src/tenancy.ts, not hand-typed (TASK-domain-schema §2.5).

ALTER TABLE farms ENABLE ROW LEVEL SECURITY;
CREATE POLICY farms_tenant_isolation ON farms
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE crops ENABLE ROW LEVEL SECURITY;
CREATE POLICY crops_tenant_isolation ON crops
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY fields_tenant_isolation ON fields
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE crop_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY crop_cycles_tenant_isolation ON crop_cycles
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY observations_tenant_isolation ON observations
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE stress_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY stress_zones_tenant_isolation ON stress_zones
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tasks_tenant_isolation ON tasks
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_assignees_tenant_isolation ON task_assignees
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_comments_tenant_isolation ON task_comments
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY subtasks_tenant_isolation ON subtasks
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

-- Column comments recording the two invariants that live in column
-- semantics rather than in types (invariants 2 and 3).
COMMENT ON COLUMN observations.raster_key IS
  'R2 object key for the rendered PNG — never a signed URL. A persisted signed URL expires in the database.';
COMMENT ON TABLE fields IS
  'No area column, ever. Area is derived via ST_Area(boundary) at read time — see packages/db/src/queries/fields.ts.';

-- The spike's stated end (architecture §5.2, TASK-domain-schema §2.7): it
-- resolved the PostGIS/Drizzle [VERIFY] and its evidence is recorded in the
-- spec. `fields` is the real table now.
DROP TABLE IF EXISTS geo_spike;
