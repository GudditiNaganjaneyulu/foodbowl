# FoodBowl 🍔

A single-restaurant food-ordering platform (Swiggy/Zomato-style UX, one restaurant) — built as a learning/testing project. See [BUILD_PROMPT.md](./BUILD_PROMPT.md) for the full spec this repo is built from (architecture, RBAC model, DB schema, API surface, build order).

## Status

Milestone 1–2 scaffolding is in place:

- ✅ Monorepo structure (`apps/api`, `apps/web`, `packages/shared`)
- ✅ Prisma schema (full RBAC + menu + order + delivery + notification model)
- ✅ Auth (register/login/refresh/logout, JWT access + rotated refresh tokens)
- ✅ RBAC (`role.rolePermissions` + `user.userPermissions` overrides, `requirePermission` guard)
- ✅ **User Management UI** — `/admin/users`: add/deactivate users, assign roles, grant/revoke staff permissions (owner-only, see BUILD_PROMPT.md §3.4)
- ✅ Public menu browse (read API + themed storefront UI)
- ✅ OpenTelemetry tracing + pino logging bootstrap, local Jaeger for viewing traces
- ✅ Theme architecture — CSS-variable design tokens, light/dark mode, responsive storefront + dashboard shells
- ⬜ Cart/order placement, order lifecycle + Socket.IO, delivery workflow, notifications — next milestones (see BUILD_PROMPT.md §14)

## Local Development

### Prerequisites

- Node.js 20+, pnpm 9+ (`corepack enable` will provide it)
- Docker (for Postgres/Jaeger/otel-collector/Mailpit locally)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

The defaults point at the local Docker Postgres. To use **NeonDB** instead (free tier), replace `DATABASE_URL` with your Neon connection string — no code changes needed. To use **Supabase Storage**, fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from a free Supabase project.

### 3. Start infrastructure

```bash
pnpm docker:up
```

This starts Postgres, an OpenTelemetry Collector, Jaeger (trace UI at [localhost:16686](http://localhost:16686)), and Mailpit (dev email UI at [localhost:8025](http://localhost:8025)), plus the `api` and `web` containers themselves with hot reload.

Alternatively, run everything on the host without Docker for the app containers:

```bash
docker compose -f infra/docker-compose.yml up postgres otel-collector jaeger mailpit -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

### 4. Run migrations + seed data

```bash
pnpm db:migrate
pnpm db:seed
```

The seed script prints demo login credentials for every role (owner, two staff with different permission grants, two delivery partners, three customers) — all use the password `Password123!`.

### 5. Open the app

- Storefront: [localhost:3000](http://localhost:3000)
- Owner dashboard: [localhost:3000/admin](http://localhost:3000/admin) (log in as `owner@foodbowl.local`)
- API health check: [localhost:4000/health](http://localhost:4000/health)
- Traces: [localhost:16686](http://localhost:16686)

## Monorepo layout

```
apps/api      Fastify backend (RBAC, Prisma/NeonDB, OpenTelemetry, Socket.IO)
apps/web      Next.js frontend (storefront + role dashboards, theme system)
packages/shared  Zod schemas, roles/permissions/order-status constants shared by both apps
infra/        docker-compose + otel-collector config
docs/         RBAC matrix, architecture notes, API reference (filled in as built)
```

## Why free-tier only

This is a testing/learning project — see BUILD_PROMPT.md §1.1. NeonDB and Supabase both have generous free tiers; observability and email run entirely on open-source, self-hosted containers (Jaeger, OTel Collector, Mailpit) so nothing here requires a paid account.
