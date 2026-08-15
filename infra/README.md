# Local infrastructure

PostGIS, Redis, and a MinIO stand-in for Cloudflare R2. All three run via
`docker-compose.yml`; the root `package.json` wraps the common commands.

## Start / stop / reset

```bash
pnpm infra:up      # start db, cache, storage (+ create the flora-rasters bucket)
pnpm infra:down    # stop, keep volumes
pnpm infra:reset   # stop and wipe volumes, then start clean
pnpm infra:logs    # follow logs for all three services
```

Or call `docker compose -f infra/docker-compose.yml <cmd>` directly.

## Inspect

```bash
# PostGIS is loaded and the version matches 3.4.x
pnpm infra:psql -c "SELECT PostGIS_Version();"

# Redis
pnpm infra:redis-cli ping

# MinIO console (bucket: flora-rasters)
open http://localhost:9001   # user: flora / password: flora-dev-secret
```

## The `db` image

`infra/docker-compose.yml` uses `imresamu/postgis:16-3.4`, **not** the official
`postgis/postgis:16-3.4`. Verified 2026-08-15 on Apple Silicon (darwin
25.2.0/arm64): `docker image inspect postgis/postgis:16-3.4` reports
`amd64/linux` — no arm64 image is published for that tag, so it would run
under Rosetta emulation. `imresamu/postgis:16-3.4` is a real arm64 build on
the same PostGIS 3.4 base and is what local dev actually runs against.

CI (`.github/workflows/ci.yml`) runs on amd64 GitHub-hosted runners, so it
uses the official `postgis/postgis:16-3.4` image directly — the two
environments intentionally use different images for the same PostGIS
version. See architecture.md §5.2.

## First-time setup

```bash
pnpm setup   # install deps, start infra, run migrations
```
