# Production on AWS

One EC2 instance running docker compose, behind CloudFront. Planned and recorded in
[`docs/tasks/TASK-aws-deploy.md`](../../docs/tasks/TASK-aws-deploy.md).

```
browser ──HTTPS──▶ CloudFront  https://d2pfmd74quf6lo.cloudfront.net
                     ├─ /rasters/*  ──OAC──▶ S3 (private)
                     └─ default     ──HTTP:3000──▶ EC2 t3.small  (SG: CloudFront only)
                                                     web ─▶ api, worker, db (PostGIS), cache (Redis)
```

| What | Where |
|---|---|
| Infrastructure | `lib/flora-prod-stack.ts` (CDK), stack `FloraProd`, `us-east-1`, account `860897618882` |
| Runtime | `compose/docker-compose.prod.yml` + `compose/deploy.sh`, installed at `/opt/flora/` on the box |
| Images | ECR `flora/{web,api,worker}`, tagged by git sha, built by `.github/workflows/deploy.yml` |
| Config + secrets | SSM Parameter Store `/flora/prod/*`. `deploy.sh` renders `/opt/flora/.env` from it on every deploy |
| Backups | DLM: daily EBS snapshot at 05:00 UTC, keep 7 |

## Cost

The account is on AWS's **Free plan**, so EC2 only launches Free Tier eligible types. That's why
this is a `t3.small` (2 GiB plus 2 GiB swap, with every service memory-capped in the compose
file), not a `t3.medium`. Estimates for us-east-1, rounded:

| | Running 24/7 | Stopped |
|---|---|---|
| EC2 t3.small ($0.0208/h) | $15.20 | $0 |
| 30 GB gp3 + Elastic IP | $6.05 | $6.05 |
| Snapshots, ECR, S3 | ~$1 | ~$1 |
| **Total** | **~$22/mo** | **~$7/mo** |

The Free plan's credits and its expiry date (2027-03-27) are a hard end date for the account
unless it's upgraded to a paid plan. Check the remaining credits with
`aws freetier get-account-plan-state`.

## Deploys

- **Automatic:** every push to `main` whose CI run passes builds the three images, pushes them to
  ECR, and runs `deploy.sh <sha>` on the instance over SSM. That pulls the images, runs migrations
  (`migrate`, the owner role), re-asserts `flora_app`'s password, `up -d`, and waits for
  `/api/v1/ready`. The workflow then smoke-tests through CloudFront.
- **Rollback:** Actions → Deploy → *Run workflow* with an older commit's `sha`. Images still in
  ECR (the last 10) are redeployed without a rebuild.
- **Infrastructure changes** are deployed by hand, never by CI:

  ```bash
  cd infra/aws
  pnpm exec cdk diff FloraProd     # always diff first
  pnpm exec cdk deploy FloraProd
  ```

## Stop / start

```bash
pnpm infra:aws:stop     # ~$0.02/h saved while stopped; CloudFront serves an error page
pnpm infra:aws:start    # docker's restart policy brings the stack back by itself
pnpm infra:aws:status
```

A daily window (08:00–00:00 America/Sao_Paulo) is defined in the stack but **disabled**. To turn
it on, set `"flora:schedule".enabled` to `true` in `cdk.json` and `cdk deploy`.

## On the box

```bash
aws ssm start-session --target i-0e68c5766c8828c20          # no SSH; port 22 is closed
sudo -i && cd /opt/flora
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml exec db psql -U flora -d flora
```

Seeding a fresh database (`migrate` doubles as the one-shot tooling container):

```bash
for s in seed seed-demo seed-satellite seed-rollups seed-weather; do
  docker compose -f docker-compose.prod.yml run --rm migrate node_modules/.bin/tsx src/$s.ts
done
```

## Parameters

Everything under `/flora/prod/` becomes an environment variable. `deploy.sh` adds
`DATABASE_URL`, `DATABASE_MIGRATION_URL` and `REDIS_URL`, composed from the password
parameters, plus `REGISTRY`/`IMAGE_TAG`. Changing a value:

```bash
aws ssm put-parameter --name /flora/prod/<NAME> --type SecureString --value '…' --overwrite
# then redeploy (Actions → Deploy → Run workflow) so the box re-renders .env
```

`NEXT_PUBLIC_MAPBOX_TOKEN` and `WEB_ORIGIN` are also inlined into the web bundle at **build**
time, from the GitHub `production` environment's variables. Change them there as well.
