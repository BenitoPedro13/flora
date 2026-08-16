import type { MultiPolygon } from "@flora/contracts";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbClient } from "../client.js";
import { memberships, organizations, users } from "../schema/auth.js";
import { startTestInfra, type TestInfra } from "../test/containers.js";
import { withOrganization } from "../tenancy.js";
import { insertField } from "./fields.js";

describe("tenancy", () => {
  let infra: TestInfra;
  let owner: ReturnType<typeof createDbClient>;
  let app: ReturnType<typeof createDbClient>;
  let orgAId: string;
  let orgBId: string;
  let userId: string;

  beforeAll(async () => {
    infra = await startTestInfra();
    owner = createDbClient(infra.ownerUrl);
    app = createDbClient(infra.appUrl);

    const [orgA] = await owner.db
      .insert(organizations)
      .values({ name: "Org A", slug: "tenancy-spec-org-a" })
      .returning();
    const [orgB] = await owner.db
      .insert(organizations)
      .values({ name: "Org B", slug: "tenancy-spec-org-b" })
      .returning();
    const [user] = await owner.db
      .insert(users)
      .values({ email: "tenancy-spec@example.test", passwordHash: "unused" })
      .returning();
    orgAId = orgA!.id;
    orgBId = orgB!.id;
    userId = user!.id;
  });

  afterAll(async () => {
    await owner.pool.end();
    await app.pool.end();
    await infra.stop();
  });

  describe("catalog test — every tenant table has RLS (§6.3)", () => {
    it("finds zero unprotected tenant tables today", async () => {
      const unprotected = await unprotectedTenantTables(owner.pool);
      expect(unprotected).toEqual([]);
    });

    it("is not vacuous — the ten TASK-domain-schema tables exist and are RLS-protected (TASK-domain-schema §6 item 10)", async () => {
      const domainTables = [
        "farms",
        "crops",
        "fields",
        "crop_cycles",
        "observations",
        "stress_zones",
        "tasks",
        "task_assignees",
        "task_comments",
        "subtasks",
      ];
      const { rows } = await owner.pool.query<{ relname: string; relrowsecurity: boolean }>(
        `SELECT relname, relrowsecurity FROM pg_class
         WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1)`,
        [domainTables],
      );
      expect(rows.map((r) => r.relname).sort()).toEqual([...domainTables].sort());
      for (const row of rows) {
        expect(row.relrowsecurity).toBe(true);
      }
    });

    it("ALTER DEFAULT PRIVILEGES covered the ten new tables with no explicit GRANT (TASK-domain-schema §6 item 11)", async () => {
      const domainTables = [
        "farms",
        "crops",
        "fields",
        "crop_cycles",
        "observations",
        "stress_zones",
        "tasks",
        "task_assignees",
        "task_comments",
        "subtasks",
      ];
      for (const table of domainTables) {
        const { rows } = await owner.pool.query<{ has_privilege: boolean }>(
          `SELECT has_table_privilege('flora_app', $1, 'SELECT,INSERT,UPDATE,DELETE') AS has_privilege`,
          [table],
        );
        expect(rows[0]!.has_privilege).toBe(true);
      }
    });

    it("has exactly the two named SECURITY DEFINER functions (TASK-satellite-pipeline §2.4) — an allowlist, not a count", async () => {
      // Was `expect(count).toBe(1)` before TASK-satellite-pipeline added
      // scheduler_fields_due_for_refresh. A named allowlist is a strictly
      // better guard than a count: it still fails if a *third* SECURITY
      // DEFINER function appears anywhere, but for a different, legible
      // reason than "the number changed" — and it independently asserts
      // each function's own scope stays ids-only.
      const { rows } = await owner.pool.query<{ proname: string }>(
        `SELECT proname FROM pg_proc
         WHERE prosecdef AND pronamespace = 'public'::regnamespace`,
      );
      expect(rows.map((r) => r.proname).sort()).toEqual(
        ["auth_memberships_for_user", "scheduler_fields_due_for_refresh"].sort(),
      );
    });

    it("scheduler_fields_due_for_refresh returns ids and a timezone only — nothing a leak would be interesting about", async () => {
      const { rows } = await owner.pool.query<{ column_name: string }>(
        `SELECT p.parameter_name AS column_name
         FROM information_schema.parameters p
         JOIN information_schema.routines r
           ON r.specific_name = p.specific_name AND r.specific_schema = p.specific_schema
         WHERE r.routine_name = 'scheduler_fields_due_for_refresh' AND r.routine_schema = 'public'
           AND p.parameter_mode = 'OUT'
         ORDER BY p.ordinal_position`,
      );
      expect(rows.map((r) => r.column_name)).toEqual(["organization_id", "farm_id", "field_id", "timezone"]);
    });

    it("catches a scratch table added without a policy — demonstrating a real failure", async () => {
      const client = new Client({ connectionString: infra.ownerUrl });
      await client.connect();
      try {
        await client.query(
          "CREATE TABLE scratch_unprotected (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL)",
        );
        const unprotected = await unprotectedTenantTables(owner.pool);
        expect(unprotected).toContain("scratch_unprotected");
      } finally {
        await client.query("DROP TABLE IF EXISTS scratch_unprotected");
        await client.end();
      }
    });
  });

  describe("RLS holds without HTTP (§6.4)", () => {
    it("returns only the caller's org when the GUC is set", async () => {
      await withOrganization(app.db, orgAId, async (tx) => {
        const rows = await tx.select().from(organizations).where(sql`slug LIKE 'tenancy-spec-%'`);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.id).toBe(orgAId);
      });
    });

    it("rejects an insert carrying another org's id via WITH CHECK", async () => {
      // drizzle wraps the driver error ("Failed query: ...") and puts the
      // actual Postgres message on `.cause`, not `.message`.
      let caught: unknown;
      try {
        await withOrganization(app.db, orgAId, async (tx) => {
          await tx.insert(memberships).values({ organizationId: orgBId, userId, role: "owner" });
        });
      } catch (err) {
        caught = err;
      }
      const cause = (caught as { cause?: unknown } | undefined)?.cause;
      const message = cause instanceof Error ? cause.message : String(caught);
      expect(message).toMatch(/row-level security/i);
    });

    it("returns zero rows with no GUC set at all", async () => {
      const rows = await app.db.select().from(organizations).where(sql`slug LIKE 'tenancy-spec-%'`);
      expect(rows).toHaveLength(0);
    });
  });

  describe("scheduler_fields_due_for_refresh (TASK-satellite-pipeline §6 item 15)", () => {
    it("finds work in both orgs when called as flora_app with no GUC set at all — the exact query that silently returns zero rows if §2.4 is ignored", async () => {
      const point = { type: "Point", coordinates: [-59.13, -4.58] };
      const boundary: MultiPolygon = {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [-59.134, -4.585],
              [-59.132, -4.585],
              [-59.132, -4.583],
              [-59.134, -4.583],
              [-59.134, -4.585],
            ],
          ],
        ],
      };

      const fieldIds: string[] = [];
      for (const orgId of [orgAId, orgBId]) {
        const { rows: farmRows } = await owner.pool.query<{ id: string }>(
          `INSERT INTO farms (organization_id, name, location, timezone)
           VALUES ($1, 'Scheduler Test Farm', ST_GeomFromGeoJSON($2), 'America/Manaus')
           RETURNING id`,
          [orgId, JSON.stringify(point)],
        );
        const farmId = farmRows[0]!.id;

        const { rows: cropRows } = await owner.pool.query<{ id: string }>(
          `INSERT INTO crops (organization_id, name, slug) VALUES ($1, 'Corn', 'corn') RETURNING id`,
          [orgId],
        );
        const cropId = cropRows[0]!.id;

        await withOrganization(owner.db, orgId, async (tx) => {
          const fieldId = await insertField(tx, {
            organizationId: orgId,
            farmId,
            name: "Scheduler Test Field",
            boundary,
            position: 1,
          });
          fieldIds.push(fieldId);
          await tx.execute(sql`
            INSERT INTO crop_cycles (organization_id, field_id, crop_id, planted_on, expected_harvest_on, status)
            VALUES (${orgId}, ${fieldId}, ${cropId}, current_date, current_date + 100, 'growing')
          `);
        });
      }

      const { rows } = await app.pool.query<{
        organization_id: string;
        farm_id: string;
        field_id: string;
        timezone: string;
      }>("SELECT * FROM scheduler_fields_due_for_refresh()");

      const returnedOrgIds = new Set(rows.map((r) => r.organization_id));
      expect(returnedOrgIds.has(orgAId)).toBe(true);
      expect(returnedOrgIds.has(orgBId)).toBe(true);
      for (const fieldId of fieldIds) {
        expect(rows.some((r) => r.field_id === fieldId)).toBe(true);
      }
    });
  });

  describe("the GUC does not survive its transaction (§6.5)", () => {
    it("is empty on the same pooled connection immediately after commit", async () => {
      // max: 1 so the query after withOrganization() provably reuses the
      // exact connection the transaction ran on.
      const pool = new Pool({ connectionString: infra.appUrl, max: 1 });
      const db = drizzle(pool);
      try {
        let insideValue: string | undefined;
        await withOrganization(db, orgAId, async (tx) => {
          const result = await tx.execute<{ value: string }>(
            sql`select current_setting('app.current_organization_id', true) as value`,
          );
          insideValue = result.rows[0]?.value;
        });
        expect(insideValue).toBe(orgAId);

        const after = await db.execute<{ value: string }>(
          sql`select current_setting('app.current_organization_id', true) as value`,
        );
        expect(after.rows[0]?.value).toBe("");
      } finally {
        await pool.end();
      }
    });
  });
});

/**
 * `refresh_tokens` carries an `organization_id` column (the access token's
 * `org` claim is minted from it) but is deliberately not tenant data — every
 * access is keyed by a user id from a verified token, never a request
 * parameter (TASK-auth-tenancy §2.1.5). Recorded here, not just in the
 * migration comment, so the carve-out is a decision this test enforces
 * rather than a gap it can't see. Anything added here needs the same
 * justification.
 */
const TENANCY_RLS_CARVE_OUTS = new Set(["refresh_tokens"]);

/**
 * The mechanism TASK-auth-tenancy §2.1.3 describes: every table with an
 * `organization_id` column must have `relrowsecurity = true` and at least
 * one policy in `pg_policies` whose qualifier references `app_current_org()`.
 */
async function unprotectedTenantTables(pool: Pool): Promise<string[]> {
  const { rows } = await pool.query<{ tablename: string }>(`
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_attribute a
      ON a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped
    WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace
      AND NOT (
        c.relrowsecurity
        AND EXISTS (
          SELECT 1 FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = c.relname
            AND p.qual LIKE '%app_current_org()%'
        )
      )
  `);
  return rows.map((r) => r.tablename).filter((name) => !TENANCY_RLS_CARVE_OUTS.has(name));
}
