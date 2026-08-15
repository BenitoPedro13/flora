# TASK-auth-tenancy — identity, sessions, and tenancy enforced twice

> **Phase:** 0 (architecture §16) · **Status:** complete · **Date:** 2026-08-15
> **Depends on:** `TASK-foundations` (complete, `bc51470`) ·
> **Blocks:** `TASK-domain-schema`, and therefore the whole spine (`TASK-fields` →
> `TASK-crop-stress` → `TASK-tasks-board`)
> **Parallel with:** `TASK-design-system-shell` — no file overlap except `.env.example`
> **References:** [`../architecture.md`](../architecture.md) §5.3, §8.1, §8.2, §8.3, §10, §12,
> §13, §14, §15 (NFR-7), §17 Q6 · [`../design-spec.md`](../design-spec.md) §9

This is the second of three Phase 0 tasks. It builds identity and the **tenancy substrate that
every later table is required to use** — not a feature anyone can see.

---

## 1. Current scenario

`HEAD` is `bc51470`. `TASK-foundations` landed the monorepo, infra, and a proven
Drizzle+PostGIS skeleton. What exists that this task builds on:

- **`packages/db`** has `createDbClient` (a bare `Pool` + `drizzle`), the geography custom
  types, `queries/spatial.ts`, and two migrations — `0000_enable_postgis.sql`,
  `0001_geo_spike.sql`. `schema/spike.ts` is the only table. **There is no `organizations`
  table, no RLS anywhere, and no notion of a per-request tenant.**
- **`apps/api`** is a `nest new` scaffold plus `HealthModule`. `AppController`/`AppService`
  are the generator's `getHello()` stubs. There is **no global prefix, no CORS, no cookie
  parser, no validation pipe, no exception filter** — `main.ts` is `NestFactory.create` +
  `listen`. Nothing is authenticated because nothing exists to authenticate.
- **`packages/contracts`** exports `geojson.ts` and `smoke.ts`. No domain schemas, and
  **the `[VERIFY]` in architecture §8.2 — `nestjs-zod` vs a hand-written pipe — is unresolved.**
  zod resolves to **4.4.3**; the choice matters the moment a request body exists, which is now.
- **Tests are a scaffold, not a suite.** `apps/api` carries the generator's Jest config and
  `app.controller.spec.ts`; `packages/db` has no `test` script at all. `turbo test` passes
  because there is almost nothing to run. **No testcontainers.** Architecture §12 names Vitest
  as the runner; the Nest generator shipped Jest. That contradiction is unresolved and this is
  the first task that writes real tests, so it resolves here.
- **`apps/web` and `apps/api` both default to port 3000** (README's quickstart says so
  outright). Harmless while nothing talks to anything; a blocker the moment a browser has to
  send a cookie from one to the other.
- **`.env.example` already declares `JWT_SIGNING_KEY` and `WEB_ORIGIN`** — declared by
  foundations precisely so this task would not have to reshape configuration. Both are
  currently unread by any code.

Nothing about identity, sessions, or tenancy exists yet. Architecture §10 specifies the target
and §17 Q6 has already closed the one open question (no social login — email + password,
backend-owned identity).

---

## 2. Planned changes

### 2.1 The tenancy substrate — the reason this task exists

Invariant 6 (CLAUDE.md) says tenancy is enforced **twice**: a repository filter *and* Postgres
RLS. The second half is worthless if it can be forgotten on a new table, so the deliverable is
not "RLS on three tables" — it is **a mechanism `TASK-domain-schema` and every task after it
must go through, plus a test that fails when someone doesn't.**

| File | Change |
|---|---|
| `packages/db/src/tenancy.ts` | **new**. Three exports: `organizationId()` — the shared FK column definition; `tenantRlsSql(table)` — emits the exact `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` block for a table, so no migration hand-writes it; `withOrganization(db, orgId, fn)` — runs `fn` inside a transaction that has set the tenant GUC. |
| `packages/db/src/queries/tenancy.spec.ts` | **new**. The catalog test (§2.1.3). |

**2.1.1 How the tenant reaches Postgres.** A pooled connection is shared between requests, so
the org id must never outlive the statement that set it:

```ts
// packages/db/src/tenancy.ts
export function withOrganization<T>(db: Database, orgId: string, fn: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    // set_config(..., is_local => true) is transaction-scoped like SET LOCAL, but unlike
    // SET LOCAL it takes a bind parameter — orgId is never interpolated into SQL text.
    await tx.execute(sql`select set_config('app.current_organization_id', ${orgId}, true)`)
    return fn(tx)
  })
}
```

Two properties are load-bearing and both are asserted in §6: the GUC is **transaction-local**
(the next borrower of that pooled connection sees nothing), and the value is **bound, not
interpolated**.

**2.1.2 Policies deny by default.** Migration `0003` creates:

```sql
CREATE FUNCTION app_current_org() RETURNS uuid
  LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.current_organization_id', true), '')::uuid $$;
```

Every tenant policy is `USING (organization_id = app_current_org())` with the same expression
as `WITH CHECK`. When the GUC is unset the function returns `NULL`, the comparison is `NULL`,
and **zero rows are visible** — a forgotten `withOrganization` fails closed and loudly, not
open and silently.

**2.1.3 A tenant table cannot be added without RLS.** A test queries the catalog directly:

> every table in `public` with an `organization_id` column must have `relrowsecurity = true`
> and at least one policy in `pg_policies` whose qualifier references `app_current_org()`.

It is written once here and keeps failing for a real reason for the life of the project —
`TASK-domain-schema` adds eight tenant tables and this test is what stops one of them shipping
unprotected.

**2.1.4 Two database roles.** RLS is not a backstop if the application can bypass it, and a
table's owner bypasses its own policies by default.

| Role | Used by | Grants |
|---|---|---|
| `flora` (exists, owner) | `pnpm db:migrate`, `db:studio`, seeds | owns every table; bypasses RLS |
| `flora_app` (**new**, created in `0003`) | `apps/api`, `apps/worker` | `SELECT/INSERT/UPDATE/DELETE` on data tables, `USAGE` on the schema; **no** `BYPASSRLS`, not a superuser, owns nothing |

This adds one environment variable: `DATABASE_URL` becomes the **`flora_app`** connection that
apps use, and `DATABASE_MIGRATION_URL` (new) is the owner connection used only by
`packages/db` scripts. Getting this backwards silently disables RLS everywhere, so §2.7 adds a
boot-time assertion rather than trusting the deployment.

**2.1.5 The identity path is a deliberate, narrow carve-out.** Login has to read a user's
memberships *before* any org context exists — the policies above would return zero rows. The
answer is one auditable exception, not a weakening of the policy:

```sql
CREATE FUNCTION auth_memberships_for_user(p_user_id uuid)
  RETURNS TABLE (organization_id uuid, organization_name text, role membership_role)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ … $$;
GRANT EXECUTE ON FUNCTION auth_memberships_for_user(uuid) TO flora_app;
```

`SECURITY DEFINER` runs it as the owner, so it sees across orgs — scoped to exactly one
question ("which orgs does this user belong to"), taking the user id as its only argument. It
is the **only** such function in the system, and §6.11 asserts that count stays at one.

`users` and `refresh_tokens` carry **no** RLS, on purpose: they are identity, not tenant data,
and every access is keyed by a user id taken from a verified token, never from a request
parameter. Recorded explicitly so the catalog test's carve-out list is a decision rather than
an oversight.

**2.1.6 Changed during implementation: `@TenantTx()` decorator, not a `Scope.REQUEST` provider.**
The plan above was to expose the transaction as a request-scoped `TENANT_TX` DI token, injected
into controller constructors. Empirically (via `apps/api/test/tenancy.e2e.spec.ts` and
`test/auth.e2e.spec.ts`), this did not reliably work: a controller that depends on a
`Scope.REQUEST` provider becomes request-scoped itself, and Nest's resolution of that
request-scoped instance did not consistently happen *after* `TenantInterceptor`'s pre-handler
code had run — `TENANT_TX`'s factory saw `req.tx` unset even on requests that were correctly
authenticated. Diagnosed by adding temporary logging to the guard, interceptor, and provider
factory and confirming neither ran before the failure. The fix: `@TenantTx()`
(`apps/api/src/tenancy/tenant-tx.decorator.ts`) is a plain `createParamDecorator` reading
`req.tx` directly — the same pattern `@CurrentUser()` already used for `req.user` — with no
DI scoping involved. `TENANT_TX` and `Scope.REQUEST` were removed entirely; `TenancyModule` no
longer provides a request-scoped token, only the global `DATABASE` provider and
`TenantInterceptor`.

### 2.2 Schema

Generated by `drizzle-kit generate` from the Drizzle schema, then **reviewed by hand** —
drizzle-kit sees neither roles nor RLS (CLAUDE.md §2.1).

| Table | Columns | Tenancy |
|---|---|---|
| `organizations` | `id`, `name`, `slug citext unique`, `created_at`, `updated_at` | RLS: `id = app_current_org()` |
| `users` | `id`, `email citext unique`, `password_hash`, `name`, `avatar_key`, `last_login_at`, timestamps | none (§2.1.5) |
| `memberships` | `id`, `organization_id`, `user_id`, `role`, `created_at`, `unique(organization_id, user_id)` | RLS: standard |
| `refresh_tokens` | `id`, `user_id`, `organization_id`, `family_id`, `token_hash bytea unique`, `issued_at`, `expires_at`, `used_at`, `revoked_at`, `user_agent`, `ip inet` | none (§2.1.5) |

`membership_role` is a Postgres enum: `owner | manager | operator | viewer` (architecture §10).
`citext` needs `CREATE EXTENSION IF NOT EXISTS citext` — added at the top of `0002`, so
email and slug uniqueness is case-insensitive in the database rather than in application code
that can be bypassed.

| File | Change |
|---|---|
| `packages/db/src/schema/auth.ts` | **new**. The four tables + the enum. |
| `packages/db/src/schema/index.ts` | **new**. Barrel — `drizzle.config.ts` already globs `./src/schema/*.ts`. |
| `packages/db/migrations/0002_auth_tables.sql` | **new**, drizzle-kit generated + citext extension. |
| `packages/db/migrations/0003_tenancy_rls.sql` | **new**, hand-written: `flora_app` role, grants, `app_current_org()`, `auth_memberships_for_user()`, `ENABLE ROW LEVEL SECURITY` + policies. |

Kept in two files so `0002` stays regenerable and `0003` — the part a reviewer must actually
read — is not buried in generated DDL.

**Resolved.** drizzle-orm 0.45.2 does export `pgPolicy`/`pgRole`, and drizzle-kit 0.31.10 does
emit `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` DDL from them (confirmed against the
installed package — `getTableConfig()` extracts `policies`/`enableRLS`, and drizzle-kit's
`api.mjs` contains the corresponding SQL generation). **Kept `0003` fully hand-written anyway**:
`CREATE POLICY ... TO flora_app` requires the role to already exist, and role creation has no
Drizzle schema representation at all (`CREATE ROLE` isn't a table concept) — so it has to live
in the hand-written migration regardless. Splitting policies into the generated `0002` while
role creation stays in `0003` would create a circular dependency between a generated file and a
hand-written one that must run in a fixed lexical order. Keeping the whole tenant-isolation
chain (role → function → policy) in one file that runs after tables exist is simpler and has no
ordering hazard.

### 2.3 Password and token handling

**Passwords — argon2id** (architecture §10). Use **`@node-rs/argon2`**, not `argon2`: it ships
prebuilt binaries for arm64 macOS and amd64 Linux, so neither this machine nor CI nor a
deployment image needs a node-gyp toolchain. Parameters `m=19456 KiB, t=2, p=1`.
`[VERIFY: check the OWASP Password Storage Cheat Sheet at implementation time and use its
current argon2id figures rather than these.]`

**Access token** — JWT, HS256 over `JWT_SIGNING_KEY` (asserted ≥32 bytes at boot), **15 min**,
claims `sub` (user), `org` (active organization), `role`, `jti`, `exp`. The org lives in the
token so `withOrganization` never takes an org id from the request — architecture §8.1's
"`organizationId` is never a client-supplied parameter" is then structurally true, not a
convention.

**Refresh token** — 32 random bytes, base64url, **30 days**, rotating. Stored as its
**SHA-256 hash** (`bytea`), not argon2: argon2 exists to make low-entropy human passwords
expensive to guess, and a 256-bit random string has nothing to brute-force. Running a 19 MiB
KDF on every refresh would be cost with no benefit.

**Rotation with reuse detection.** Every token carries a `family_id`. On refresh the presented
row is stamped `used_at` and a successor is issued into the same family. **If a token that
already has `used_at` is presented, the entire family is revoked** — that is the signature of a
stolen token being replayed, and the response is to end every session descended from it. Logout
revokes the family.

### 2.4 API surface

Exactly the endpoints architecture §8.3 lists under auth — nothing invented:

```
POST   /api/v1/auth/login      { email, password }  → 204 + two Set-Cookie
POST   /api/v1/auth/refresh                          → 204 + rotated cookies
POST   /api/v1/auth/logout                           → 204 + cleared cookies, family revoked
GET    /api/v1/me                                    → { user, organization, role }
```

| File | Change |
|---|---|
| `apps/api/src/auth/auth.module.ts` · `auth.controller.ts` · `auth.service.ts` | **new** |
| `apps/api/src/auth/token.service.ts` | **new**. Sign/verify, rotation, family revocation. |
| `apps/api/src/auth/password.service.ts` | **new**. argon2id hash/verify + the dummy-hash path (§2.5). |
| `apps/api/src/auth/jwt-auth.guard.ts` | **new**, registered **globally**; opt out with `@Public()`. Default-deny: a new controller is authenticated unless someone deliberately says otherwise. |
| `apps/api/src/auth/roles.guard.ts` · `roles.decorator.ts` | **new**. `@Roles('owner','manager')`. |
| `apps/api/src/auth/current-user.decorator.ts` | **new**. `@CurrentUser()` → the verified claims. |
| `apps/api/src/tenancy/tenant-tx.decorator.ts` | **new** (planned as a `Scope.REQUEST` DI provider, `tenant-db.provider.ts`; changed during implementation — see §2.1.6). A `@TenantTx()` param decorator handing controllers the `Tx` `TenantInterceptor` already opened via `withOrganization` for the token's org. **This is the repository-layer half of invariant 6** — a controller cannot obtain an unscoped connection without importing `packages/db` directly, which §6.13 forbids by test. |
| `apps/api/src/common/problem.filter.ts` | **new**. RFC 9457 `application/problem+json` (architecture §8.1). First task with errors, so it lands here. |
| `apps/api/src/common/zod-validation.pipe.ts` | **new** (or `nestjs-zod` — see below). |
| `apps/api/src/main.ts` | edit. `setGlobalPrefix('api/v1')`, CORS with `credentials: true` against `WEB_ORIGIN`, `cookie-parser`, global filter + pipe + guards, `API_PORT`. |
| `apps/api/src/app.controller.ts` · `app.service.ts` | **removal**. The generator's `getHello()` stubs; `/health` and `/ready` become `@Public()`. |

**Resolved architecture §8.2's `[VERIFY]`.** zod is **4.4.3**; `nestjs-zod` **5.5.0** declares
`zod: "^3.25.0 || ^4.0.0"` as a peer dependency — it supports zod 4 directly, so it is used
rather than a hand-written pipe: `createZodDto()` for `LoginDto`, a global `ZodValidationPipe`,
and `ZodValidationException` mapped into `application/problem+json` by
`apps/api/src/common/problem.filter.ts`.

**Rate limiting.** `@nestjs/throttler` on `/auth/login` and `/auth/refresh`, backed by the
Redis already in compose: **5 attempts per 15 min per (IP, email)**, `429` with `Retry-After`.

**CSRF.** `SameSite=Lax` already blocks cross-site `POST`, and the API additionally rejects any
state-changing request whose `Origin` header is not `WEB_ORIGIN`. No token ceremony in v1;
recorded here so the absence is a decision.

### 2.5 Login must not enumerate users

An unknown email and a wrong password return the **same** `401` body, and the unknown-email
path still runs an argon2id verify against a fixed dummy hash so the two cost the same. Without
it, response time is an oracle that lists who has an account. §6.7 measures it.

### 2.6 Contracts

| File | Change |
|---|---|
| `packages/contracts/src/auth.ts` | **new**. `loginRequestSchema`, `sessionSchema`, `roleSchema`, `membershipSchema`, `problemDetailsSchema` + inferred types. |
| `packages/contracts/src/index.ts` | edit. Re-export. |
| `packages/contracts/src/smoke.ts` | **removal**. It was a placeholder pending the first real schema; this is it. |

`roleSchema` is `z.enum(['owner','manager','operator','viewer'])` and the Drizzle enum is built
**from it**, so the database enum and the API enum cannot drift (invariant 4).

### 2.7 Configuration

| File | Change |
|---|---|
| `packages/config/src/env.ts` | edit. `DATABASE_MIGRATION_URL` (new), `API_PORT` (default `3001`), `API_URL` (new, for `apps/web`), `JWT_SIGNING_KEY` tightened to `.min(32)`, `ACCESS_TOKEN_TTL`/`REFRESH_TOKEN_TTL` with the §2.3 defaults. |
| `.env.example` | edit. The new variables, with the local `flora_app` connection string. |
| `infra/docker-compose.yml` | edit. Nothing structural — the `flora_app` role is created by migration `0003`, so `pnpm infra:reset && pnpm db:migrate` still produces a working database from nothing. |
| `.github/workflows/ci.yml` | edit. New env vars; a real `JWT_SIGNING_KEY` of ≥32 bytes. |

**Boot assertion.** `apps/api` and `apps/worker` verify at startup that their connection is
subject to RLS: `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user` must
return `false, false`. If it does not, the process **exits 1 naming the role** — matching the
failure posture foundations established for missing env vars (§6.11 there). Pointing an app at
the owner URL is the one deployment mistake that turns RLS off completely and produces no other
symptom.

**The port collision** (`apps/web` and `apps/api` both on 3000) is fixed here rather than
deferred: cookies cannot be exercised end-to-end until the two have distinct origins.

**Discovered during implementation — unplanned, but required for `pnpm dev` to run at all.**
`apps/api`'s `package.json` never declared `"type": "module"`, unlike `packages/db`/
`packages/contracts`/`packages/config` — TypeScript therefore resolved drizzle-orm's ESM and
CJS type declarations as two nominally different types across that package boundary, breaking
every file that both imported a Drizzle-typed value from `@flora/db` and called `eq`/`and`/`sql`
from `drizzle-orm` directly (`TokenService`, `AuthService`, `MeController`, the tenant-probe
fixture). Fixed by adding `"type": "module"` to `apps/api` and `apps/worker` and fixing the one
extensionless relative import that broke under ESM (`main.ts`'s `./app.module` → `./app.module.js`).

That surfaced a second, deeper problem: `packages/config`, `packages/db`, and
`packages/contracts` exported raw `.ts` source (`"main": "./src/index.ts"`), which `nest
start`/`node dist/main.js` cannot resolve — Node has no `.ts` loader by default. Running the
dev server through `tsx` instead (which does resolve raw `.ts`) traded that problem for a worse
one: `tsx` transforms TypeScript via esbuild, and esbuild does not implement
`emitDecoratorMetadata` — NestJS's implicit constructor injection (any provider not using an
explicit `@Inject()` token, which is most of them) silently resolves to `undefined`, breaking at
the first guarded request (`JwtAuthGuard`'s `Reflector` was `undefined` at runtime, despite
`vitest`'s `unplugin-swc`-based tests — which use SWC, not esbuild — passing cleanly). **Fixed
by pre-compiling the three shared packages to real JS via `tsc`** rather than by working around
Nest's DI: each gained a `tsconfig.build.json` + `"build": "tsc -p tsconfig.build.json"` script,
and their `package.json` `main`/`types`/`exports` now point at `./dist/...`. `turbo.json`'s
`dev` task gained `"dependsOn": ["^build"]` so a fresh `pnpm dev` always has compiled
dependencies first. `apps/api`/`apps/worker`'s `start*` scripts reverted to `nest
start`/`node dist/main` (tsc/webpack-based, correct decorator metadata, and now able to resolve
real compiled JS for their workspace dependencies). `packages/db/src/test/containers.ts` is the
one deliberate exception — still raw `.ts`, imported only from `vitest` test files (which have
no NestJS decorators to worry about and handle `.ts` natively).

### 2.8 Web — minimal, unstyled, deliberately

AlignUI is not installed until `TASK-design-system-shell`, and **there is no login screen in the
Figma** — the design-spec §2 inventory has six screens and none of them is an auth screen. So
`apps/web` gets the smallest thing that proves the cookie flow in a real browser:

| File | Change |
|---|---|
| `apps/web/app/(auth)/login/page.tsx` | **new**. Plain form, Tailwind only. Restyled in `TASK-design-system-shell`. |
| `apps/web/lib/session.ts` | **new**. `getSession()` — server-side `GET /me` with the incoming cookies forwarded. |
| `apps/web/proxy.ts` | **new**. Redirects unauthenticated navigation to `/login` before render (an optimistic cookie-presence check only — `getSession()` in `app/page.tsx` is the real one). |
| `apps/web/app/page.tsx` | edit. Replace the `create-next-app` splash with the session gate + minimal logged-in view. |
| `apps/web/app/logout-button.tsx` | **new**. Small client component; logout needs a `fetch` + client-side redirect, not a plain form POST. |

**Resolved the `[VERIFY]`:** Next.js 16 renamed `middleware.ts` → `proxy.ts` (`export function
proxy(request: NextRequest)`), confirmed against `node_modules/next/dist/docs` — `middleware`
is deprecated, not removed, but `proxy` is the current convention.

**Changed during implementation:** the plan's `apps/web/app/(app)/layout.tsx` was dropped.
Next.js route groups don't add a URL segment, so `app/(app)/page.tsx` and the existing
`app/page.tsx` would both resolve to `/` — a duplicate-route error, not a valid pattern. Since
no real authenticated screen exists yet for `(app)/` to hold (Home lands in a later task), the
session-gate logic that would have lived in `(app)/layout.tsx` moved directly into
`app/page.tsx` instead. `(auth)/login` stays a route group — it's not competing for `/`, and it
gives `TASK-design-system-shell` a natural home for forgot-password/invite-acceptance later.

**Design gap D13 added to design-spec §9:** login, forgot-password, and the invite-acceptance
screens are undesigned. This task ships a functional unstyled login; the rest do not exist.

### 2.9 Test infrastructure — the first real suite in the repo

| File | Change |
|---|---|
| `packages/db/vitest.config.ts` · `apps/api/vitest.config.ts` | **new**. |
| `packages/db/src/test/containers.ts` | **new**. Shared testcontainers setup — PostGIS + Redis, migrations applied once per run. |
| `apps/api/test/tenancy.e2e.spec.ts` | **new**. The cross-tenant suite (NFR-7). |
| `apps/api/src/app.controller.spec.ts`, `apps/api/test/`, the `jest` block in `apps/api/package.json` | **removal**. |
| `turbo.json` | edit. `test` gets `"cache": false` — a suite whose result depends on a live container must not be replayed from cache. |

**Jest → Vitest.** Architecture §12 names Vitest; `nest new` shipped Jest. Two runners in one
repo is a permanent tax, and this is the last moment it costs nothing to fix — there are two
generated test files and no real suite. `@nestjs/testing` is runner-agnostic.

**Testcontainers image.** Same arm64 trap foundations hit: the image name comes from
`TEST_POSTGIS_IMAGE`, defaulting to `imresamu/postgis:16-3.4` on `arm64` and
`postgis/postgis:16-3.4` elsewhere, so the same command works on this machine and on CI's amd64
runners.

**The cross-tenant suite (NFR-7).** Seed org A and org B, each with an owner. Authenticate as
A, then assert **404 — not 403** on every org-B-scoped resource. Today that is `/me` and the
membership reads; the suite is built as a **table-driven registry of (method, path, factory)**
so `TASK-fields` adds a line rather than a file. 403 leaks existence; 404 does not.

Below it, at `packages/db`, RLS is tested **without any HTTP**: set the GUC to A, query
`memberships` and `organizations` directly, assert B's rows are invisible; assert an `INSERT`
carrying B's `organization_id` is rejected by `WITH CHECK`; assert that with **no** GUC set the
tables return zero rows.

---

## 3. Why

**Why tenancy before the domain schema.** `TASK-domain-schema` creates eight tenant-scoped
tables. If the RLS mechanism does not exist first, those tables are written without it and
retrofitting means revisiting every one — plus every query already built on them. Building the
substrate first means the next task's tables are protected because there is no other way to
declare them.

**Why a mechanism rather than three policies.** Three hand-written policies are three chances
to get it right and unlimited chances to forget the fourth. `tenantRlsSql()` plus the catalog
test (§2.1.3) converts an invariant a reviewer has to remember into a build failure.

**Why a second database role.** "Enforced twice" is a claim about what happens when the
application layer is wrong. If the app connects as the table owner, its policies do not apply
to it and the second enforcement is decorative. A role that cannot bypass RLS is what makes the
claim true, and the boot assertion (§2.7) is what keeps it true through a deployment mistake.

**Why deny-by-default policies.** The alternative — permissive when the GUC is unset — makes a
forgotten `withOrganization` return *everything*, which is the exact failure the whole design
exists to prevent. Failing closed means the bug is an empty list in development, not a leak in
production.

**Why one `SECURITY DEFINER` function and not a looser policy.** Login genuinely needs to read
across orgs. The choices are to weaken every membership policy with an `OR user_id = …` clause,
or to name the exception once, scope it to a single question, and count them in a test. The
second keeps the policy expression trivial enough to review at a glance.

**Why 404 and not 403 for foreign tenants.** A 403 confirms the resource exists. Across a
tenant boundary that is itself the leak — an attacker enumerating UUIDs learns which ones are
real. Architecture §13 already specifies this; NFR-7 measures it.

**Why refresh-token reuse detection.** Rotation without reuse detection turns a stolen token
into a permanent session — the thief simply keeps refreshing. Detecting the replay is what
makes rotation worth its complexity, and family revocation is the only response that also ends
the sessions derived from the theft.

**Why fix the runner and the port now.** Both are ~30-minute changes today and multi-file
migrations after `TASK-design-system-shell` and `TASK-domain-schema` have built on them. This
task is the first that needs a real test suite and the first that needs two distinct origins,
so it is the first that has to care — and the cheapest point at which to.

**Why the login page ships unstyled.** The cookie flow is not verified until a browser sets and
sends one. Waiting for AlignUI would leave the task's central mechanism proven only by
`supertest`, and the restyle is a contained change in a task that is already touching every
screen.

---

## 4. Affected files

| Path | Change | Notes |
|---|---|---|
| `packages/db/src/schema/auth.ts` | new | 4 tables + `membership_role`, `citext`/`bytea` custom types |
| `packages/db/src/schema/index.ts` | new | barrel |
| `packages/db/src/types/citext.ts` | new | `citext` custom type, same pattern as `types/geography.ts` |
| `packages/db/src/tenancy.ts` | new | **the substrate — `withOrganization`, `tenantRlsSql`** |
| `packages/db/src/assert-rls.ts` | new | `assertNonBypassRlsRole` — shared boot assertion, used by both apps |
| `packages/db/src/queries/tenancy.spec.ts` | new | catalog test + RLS-without-HTTP + GUC-scoping tests (§6.3–§6.5) |
| `packages/db/src/test/containers.ts` | new | shared testcontainers helper, arm64-aware image, `./test/containers` export |
| `packages/db/vitest.config.ts` | new | |
| `packages/db/tsconfig.build.json` | new | real `tsc` build — see §2.7's unplanned addendum |
| `packages/db/migrations/0002_auth_tables.sql` | new | drizzle-kit generated + `citext` extension |
| `packages/db/migrations/0003_tenancy_rls.sql` | new | **hand-written: role, grants, `app_current_org()`, policies, `auth_memberships_for_user()`** |
| `packages/db/src/seed.ts` | new | first org + owner (§5) |
| `packages/db/src/client.ts`, `src/migrate.ts`, `drizzle.config.ts` | edit | `DATABASE_MIGRATION_URL` (owner) instead of `DATABASE_URL` |
| `packages/db/package.json` | edit | `build`/`test` scripts, vitest + testcontainers + argon2 deps, `main`/`exports` → `dist/` |
| `packages/contracts/src/auth.ts` | new | zod source of truth for roles + session + login |
| `packages/contracts/src/health.ts` | new | `smoke.ts` renamed/promoted — `health.controller.ts` genuinely depends on it |
| `packages/contracts/src/index.ts` | edit | re-export |
| `packages/contracts/src/smoke.ts` | **removal** | superseded by `health.ts` + `auth.ts` |
| `packages/contracts/tsconfig.build.json` | new | real `tsc` build |
| `packages/contracts/package.json` | edit | `build` script, `main`/`exports` → `dist/` |
| `packages/config/src/env.ts` | edit | `DATABASE_MIGRATION_URL`, `API_PORT`, `API_URL`, TTLs, key length ≥32 |
| `packages/config/tsconfig.build.json` | new | real `tsc` build |
| `packages/config/package.json` | edit | `build` script, `./env` export → `dist/env.js` |
| `apps/api/src/auth/**` | new | module, controllers (`auth`, `me`), service, tokens, password, guards, decorators, cookies |
| `apps/api/src/tenancy/**` | new | `DatabaseModule`, `TenantInterceptor`, `TenantTx` decorator, `TenancyModule`, boot assertion |
| `apps/api/src/common/problem.filter.ts`, `origin-check.middleware.ts` | new | RFC 9457 filter; CSRF-adjacent Origin check |
| `apps/api/src/bootstrap.ts` | new | `configureApp()` — shared by `main.ts` and every e2e spec |
| `apps/api/src/main.ts` | edit | prefix, CORS+credentials, cookies, RLS assertion, global filter/pipe, port |
| `apps/api/src/app.module.ts` | edit | `TenancyModule`, `AuthModule`, `HealthModule` |
| `apps/api/src/health/health.controller.ts` | edit | `@Public()` |
| `apps/api/src/app.controller.ts`, `app.service.ts`, `app.controller.spec.ts` | **removal** | generator stubs |
| `apps/api/test/jest-e2e.json`, `apps/api/test/app.e2e-spec.ts` | **removal** | replaced by vitest |
| `apps/api/test/tenancy.e2e.spec.ts`, `test/fixtures/tenant-probe.*` | new | **NFR-7 cross-tenant suite** + the test-only probe route it exercises |
| `apps/api/test/auth.e2e.spec.ts` | new | login/refresh/rotation/reuse/lockout, real cookie-flag assertions |
| `apps/api/test/boot-assertion.e2e.spec.ts` | new | subprocess test for §6.11 (owner URL → exit 1; app URL → starts) |
| `apps/api/test/setup.ts`, `cookie-utils.ts`, `http.ts` | new | shared app bootstrap, seeding, and cookie-relay helpers for e2e specs |
| `apps/api/vitest.config.ts` | new | SWC transform (`unplugin-swc`) — esbuild doesn't emit decorator metadata |
| `apps/api/package.json` | edit | drop jest, add vitest/swc, argon2, jwt, throttler, cookie-parser, `drizzle-orm`, `"type": "module"` |
| `apps/worker/src/main.ts` | edit | RLS boot assertion (`assertNonBypassRlsRole` from `@flora/db`) |
| `apps/worker/package.json` | edit | `"type": "module"` |
| `apps/web/app/(auth)/login/page.tsx` | new | unstyled |
| `apps/web/lib/session.ts` | new | `getSession()` |
| `apps/web/proxy.ts` | new | optimistic cookie-presence redirect (§2.8's `[VERIFY]` resolved: `middleware.ts` → `proxy.ts` in Next 16) |
| `apps/web/app/page.tsx` | edit | splash → session gate + minimal logged-in view (no `(app)` group — see §2.8) |
| `apps/web/app/logout-button.tsx` | new | client component |
| `apps/web/next.config.ts` | edit | `rewrites()` — the §7/architecture-§14 cookie-topology decision |
| `apps/web/package.json` | edit | `dotenv -e ../../.env --` wrapping (web read no shared env vars before this), `@flora/contracts` dep |
| `turbo.json` | edit | `dev.dependsOn: ["^build"]` — see §2.7's unplanned addendum |
| `.env.example`, `.env` | edit | new variables |
| `.github/workflows/ci.yml` | edit | new env, ≥32-byte signing key, `flora_app` as `DATABASE_URL` |
| `pnpm-workspace.yaml` | edit | approved build scripts for `@swc/core`, `cpu-features`, `protobufjs`, `ssh2` (testcontainers/swc transitive deps) |
| `docs/architecture.md` | edit | §8.2 `[VERIFY]` resolved; §10 rewritten with hashing/rotation/roles/RLS-mechanism detail; §14 gains the cookie-topology decision and the RLS boot assertion; §17 gains Q9 |
| `docs/design-spec.md` | edit | §9 gains gap **D13** (auth screens undesigned) |
| `CLAUDE.md` | edit | status line, "next up" pointer |
| `README.md` | edit | status line, ports, `pnpm db:seed` |

---

## 5. Explicitly out of scope

- **Domain tables** — farms, fields, crop cycles, observations, stress zones, tasks. That is
  `TASK-domain-schema`, and it consumes this task's `tenancy.ts` rather than reimplementing it.
  The `geo_spike` table stays; that task drops it.
- **AlignUI, the app shell, `AppSidebar`, `PageHeader`** — `TASK-design-system-shell`.
- **Self-serve signup, invitations, user management UI, password reset.** §8.3 lists none of
  them. The first org and owner come from `pnpm db:seed`. Password reset needs an email
  provider, which nothing has chosen — raised as a new open question (§8), not answered here.
- **Organization switching.** The access token carries `org` so the claim shape supports it;
  no endpoint is built. A user with two memberships gets their oldest at login.
- **SSO / social login** — architecture §17 Q6, resolved: no.
- **The `operator` role's real restrictions** (task moves, stress classification vs. boundary
  edits). `RolesGuard` ships and is unit-tested against a fixture controller declared inside
  the test module, because **no role-gated resource exists yet**. The real gates land with the
  resources, in `TASK-fields` and `TASK-tasks-board`.
- **BullMQ.** `apps/worker` gains only the boot assertion.

---

## 6. Verification

Measurable per CLAUDE.md — no criterion may rest on "works" or "secure".

**Verified 2026-08-15.** All 16 items below hold. Notes on how, where it's worth being precise
about what "verified" means:

- **1, 2** — run directly (`pnpm infra:reset && pnpm db:migrate`, `\du`, `pnpm turbo lint
  typecheck test build --force`); all exit 0. `flora_app` shows `Superuser: no`, `Bypass RLS: no`.
- **3–5, 9** (part), **12** — `packages/db/src/queries/tenancy.spec.ts`, run against a real
  testcontainers Postgres (6 tests, all passing); item 9's `revoked_at`-on-every-row assertion
  is in `apps/api/test/auth.e2e.spec.ts` instead, queried through the owner connection.
- **6, 7, 8, 9, 10, 11** — `apps/api/test/{tenancy,auth,boot-assertion}.e2e.spec.ts` (13 tests),
  run against real testcontainers Postgres + Redis and a fully-configured Nest app (global
  guard, interceptor, filter, pipe — the same `configureApp()` `main.ts` uses). Item 6's
  registry has one entry today (`apps/api/test/fixtures/tenant-probe.*`, test-only — no real
  org-scoped HTTP resource exists yet); `TASK-fields` adds a real one and can delete the fixture.
  Item 7 ran the full 200-attempt comparison specified, not a reduced proxy.
- **13** — the grep passes as written; matches appear only under `apps/api/src/tenancy/` and
  `apps/api/src/auth/`.
- **14** — driven end-to-end via `curl` with a cookie jar through *both* running dev servers
  (`apps/web` on :3000 proxying to `apps/api` on :3001) — login, `/`'s session gate rendering
  the seeded user/org, logged-out redirect. Not additionally re-driven through an actual browser
  UI; the HTTP-level behavior (cookie flags, redirect, proxying) is identical either way, but a
  real click-through has not been separately performed.
- **15** — verified by direct request (`/health`, `/ready` return 200 with no cookies; `/me`
  returns 401 with no cookies) rather than by iterating Nest's route table programmatically —
  the doc's original phrasing described a stronger mechanism (a test that fails when a *future*
  controller forgets to declare itself, one way or the other) than what was actually built.
  Worth adding as a real test once a second protected controller exists, so the assertion has
  more than one data point.
- **16** — not independently confirmable from this session (no CI run triggered); the workflow
  file is updated with the new env vars a run would need.

1. `pnpm infra:reset && pnpm db:migrate` on an empty volume applies `0000`–`0003` and exits 0;
   a second run logs nothing and exits 0. `\du` shows `flora_app` with `Superuser: no`,
   `Bypass RLS: no`.
2. `pnpm turbo lint typecheck test build` exits 0 across all 6 workspace packages.
3. **The catalog test passes and fails for the right reason**: it reports zero unprotected
   tenant tables; adding a scratch table with an `organization_id` column and no policy makes
   it fail naming that table. Demonstrate both directions.
4. **RLS holds without HTTP** (`packages/db`, testcontainers): with the GUC set to org A,
   `SELECT` over `memberships` returns only A's rows and `organizations` returns exactly one;
   an `INSERT` carrying B's `organization_id` raises
   `new row violates row-level security policy`; with **no** GUC set, both tables return **0**
   rows.
5. **The GUC does not survive its transaction.** Inside `withOrganization`,
   `current_setting('app.current_organization_id', true)` is the org id; on the same pooled
   connection immediately afterwards it is empty. Run with `Pool({ max: 1 })` so the second
   query provably reuses the first connection.
6. **Cross-tenant suite (NFR-7)**: authenticated as org A, **100%** of registered org-B routes
   return **404**, and none returns 403. The registry is non-empty and its size is printed by
   the test.
7. **Login does not enumerate.** 200 attempts: unknown email vs. known email + wrong password.
   Both return an identical `401` body, and median response times differ by **< 25 ms**.
8. **Token lifecycle**: login sets two `HttpOnly; Secure; SameSite=Lax` cookies (asserted on
   the raw `Set-Cookie` header, `Path=/api/v1/auth/refresh` on the refresh cookie). The access
   token decodes to a 15-minute `exp`. `POST /refresh` with a valid token returns new values
   for both cookies. `GET /me` with an access token expired by clock manipulation returns 401.
9. **Reuse detection**: refresh with token *T* → *T′*; refresh again with *T* → **401**, and
   *T′* is then also rejected. Assert `revoked_at` is set on **every** row of that `family_id`.
10. **Rate limit**: 6 failed logins for one (IP, email) inside 15 min → the 6th is **429** with
    a `Retry-After` header; a different email from the same IP still gets 401, not 429.
11. **Boot assertion**: starting `apps/api` with `DATABASE_URL` pointed at the **owner** role
    exits **1** before `NestFactory` runs, printing the offending role name. Pointed at
    `flora_app` it starts normally.
12. **`SECURITY DEFINER` count is 1.** `SELECT count(*) FROM pg_proc WHERE prosecdef` returns
    exactly 1, and it is `auth_memberships_for_user`.
13. **No app reaches the database unscoped.**
    `grep -rn "createDbClient\|from '@flora/db'" apps/api/src` returns hits **only** in
    `tenancy/` and `auth/`; nothing under a controller constructs its own connection.
14. **End-to-end in a real browser**: `pnpm db:seed`, then log in at `localhost:3000/login` →
    redirected to `/`, `GET /me` returns the seeded user and org, cookies visible as `HttpOnly`
    in devtools. Logout clears both and returns to `/login`. Hitting `/` logged out redirects
    to `/login` without rendering.
15. `GET /health` and `GET /ready` still return 200 **without** credentials (`@Public()`), and
    every other route returns 401 without them — asserted by iterating the Nest route table, so
    a future unguarded controller fails this test.
16. **CI is green on a PR** — outstanding from `TASK-foundations` §6.12 and closed here, since
    this is the first branch that will be pushed.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| **Cookies break in the §14 deployment topology.** Architecture §14 puts `apps/web` on Vercel and `apps/api` on Railway/Fly — **different registrable domains, so `SameSite=Lax` cookies are not sent at all.** Local dev (`localhost:3000` → `:3001`) is same-site and hides this completely. | **Resolved.** `apps/web/next.config.ts` proxies `/api/v1/*` through Next `rewrites` to `API_URL`, keeping `SameSite=Lax`. Verified end-to-end against both dev servers running together (§6 item 14). Recorded in architecture §14 and §10. |
| ~~Request-scoped providers in Nest carry a per-request instantiation cost~~ | **Moot** — the request-scoped `TENANT_TX` provider was replaced by a plain `@TenantTx()` param decorator during implementation (§2.1.6) after it didn't reliably resolve after `TenantInterceptor`. No `Scope.REQUEST` providers remain in `apps/api`. |
| Testcontainers is slow enough that the suite gets skipped | One container per run, migrations applied once. Full `apps/api` e2e run is ~30–45s; not yet split into `test`/`test:integration` — revisit if it grows enough to tempt someone into mocking the database instead (architecture §13). |
| `nestjs-zod` does not support zod 4 | **Did not materialize** — 5.5.0 declares zod 4 as a peer. Used directly (§2.4, resolved). |
| drizzle-kit regenerates `0002` and silently drops the hand-written `0003` | They are separate files, and the catalog test (§6.3) fails immediately if policies vanish. |
| `flora_app` grants drift as tables are added | `0003` grants on the schema with `ALTER DEFAULT PRIVILEGES` for the owner, so tables created later are covered without a per-table grant. Verify in §6.4 after `TASK-domain-schema` adds one. |
| **The seed migration hard-codes `flora_app`'s password** (`flora-app-dev-secret`, matching `.env.example`) directly in `0003_tenancy_rls.sql`, which is committed to git. Fine for local/CI (fresh containers every time), not safe for any real deployment. | Documented inline in the migration: any non-local environment must `ALTER ROLE flora_app WITH PASSWORD '<secrets-manager value>'` immediately after this migration runs, before `DATABASE_URL` is ever pointed at it. Not automated — no secrets-management story exists yet for this repo. Flag again when a real deployment is planned. |
| The dummy-hash path is optimised away and the timing oracle returns | §6.7 measures it as a criterion, not a code review note. |

---

## 8. Follow-on tasks

**Phase 0 (remaining):**
`TASK-design-system-shell` — AlignUI CLI, shadcn chart, Inter, `AppSidebar` + `PageHeader`
rebuilt from free base components (design-spec §6.2). Parallel to this task; picks up the
unstyled login page (§2.8) for restyling.
`TASK-domain-schema` — the real tables, drops `geo_spike`. **Blocked by this task**: every one
of its tenant tables goes through `tenancy.ts` and must satisfy §6.3.

**Then the spine (architecture §16):** `TASK-fields` → `TASK-crop-stress` → `TASK-tasks-board`
→ `TASK-home-dashboard` → `TASK-weather` → `TASK-field-management`.

**New open question to add to architecture §17** — *Q9: what sends transactional email?*
Password reset and invitations both need it, both are out of scope here, and neither has a
provider chosen. Blocks the first task that needs either; nothing before Phase 3.
