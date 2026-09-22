# syntax=docker/dockerfile:1

FROM node:20-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --filter @foodbowl/web...

FROM deps AS dev
COPY packages/shared packages/shared
COPY apps/web apps/web
WORKDIR /repo/apps/web
EXPOSE 3000
# node_modules is a named volume (see docker-compose.yml) so the container's
# own Linux-native install stays separate from the host's (macOS) one — but
# that means it's EMPTY on first container start (a named volume mounted
# inside an already bind-mounted parent directory doesn't reliably inherit
# the image's baked-in contents, which is why `next` itself went missing at
# runtime despite the image building successfully). Re-running install here
# is fast — the pnpm store from the `deps` stage build is already warm.
CMD ["sh", "-c", "pnpm install --filter @foodbowl/web... && pnpm dev"]

FROM deps AS build
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, not
# read at container startup — they have to arrive as build args (see
# infra/docker-compose.prod.yml, which passes them from the root .env) rather
# than as plain `environment:` entries on the prod service.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
COPY packages/shared packages/shared
COPY apps/web apps/web
WORKDIR /repo/apps/web
RUN pnpm build

FROM node:20-slim AS prod
RUN corepack enable
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared ./packages/shared
COPY --from=build /repo/apps/web/node_modules ./apps/web/node_modules
COPY --from=build /repo/apps/web/.next ./apps/web/.next
COPY --from=build /repo/apps/web/public ./apps/web/public
COPY --from=build /repo/apps/web/package.json ./apps/web/package.json
COPY --from=build /repo/apps/web/next.config.mjs ./apps/web/next.config.mjs
WORKDIR /repo/apps/web
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
