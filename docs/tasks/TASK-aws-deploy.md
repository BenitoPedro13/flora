# TASK-aws-deploy

## 1. Current scenario

Flora is live on Railway at `https://flora.up.railway.app` (`TASK-railway-deploy`, 2026-08-17):
six Railway services (`postgres`, `cache`, `storage` = self-hosted MinIO, `api`, `worker`,
`web`), built by Railway's Railpack from GitHub, provisioned by hand (`railway add` / GraphQL),
not by `.railway/railway.ts` (kept only as topology documentation, architecture §14).

What exists that this task builds on or has to undo:

- **No container images.** Railpack built each app; the repo has no `Dockerfile`.
  `infra/docker-compose.yml` runs infra only (Postgres+PostGIS, Redis, MinIO), never the apps.
- **Railway-specific build-time fallbacks** baked into source: `apps/web/next.config.ts`
  falls back to `http://api.railway.internal:3001` during `PHASE_PRODUCTION_BUILD`, and
  `apps/web/lib/seo/site.ts` falls back to `https://flora.up.railway.app`. Both exist only
  because Railpack hid env vars from `next build`.
- **`dotenv -e ../../.env --` wrappers** on every `start`/`start:prod`/seed/migrate script.
- **`packages/raster/src/raster-store.ts` hardcodes `region: "auto"`** — correct for R2/MinIO,
  and [VERIFY: does SigV4 against real AWS S3 reject `region: "auto"`? expected yes — the
  signature's credential scope must name the bucket's real region] almost certainly wrong for
  S3.
- **CI is red and has been since at least `b52ff5a`.** `.github/workflows/ci.yml` runs
  `pnpm --filter @flora/db run spike:roundtrip`, a script removed with `geo_spike` in
  `TASK-domain-schema`; every run since dies there (`ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT`, run
  `32129156754`) before lint/typecheck/test/build execute at all. **Nothing has actually been
  tested in CI since then** — fixing the line may surface real failures behind it.
- There is no CD: Railway auto-deployed from GitHub on its own, with no gate on CI.
- AWS: CLI signed in as `benito-admin`, account `860897618882`, default region `us-east-1`.
  GitHub repo `BenitoPedro13/flora` is **public**.

Decided with the user (2026-10-26):

| Question | Decision |
|---|---|
| Relation to Railway | **Replace.** AWS up and verified, then Railway torn down. |
| Topology | **One EC2 instance running docker compose** (+ S3 for rasters) — not ECS/RDS. |
| Data | **Fresh seed** via the `db:seed:*` scripts — Railway data is not migrated. |
| Domain | **AWS-generated hostname** (CloudFront `*.cloudfront.net`) for now. |
| CI/CD | **Yes** — GitHub Actions builds and deploys on every green push to `main`. |

## 2. Planned changes

### 2.1 Topology

```
browser ──HTTPS──▶ CloudFront (d123.cloudfront.net)
                     ├─ /rasters/*  ──OAC──▶ S3 bucket flora-rasters-<acct> (private)
                     └─ default     ──HTTP:3000──▶ EC2 t3.medium (SG: CloudFront prefix list only)
                                                     docker compose:
                                                       web:3000 ─▶ api:3001
                                                       worker
                                                       db  (postgis/postgis:16-3.4, EBS volume)
                                                       cache (redis:7-alpine, requirepass)
                                                       migrate (one-shot, owner role)
```

- **CloudFront supplies HTTPS for free.** The session cookies are `secure: true`
  (`apps/api/src/auth/cookies.ts`), so plain-HTTP EC2 hosting is not an option. Bare EC2 has no
  TLS hostname; a CloudFront default domain does, and Let's Encrypt can't issue for
  `*.compute.amazonaws.com`. Default behaviour: `CachingDisabled` +
  `AllViewerExceptHostHeader` so cookies, `Origin` (checked by `originCheckMiddleware`) and query
  strings reach Next. `/_next/static/*`: `CachingOptimized`.
- **Rasters move from MinIO to S3**, served by the same distribution at `/rasters/*` through
  Origin Access Control. The bucket stays fully private (Block Public Access on), while
  invariant 2's "permanent public URL from a stored key" still holds:
  `R2_PUBLIC_BASE_URL=https://<dist>.cloudfront.net`, and the existing key format
  `rasters/{org}/{field}/{index}/{date}.png` already has the `rasters/` prefix the path pattern
  routes on. No key or URL-composition change.
- **Instance:** `t3.medium` (2 vCPU, 4 GiB, **$0.0416/h ≈ $30.4/mo** on-demand, AWS Pricing API
  2026-10-26), Amazon Linux 2023, x86_64. The 4 GiB is for Postgres + Redis + three Node
  processes; images are built in CI, never on the box, so `next build`'s memory peak doesn't
  count. 30 GiB gp3 root volume. With the public IPv4 charge and a few GB of S3/ECR/snapshots,
  the expected total is **~$37–40/mo** [VERIFY: confirm against the first month's Cost Explorer].
- **Access: SSM Session Manager only.** No SSH key, port 22 closed. The instance role gets
  `AmazonSSMManagedInstanceCore`, ECR pull, read on `/flora/prod/*` in Parameter Store, and
  write on the raster bucket.
- **Backups:** a Data Lifecycle Manager policy takes a daily EBS snapshot of the volume holding
  Postgres's data, keeping 7. Recovery means restoring the volume, not running a `pg_dump`
  pipeline; that's the trade-off the single-instance choice accepts.

### 2.2 Rejected alternatives

- **`t4g.medium` (Graviton, $0.0336/h, ~$7/mo cheaper).** It needs arm64 images: either GitHub's
  arm runners or QEMU builds (slow), plus the `imresamu/postgis` arm build instead of the
  official image CI tests against. Not worth $7.
- **Caddy/nginx + Let's Encrypt on an Elastic IP.** Needs a hostname we own (out of scope).
  CloudFront also gives the S3 path for free.
- **Self-hosted MinIO on the box (mirroring local).** Rasters would live only on the one EBS
  volume. S3 costs cents at this size and removes a service.
- **Instance-role credentials for S3** instead of static keys. Cleaner, but
  `packages/config/src/env.ts` requires non-empty `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` and
  `raster-store.ts` passes them explicitly. Keeping static keys (a dedicated IAM user scoped to
  the one bucket, keys in Parameter Store) needs no code change. Recorded as a follow-up.
- **Pushing images to GHCR.** ECR plus instance-role pull avoids a registry token on the box.

### 2.3 Infrastructure as code — `infra/aws/` (CDK, TypeScript)

Scaffolded with `npx aws-cdk init app --language typescript` (CLAUDE.md §2), then trimmed into
the pnpm workspace (`pnpm-workspace.yaml` gains `infra/aws`). One stack, `FloraProd`:

- VPC: the default VPC (one public subnet is all one instance needs; no NAT gateway, which
  would cost more than the instance).
- EC2 instance + role + security group (ingress 3000 from
  `com.amazonaws.global.cloudfront.origin-facing` only) [VERIFY: the managed prefix list's
  weight against the SG's default rule quota — AWS documents it as counting as multiple rules].
- User data: installs Docker + the compose plugin, writes `/opt/flora/` (compose file, deploy
  script). No secrets in user data.
- ECR repositories `flora/web`, `flora/api`, `flora/worker` with a lifecycle rule (keep 10).
- S3 bucket + OAC + CloudFront distribution (two behaviours, §2.1).
- IAM user `flora-raster-writer` (PutObject on `rasters/*` only), keys written to SSM.
- GitHub OIDC provider + role `flora-github-deploy`, trust restricted to
  `repo:BenitoPedro13/flora:ref:refs/heads/main` and the `production` environment.
  Permissions: ECR push to the three repos and `ssm:SendCommand` on this one instance with
  `AWS-RunShellScript`. No long-lived AWS keys in GitHub.
- DLM snapshot policy.

Secrets (`JWT_SIGNING_KEY`, `POSTGRES_PASSWORD`, the rotated `flora_app` password,
`REDIS_PASSWORD`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `CDSE_CLIENT_*`) are SecureString parameters
under `/flora/prod/`, set once via `aws ssm put-parameter`, never in CDK source or git.
The CDK stack itself is deployed by hand (`pnpm --filter @flora/infra-aws exec cdk deploy`) —
infra changes are rare and shouldn't ride every app push.

### 2.4 Container images

- **`apps/{web,api,worker}/Dockerfile`** (new): multi-stage, `node:24-slim`. The prune stage
  uses `turbo prune <app> --docker` (Turborepo's documented Docker recipe [VERIFY against
  turbo 2.10 docs]), the build stage runs `pnpm install --frozen-lockfile` and
  `turbo run build --filter=<app>`, and the runtime stage is pruned `node_modules` + `dist` /
  `.next`.
- `web` is built with `--build-arg API_URL=http://api:3001` and
  `--build-arg WEB_ORIGIN=https://<dist>.cloudfront.net` (from a GitHub environment variable).
  Because Docker exposes build args to `next build`, **both Railway fallbacks are deleted**:
  `next.config.ts` goes back to a plain `API_URL` read that throws when missing, and `site.ts`
  goes back to a hard failure when `WEB_ORIGIN` is unset. A comment records why build-time
  env is now guaranteed.
- `next.config.ts` gains `output: "standalone"` [VERIFY: Next 16 standalone with pnpm workspaces
  — `outputFileTracingRoot` must point at the repo root]. It shrinks the web image from full
  `node_modules` to the traced subset.
- The `api` image also carries `packages/db`'s migrations + `tsx` so it doubles as the
  `migrate` / seed one-shot. No fourth image.
- **`.dockerignore`** (new, repo root).

### 2.5 Scripts without `dotenv`

Add `start:container` to `apps/api` and `apps/worker` (`node dist/src/main`) and use
`next start` / `node server.js` (standalone) for web, all without the wrapper, because compose
injects env through `env_file`. The existing `dotenv` scripts stay for local dev. Migrate and seed
run as `tsx src/<script>.ts` directly in the container rather than through the
`dotenv`-wrapped package scripts [VERIFY: dotenv-cli's behaviour on a missing `-e` file —
if it silently continues, the wrapped scripts would work too, but direct `tsx` doesn't depend on
it].

### 2.6 Production compose — `infra/aws/compose/docker-compose.prod.yml` (new)

`db` (`postgis/postgis:16-3.4`, healthcheck, named volume), `cache` (`redis:7-alpine
--requirepass`, appendonly), `migrate` (api image, `profiles: [ops]`), `api`, `worker`, `web`
(images `${ECR}/flora/<app>:${IMAGE_TAG}`, `restart: unless-stopped`, `depends_on` healthy db and
cache). Only `web:3000` is published to the host, and Postgres/Redis never leave the compose
network.

`infra/aws/compose/deploy.sh <sha>` (new, runs on the instance via SSM):
render `/opt/flora/.env` from `aws ssm get-parameters-by-path /flora/prod --with-decryption`
(mode 600) → ECR login → `IMAGE_TAG=<sha> docker compose pull` → `docker compose run --rm migrate`
(abort on non-zero) → `docker compose up -d` → poll `http://localhost:3000/api/v1/ready` for
≤ 90 s → exit non-zero (fails the workflow) if it never goes ready. Writes the deployed sha to
`/opt/flora/DEPLOYED`.

### 2.7 Code fix — S3 region

`raster-store.ts`: `region: config.region ?? "auto"`, add optional `S3_REGION` to
`packages/config/src/env.ts` and `.env.example`. R2/MinIO behaviour is unchanged. Prod sets
`S3_REGION=us-east-1`, `S3_ENDPOINT=https://s3.us-east-1.amazonaws.com` (path-style stays valid
on S3 [VERIFY: path-style is deprecated for *new* buckets? — check S3's current path-style
policy; if refused, flip `forcePathStyle` off when `S3_REGION` is set]).

### 2.8 CI/CD — `.github/workflows/`

- **`ci.yml` (edit):** delete the dead `spike:roundtrip` step. Then run CI and **fix whatever
  real failures it was hiding**; each one gets recorded in §6 below. CD gates on this, so it
  has to be green honestly, never by skipping steps.
- **`deploy.yml` (new):**
  - Trigger: `workflow_run` of `CI` completed on `main` with `conclusion == success`, plus
    `workflow_dispatch` with an optional `sha` input. Redeploying an old sha is the rollback.
  - `environment: production` (holds `WEB_ORIGIN`, `AWS_ROLE_ARN`, `INSTANCE_ID`, the
    distribution domain; no secrets beyond what OIDC gives).
  - Jobs: `build` (matrix web/api/worker; `aws-actions/configure-aws-credentials` via OIDC →
    `aws-actions/amazon-ecr-login` → `docker/build-push-action` tagged `<sha>`, GHA layer
    cache) → `deploy` (`aws ssm send-command` → `deploy.sh <sha>`, wait, print the command's
    stdout/stderr into the job log) → `smoke` (`curl -f https://<dist>/api/v1/health` and
    `/api/v1/ready` through CloudFront, plus `/` returning 200).
  - `concurrency: deploy-production`, `cancel-in-progress: false`, so two pushes never deploy
    at once.
- Pin every action to a major that exists [VERIFY each action's current major on its repo
  before writing it].

### 2.9 Seed, cut-over and teardown

1. `cdk deploy` → put parameters → first `deploy.yml` run via `workflow_dispatch`.
2. One-off via SSM: `migrate`, then rotate `flora_app` off migration `0003`'s dev password
   (`ALTER ROLE`, as in `TASK-railway-deploy`), then `seed:demo`, `seed:satellite` (writes
   real PNGs to S3, so it exercises §2.7 and the OAC path end to end), `seed:rollups` and
   `seed:weather`.
3. Verify (§5).
4. **Railway teardown needs your explicit go-ahead at that moment** (it's destructive and can't
   be undone): delete the Railway project, remove the `railway` devDependency and
   `.railway/railway.ts`, and rewrite architecture §14.

### 2.11 Stop/start (added 2026-10-26, user's call)

Stopped, the instance bills only its disk and Elastic IP (~$7/mo vs ~$22 running). The root
`package.json` has `infra:aws:start` / `:stop` / `:status`. The stack defines two EventBridge
Scheduler schedules (universal target `aws-sdk:ec2:startInstances`/`stopInstances`, no Lambda),
08:00 start / 00:00 stop America/Sao_Paulo, **disabled by default** and toggled with
`"flora:schedule".enabled` in `infra/aws/cdk.json`. The value is committed rather than passed
with `-c`, so a plain `cdk deploy` can't flip it. The Elastic IP is kept (dropping it saves
$3.65/mo, but the origin hostname would change on every start).

Kubernetes (EKS: ~$73/mo for the control plane alone) and a scale-to-zero serverless rewrite
(Aurora Serverless v2 + Lambda; the worker/BullMQ/Redis design assumes always-on processes) were
both rejected as more expensive or a re-architecture.

### 2.10 Documentation

`docs/architecture.md` §14 (rewrite the deployment table for AWS and drop the Railpack caveat
row, which no longer applies), `CLAUDE.md` (status paragraph, stack table: object storage
`S3`, plus a deploy line), `README.md` (live URL, how deploys work, how to roll back),
`infra/README.md` (CDK bootstrap/deploy, SSM session, parameters), `.env.example`
(`S3_REGION`; a note that prod values live in Parameter Store `/flora/prod/`).
`TASK-railway-deploy.md` gets a one-line "superseded by `TASK-aws-deploy`" header.

## 2.12 What changed during implementation

Recorded as it happened. The plan sections above are left as written; this list is what
actually shipped.

1. **`t3.small`, not `t3.medium`.** The first `cdk deploy` failed: the account is on AWS's
   **Free plan** (`aws freetier get-account-plan-state`: $113.81 credits, expiry 2027-03-27),
   which only launches Free Tier eligible types. You chose to stay on the Free plan with a
   `t3.small` ($0.0208/h). To fit 2 GiB, user data adds 2 GiB of swap, and the compose file
   caps Postgres (`shared_buffers=128MB`, `max_connections=40`), Redis (`maxmemory 96mb`,
   `noeviction`) and each Node heap (`--max-old-space-size` 320/320/512).
2. **No `output: "standalone"`.** The traced server crash-looped in the local rehearsal
   (`@swc/helpers` missing under pnpm's symlinked `node_modules`). The web image runs
   `next start` from the pruned workspace like api/worker do. Images are ~1.1 GB because they
   carry dev dependencies (`tsx` for the `migrate`/seed one-shot). Slimming is a follow-up.
3. **One root `Dockerfile` with three targets** instead of three Dockerfiles: one prune/install
   stage, no duplication. No `start:container` scripts either; each target's `CMD` calls `node`
   directly, so §2.5's package.json edits weren't needed.
4. **`turbo.json` `build.env` declares `API_URL`, `WEB_ORIGIN`, `NEXT_PUBLIC_MAPBOX_TOKEN`.**
   Turbo 2's strict env mode drops undeclared variables from a task's environment. The Mapbox
   token turned out to need a build arg too (read in client components, so inlined at build).
5. **`deploy.sh` composes the connection URLs** from three password parameters
   (`POSTGRES_PASSWORD`, `FLORA_APP_PASSWORD`, `REDIS_PASSWORD`) and re-runs
   `ALTER ROLE flora_app PASSWORD …` after every migrate. That automates
   `TASK-railway-deploy`'s one-time manual rotation and makes it idempotent. Parameters are read
   by name, never `source`d (a secret may contain shell metacharacters).
6. **The compose files reach the box through S3** (a `DeployArtifacts` bucket, 30-day expiry).
   The workflow uploads `infra/aws/compose/` for each sha and the SSM command copies it to
   `/opt/flora/`, so the compose file and `deploy.sh` ship with the commit that changed them.
7. **The account already had GitHub's OIDC provider**, so it's imported, not created. CDK had
   never been bootstrapped in `us-east-1`; that's done now.
8. **Rasters are same-origin now** (CloudFront serves both the app and `/rasters/*`), so the
   MinIO-era question of CORS on raster PNGs no longer exists.
9. **Seed order:** `seed` (org + owner) must run before `seed-demo`. The README already said so;
   the first rehearsal got it wrong.

## 3. Why

You asked to move Flora to AWS and to have CI/CD. The single-instance shape was your call over
ECS+RDS, trading redundancy and managed backups for roughly a third of the cost. The design
spends its few extra pieces where that trade actually bites:

- CloudFront, because the cookies require HTTPS.
- S3, so rasters don't live on the one disk.
- DLM snapshots, so the database isn't backup-less.
- SSM + OIDC, so there's no SSH key or AWS secret to leak.

Building images in CI also kills the class of bug `TASK-railway-deploy` §6.2 kept hitting:
env vars invisible at build time.

## 4. Affected files

| Path | Change | Notes |
|---|---|---|
| `infra/aws/` (bin, lib, cdk.json, package.json, tsconfig) | new | CDK app, `FloraProd` stack |
| `infra/aws/compose/docker-compose.prod.yml` | new | prod compose |
| `infra/aws/compose/deploy.sh` | new | on-instance deploy, run via SSM |
| `apps/web/Dockerfile`, `apps/api/Dockerfile`, `apps/worker/Dockerfile` | new | turbo-prune multi-stage |
| `.dockerignore` | new | |
| `apps/web/next.config.ts` | edit | drop Railway fallback, `output: "standalone"` |
| `apps/web/lib/seo/site.ts` | edit | drop Railway fallback |
| `apps/api/package.json`, `apps/worker/package.json` | edit | `start:container` |
| `packages/raster/src/raster-store.ts` | edit | configurable region |
| `packages/config/src/env.ts` | edit | optional `S3_REGION` |
| `apps/worker/…`, `packages/db/src/seed-satellite.ts` | edit | pass `S3_REGION` through to `createRasterStore` |
| `.github/workflows/ci.yml` | edit | remove dead step, fix what it hid |
| `.github/workflows/deploy.yml` | new | build → push → SSM deploy → smoke |
| `pnpm-workspace.yaml` | edit | add `infra/aws` |
| `package.json` | edit | drop `railway` devDep (at teardown) |
| `.railway/railway.ts` | removal | at teardown |
| `docs/architecture.md`, `CLAUDE.md`, `README.md`, `infra/README.md`, `.env.example`, `docs/tasks/TASK-railway-deploy.md` | edit | §2.10 |

## 5. Out of scope

- Custom domain / Route 53 / ACM (a later CloudFront alias + cert, with no topology change).
- Migrating Railway's data (fresh seed, your call).
- High availability, autoscaling, RDS/ElastiCache. Revisit by re-opening §2.1, not by drift.
- CDK deploys from CI (infra stays a manual `cdk deploy`).
- Observability beyond `/health` and `/ready` and CloudWatch's default instance metrics (Sentry and
  structured logs stay open, as on Railway). Docker's `awslogs` driver to CloudWatch Logs is a
  cheap follow-up worth doing next.
- Turning on `SATELLITE_/ROLLUP_/WEATHER_SCHEDULE_ENABLED` (stay `false`, same as Railway).
- Instance-role S3 credentials (§2.2).

## 6. Verification

### 6.0 Failures the dead CI step was hiding (all fixed in `c1872ce`)

Running lint/typecheck/test/build for the first time since August surfaced four things. Two of
them were real product bugs:

1. **Login brute-force throttling was off in production.** `b2b9e86` (2026-08-16) commented out
   `AuthThrottlerGuard` on `/auth/login` and `/auth/refresh`. The likely reason: the API trusts
   no forwarded headers and sits behind `apps/web`'s proxy, so `req.ip` is the proxy's.
   Refresh's IP-only key was therefore one 5-per-15-min bucket shared by every user, which
   `SessionRefresher`'s 10-minute renewals exhaust. Your call: re-enable on **login only**,
   where it's now effectively per email. `/auth/refresh` stays unthrottled by design (a 256-bit
   rotating secret with reuse detection).
2. **`plantingProductivity` double-counted a field harvested and replanted in the same month.**
   A crop's share went past 100%, failing `DashboardSchema`'s own validation, which would 500
   `GET /farms/:id/dashboard` on a rollup miss. With the demo seed it only shows after about
   the 20th of the month (the "harvested 20 days ago" cycle then lands in the current month),
   which is why it passed in mid-August. The earlier fix (spacing the seed's offsets) fixed the
   seed, not the query. Each (month, field) is now attributed to the one cycle covering most of
   the month (`DISTINCT ON`), so a field can't count twice and totals stay ≤ 100%. There's a new
   regression test in `rollups.spec.ts`.
3. `stress-zones.spec.ts` hardcoded `detectedOn: "2026-08-10"` and asserted `isNew`, so it was
   bound to start failing a week later. Its dates are now relative to today.
4. NFR-4's `grep "@flora/weather" apps/api/src` matched a *comment* saying the package must not
   be imported. The comment was reworded. Plus two `prefer-const` lint errors.

Locally, running every package's testcontainers suite in parallel can time out container
startup (60 s hooks) on Docker Desktop. Each suite passes run alone. Watch for it in CI, but
it's not a code fault.

1. `cdk synth` is clean; `cdk diff` before the first deploy lists only the resources in §2.3.
2. CI on `main` is green with **lint, typecheck, test and build all actually executing**: the
   job log shows each turbo task ran, nothing skipped. Any failure the dead step was hiding
   is listed here with its fix.
3. A push to `main` with green CI triggers `deploy.yml` with no manual step. All three images
   land in ECR tagged with the commit sha, and `/opt/flora/DEPLOYED` on the instance equals that
   sha.
4. A deliberately broken deploy fails the workflow at `deploy.sh`'s readiness poll (or the smoke
   job), not silently: tested once with a bad image tag on `workflow_dispatch`. A rollback via
   `workflow_dispatch sha=<previous>` restores `/api/v1/ready` = 200.
5. `curl -f https://<dist>.cloudfront.net/api/v1/health` and `/api/v1/ready` return 200, and
   `curl -I http://<instance-public-ip>:3000` **times out** (SG allows CloudFront only).
6. `aws s3api get-public-access-block` shows all four blocks `true`, yet a seeded raster's
   URL from `GET /api/v1/fields/:id/observations` loads through CloudFront (200, `image/png`).
7. `psql` (via SSM + `docker compose exec db`): full schema migrated, `flora_app` has
   `rolsuper = false, rolbypassrls = false`, and its password is not `flora-app-dev-secret`.
   Seed row counts are non-zero for `farms`, `fields`, `crops`, `observations`, `stress_zones`,
   `tasks`, `farm_daily_rollups` and `weather_snapshots`.
8. Browser, against the CloudFront URL: log in (no 403 from the origin check), `/` dashboard,
   `/fields` with the Mapbox map, `/fields/[id]/stress` with a raster overlay, and the tasks board.
   View-source on `/` shows og:url/canonical on the CloudFront domain, not `railway.app`.
9. After teardown, `grep -rn "railway.app\|railway.internal" apps packages` returns nothing
   (comments citing `TASK-railway-deploy` by name stay; they're history).
10. A DLM snapshot exists within 24 h of deploy.
