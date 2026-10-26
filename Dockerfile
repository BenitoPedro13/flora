# One Dockerfile, three targets — web, api, worker (TASK-aws-deploy §2.4).
# Built in CI (.github/workflows/deploy.yml), never on the EC2 instance:
#   docker build --target <app> --build-arg APP=<app> [--build-arg API_URL=… WEB_ORIGIN=… NEXT_PUBLIC_MAPBOX_TOKEN=…] .
# `turbo prune --docker` cuts the workspace down to <app> and its internal
# dependencies, so each image installs only what that app needs.

FROM node:24-slim AS base
RUN npm install -g pnpm@11.21.0 turbo@2.10.10
WORKDIR /app

FROM base AS prune
ARG APP
COPY . .
RUN turbo prune ${APP} --docker

FROM base AS build
ARG APP
# Manifests + lockfile first, so the install layer is cached until a
# dependency actually changes.
COPY --from=prune /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=prune /app/out/full/ .
# Only apps/web reads these at build time (next.config.ts rewrites, static
# metadata, inlined NEXT_PUBLIC_*); harmless empties for api/worker.
ARG API_URL
ARG WEB_ORIGIN
ARG NEXT_PUBLIC_MAPBOX_TOKEN
ENV API_URL=${API_URL} WEB_ORIGIN=${WEB_ORIGIN} NEXT_PUBLIC_MAPBOX_TOKEN=${NEXT_PUBLIC_MAPBOX_TOKEN}
RUN turbo run build --filter=${APP}

# apps/web — `next start` from the pruned, built workspace. Not Next's
# `output: "standalone"`: its file tracer misses packages under pnpm's
# symlinked node_modules (@swc/helpers, found in the TASK-aws-deploy
# rehearsal), and a crash-looping web container is a worse trade than a
# bigger image.
FROM base AS web
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app ./
WORKDIR /app/apps/web
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]

# apps/api and apps/worker — the pruned, built workspace. The api image also
# carries packages/db's migrations and tsx, so it doubles as the one-shot
# `migrate`/seed container (infra/aws/compose/docker-compose.prod.yml).
FROM base AS service
ARG APP
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app ./
WORKDIR /app/apps/${APP}
USER node
CMD ["node", "dist/src/main.js"]

FROM service AS api
EXPOSE 3001

FROM service AS worker
