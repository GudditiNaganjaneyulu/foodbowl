# syntax=docker/dockerfile:1
#
# Build from the repo root:
#   docker build -f apps/web/Dockerfile -t foodbowl-web \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
#     --build-arg NEXT_PUBLIC_SOCKET_URL=https://api.example.com .

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Manifests first so the install layer is cached until dependencies change.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @foodbowl/web...

# NEXT_PUBLIC_* values are inlined into the browser bundle at build time, so
# they must be build args — setting them at `docker run` does nothing. Declared
# after the install so changing them doesn't invalidate the install layer, and
# with defaults because an empty value (unlike an unset one) would bypass the
# fallback in lib/api-client.ts and break every API call.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @foodbowl/web build

FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
# Standalone output keeps the app's own path (apps/web/) under the root
# because of outputFileTracingRoot in next.config.mjs. Static assets and
# public/ are not part of it and must be copied in separately.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
