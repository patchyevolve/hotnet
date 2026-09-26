# Stage 1 — build the production bundle.
FROM node:22-alpine AS build

# pnpm 12.6.0 matches the version pinned on the host so the lockfile is read
# by the same resolver.
RUN corepack enable && corepack prepare pnpm@12.6.0 --activate

WORKDIR /repo

# Manifests only, first: this layer is cached until the lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/frontend/package.json src/frontend/package.json

# `--store-dir` points into a BuildKit cache mount so repeated builds do not
# re-download the tarball cache.
RUN --mount=type=cache,id=crimenet-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

# Then the sources, and the actual bundle.
COPY . .
RUN pnpm --dir src/frontend build

# Stage 2 — static assets behind nginx, with /api proxied to the API service.
FROM nginx:1.27-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/src/frontend/dist /usr/share/nginx/html

EXPOSE 80
