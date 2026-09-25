# syntax=docker/dockerfile:1
#
# Build from the repo root (the API depends on packages/shared and the root
# lockfile):   docker build -f apps/api/Dockerfile -t foodbowl-api .

FROM node:22-slim AS base
# node:22-slim ships no OpenSSL; Prisma's engine detection needs it at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Manifests first so the install layer is cached until dependencies change.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @foodbowl/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
# Production-only, self-contained copy of the API (shared package included).
RUN pnpm --filter @foodbowl/api deploy --prod /out
# The generated Prisma client lives inside node_modules, so it has to be
# generated in the deployed copy that actually ships.
WORKDIR /out
RUN node_modules/.bin/prisma generate

FROM node:22-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4000
# Run tsx directly instead of `pnpm start`: no pnpm/corepack in this image.
CMD ["node_modules/.bin/tsx", "src/server.ts"]
