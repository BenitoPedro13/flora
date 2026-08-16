-- Hand-corrected (CLAUDE.md §2.1, TASK-fields §2.3): drizzle-kit's diff also
-- proposed `ALTER TABLE "geo_spike" DISABLE ROW LEVEL SECURITY; DROP TABLE
-- "geo_spike" CASCADE;` — a phantom drop. Its own snapshot history still
-- carries geo_spike from before TASK-domain-schema's `0005_domain_rls.sql`
-- hand-dropped it outside drizzle-kit's tracking, so the diff re-proposes a
-- table that no longer exists. Stripped; only the two real index additions
-- below are generated DDL, checked against a live container per the
-- TASK-fields risk log before commit.
CREATE INDEX "fields_org_position_id_idx" ON "fields" USING btree ("organization_id","position","id");--> statement-breakpoint
CREATE INDEX "fields_org_name_id_idx" ON "fields" USING btree ("organization_id","name","id");
