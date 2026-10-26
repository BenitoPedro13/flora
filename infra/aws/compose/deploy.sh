#!/usr/bin/env bash
# Deploys one image tag on the EC2 instance (TASK-aws-deploy §2.6). Run by
# .github/workflows/deploy.yml through SSM Run Command, as root, from
# /opt/flora — or by hand in an SSM session for a rollback:
#   sudo /opt/flora/deploy.sh <git-sha>
set -euo pipefail

TAG="${1:?usage: deploy.sh <image-tag>}"
cd /opt/flora

REGION="$(cat REGION)"
REGISTRY="$(cat REGISTRY)"

# Render .env from Parameter Store — every /flora/prod/<NAME> becomes NAME=value.
# Values are generated/hex or URLs (no quoting needed); mode 600, root-owned.
umask 077
aws ssm get-parameters-by-path --region "$REGION" --path /flora/prod/ \
  --with-decryption --recursive --query 'Parameters[].[Name,Value]' --output text \
  | awk -F'\t' '{ sub("^/flora/prod/", "", $1); print $1 "=" $2 }' > .env.next
# Connection URLs are composed here from the password parameters, so each
# password lives in exactly one parameter.
# Read by name, never `source`d — a secret may contain shell metacharacters.
param() { grep -m1 "^$1=" .env.next | cut -d= -f2-; }
FLORA_APP_PASSWORD="$(param FLORA_APP_PASSWORD)"
POSTGRES_PASSWORD="$(param POSTGRES_PASSWORD)"
REDIS_PASSWORD="$(param REDIS_PASSWORD)"
{
  echo "DATABASE_URL=postgresql://flora_app:${FLORA_APP_PASSWORD:?}@db:5432/flora"
  echo "DATABASE_MIGRATION_URL=postgresql://flora:${POSTGRES_PASSWORD:?}@db:5432/flora"
  echo "REDIS_URL=redis://default:${REDIS_PASSWORD:?}@cache:6379"
  echo "REGISTRY=$REGISTRY"
  echo "IMAGE_TAG=$TAG"
} >> .env.next
mv .env.next .env

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null

compose=(docker compose -f docker-compose.prod.yml)
"${compose[@]}" pull --quiet api worker web
"${compose[@]}" --profile ops pull --quiet migrate
"${compose[@]}" up -d --wait db cache
"${compose[@]}" run --rm migrate
# Migration 0003 creates flora_app with a dev placeholder password; re-assert
# the real one every deploy (idempotent) so the role can never be left on it
# (architecture §14, TASK-railway-deploy §6.1's manual rotation, automated).
"${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U flora -d flora -q \
  -c "ALTER ROLE flora_app PASSWORD '${FLORA_APP_PASSWORD}'"
"${compose[@]}" up -d --remove-orphans

# /ready checks Postgres + Redis through the api, reached via web's proxy —
# the same path a browser takes, minus CloudFront.
for _ in $(seq 1 45); do
  if curl -fsS http://localhost:3000/api/v1/ready >/dev/null; then
    echo "$TAG" > DEPLOYED
    docker image prune -af --filter "until=168h" >/dev/null || true
    echo "deployed $TAG"
    exit 0
  fi
  sleep 2
done

echo "deploy $TAG: /api/v1/ready never returned 200 within 90s" >&2
"${compose[@]}" ps >&2
"${compose[@]}" logs --tail 50 api web >&2
exit 1
