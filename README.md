# FoodBowl 🍔

A single-restaurant food-ordering platform (Swiggy/Zomato-style UX, one restaurant) — built as a learning/testing project. See [BUILD_PROMPT.md](./BUILD_PROMPT.md) for the full spec this repo is built from (architecture, RBAC model, DB schema, API surface, build order), and **[docs/GETTING_STARTED.md](./docs/GETTING_STARTED.md) for the full setup + default-login + troubleshooting reference** — this README is the condensed version.

## Status

Milestone 1–2 scaffolding is in place:

- ✅ Monorepo structure (`apps/api`, `apps/web`, `packages/shared`)
- ✅ Prisma schema (full RBAC + menu + order + delivery + notification model)
- ✅ Auth (register/login/refresh/logout, JWT access + rotated refresh tokens)
- ✅ RBAC (`role.rolePermissions` + `user.userPermissions` overrides, `requirePermission` guard)
- ✅ **User Management UI** — `/admin/users`: add/deactivate users, assign roles, grant/revoke staff permissions (owner-only, see BUILD_PROMPT.md §3.4)
- ✅ Public menu browse (read API + themed storefront UI)
- ✅ OpenTelemetry tracing + pino logging bootstrap, local Jaeger for viewing traces
- ✅ Theme architecture — CSS-variable design tokens, light/dark mode, mobile-first Swiggy/Zomato-inspired storefront (bottom tab nav, sticky cart bar, veg/non-veg indicators, jump-to category chips)
- ✅ Upstash Redis (optional, free tier) — rate limiting on login/register/password-change, response caching on the public menu endpoint; app works fine with neither configured
- ⬜ Cart/order placement, order lifecycle + Socket.IO, delivery workflow, notifications — next milestones (see BUILD_PROMPT.md §14)

## Local Development

### Prerequisites

- Node.js 20+, pnpm 9+ (`corepack enable` will provide it)
- A [NeonDB](https://neon.tech) project (free tier) — the app connects to it directly, no local Postgres container
- A [Brevo](https://www.brevo.com) account (free tier, 300 emails/day) for SMTP — optional, no code sends email yet
- An [Upstash](https://upstash.com) Redis database (free tier) — optional, for auth rate limiting + menu caching
- Docker (for Jaeger/otel-collector locally; optionally Mailpit if you'd rather not use Brevo in dev)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in:

- `DATABASE_URL` — your Neon project's pooled connection string (Neon dashboard → Connection Details)
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — from a free Supabase project (Storage only)
- `SMTP_USER` / `SMTP_PASSWORD` — from Brevo → SMTP & API → SMTP tab (password is the generated "SMTP key", not your account password); `SMTP_FROM` must be a sender verified in Brevo
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — from the Upstash console → your database → REST API tab. **Not** the `rediss://...` TCP connection string shown elsewhere in the console — that's a different client's credential and won't work here.

Full walkthrough for each (where to click in each dashboard) is in **[docs/GETTING_STARTED.md](./docs/GETTING_STARTED.md)**.

### 3. Start infrastructure

```bash
pnpm docker:up
```

This starts an OpenTelemetry Collector and Jaeger (trace UI at [localhost:16686](http://localhost:16686)), plus the `api` and `web` containers with hot reload — both connect straight to Neon and Brevo via `.env`. The `postgres` and `mailpit` services in `infra/docker-compose.yml` are commented out/idle by default; uncomment `postgres` if you'd rather develop against a local DB, or point `SMTP_HOST` back at `mailpit` for a local, no-auth email catcher.

Alternatively, run everything on the host without Docker for the app containers:

```bash
docker compose -f infra/docker-compose.yml up otel-collector jaeger -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

### 4. Run migrations + seed data

```bash
pnpm db:migrate
pnpm db:seed
```

### 5. Default logins

The seed script creates one account per role, all on the same default password below. **This is the only bootstrap login** — every other user (staff, delivery partners, more owners) is created afterward from the owner's Users screen (see BUILD_PROMPT.md §3.4), not from the seed file.

| Role | Email | Password | Dashboard URL |
|---|---|---|---|
| Restaurant owner ("super admin") | `owner@foodbowl.local` | `Password123!` | [localhost:3000/admin](http://localhost:3000/admin) |
| Staff (orders.manage only) | `staff.orders@foodbowl.local` | `Password123!` | [localhost:3000/staff](http://localhost:3000/staff) |
| Staff (+ menu.manage, delivery.assign) | `staff.menu@foodbowl.local` | `Password123!` | [localhost:3000/staff](http://localhost:3000/staff) |
| Delivery partner | `delivery1@foodbowl.local` / `delivery2@foodbowl.local` | `Password123!` | [localhost:3000/delivery](http://localhost:3000/delivery) |
| Customer | `customer1@foodbowl.local` / `customer2@foodbowl.local` / `customer3@foodbowl.local` | `Password123!` | [localhost:3000](http://localhost:3000) |

**Change the default password before this ever runs anywhere but your own machine.** Every account can change its own password from [localhost:3000/profile](http://localhost:3000/profile) → Change password (`PATCH /api/v1/users/me/password`) — log in with the credentials above, then change it there. This is a plain seed password, not a forced-reset flow, so it's on you to actually change it.

See **[docs/GETTING_STARTED.md](./docs/GETTING_STARTED.md)** for what each seeded account specifically demonstrates (e.g. per-user permission overrides), how to add more users, and troubleshooting for issues hit while building this (Docker/Prisma gotchas, Neon cold starts, etc.).

### 6. Open the app

- Storefront: [localhost:3000](http://localhost:3000)
- Login: [localhost:3000/login](http://localhost:3000/login)
- API health check: [localhost:4000/health](http://localhost:4000/health)
- Traces: [localhost:16686](http://localhost:16686)

## Monorepo layout

```
apps/api      Fastify backend (RBAC, Prisma/NeonDB, OpenTelemetry, Socket.IO)
apps/web      Next.js frontend (storefront + role dashboards, theme system)
packages/shared  Zod schemas, roles/permissions/order-status constants shared by both apps
infra/        docker-compose + otel-collector config
docs/         Full setup guide, RBAC matrix, architecture notes, API reference (filled in as built)
```

## Why free-tier only

This is a testing/learning project — see BUILD_PROMPT.md §1.1. NeonDB, Supabase, Brevo, and Upstash all have generous free tiers with no card required; observability runs entirely on open-source, self-hosted containers (Jaeger, OTel Collector) so nothing here requires a paid account.
