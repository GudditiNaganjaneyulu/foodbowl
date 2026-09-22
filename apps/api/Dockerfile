# syntax=docker/dockerfile:1

FROM node:20-slim AS base
# node:20-slim ships no OpenSSL at all, so Prisma's runtime libssl detection
# finds nothing and silently guesses wrong (defaults to openssl-1.1.x, which
# doesn't exist here either) — it fails at query time with
# "libssl.so.1.1: cannot open shared object file", not at build time, so this
# is easy to miss until something actually hits the database. Installing
# openssl gives Prisma real OpenSSL 3.x to detect and match its engine to.
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @foodbowl/api... 2>/dev/null || pnpm install --filter @foodbowl/api...

FROM deps AS dev
COPY packages/shared packages/shared
COPY apps/api apps/api
WORKDIR /repo/apps/api
EXPOSE 4000
# node_modules is a named volume (see docker-compose.yml) so the container's
# own Linux-native install stays separate from the host's (macOS) one — but
# that means it's EMPTY on first container start (a named volume mounted
# inside an already bind-mounted parent directory doesn't reliably inherit
# the image's baked-in contents). Re-running install here is fast (the pnpm
# store from the `deps` stage build is already warm, no network fetch needed)
# and also regenerates the Prisma Client, which lives inside node_modules and
# would otherwise vanish along with everything else in that empty volume.
CMD ["sh", "-c", "pnpm install --filter @foodbowl/api... && pnpm db:generate && pnpm dev"]

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
WORKDIR /repo/apps/api
RUN pnpm db:generate && pnpm typecheck

# Runs via tsx directly rather than a tsc+node dist build: our relative
# imports are written without file extensions (the common TS style), which
# Node's native ESM loader can't resolve on its own. tsx's loader handles
# that at runtime in both dev and here, so behavior stays identical between
# environments instead of only being tested via the dev target.
# (Tracing is bootstrapped by `import './lib/tracing'` as the first line of
# server.ts, not a CLI --import flag — see that file for why.)
FROM node:20-slim AS prod
# Same libssl gap as the base stage — this is a fresh FROM, so it needs its
# own openssl install rather than inheriting the base stage's.
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared ./packages/shared
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/src ./apps/api/src
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
WORKDIR /repo/apps/api
ENV NODE_ENV=production
EXPOSE 4000
CMD ["pnpm", "start"]
