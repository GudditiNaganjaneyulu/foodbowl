# syntax=docker/dockerfile:1

FROM node:20-slim AS base
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
RUN pnpm db:generate
EXPOSE 4000
CMD ["pnpm", "dev"]

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
FROM node:20-slim AS prod
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
