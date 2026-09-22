# Getting Started

Full setup reference for FoodBowl — external service setup, environment configuration, default logins, and troubleshooting. See the [README](../README.md) for the condensed quickstart, and [BUILD_PROMPT.md](../BUILD_PROMPT.md) for the overall architecture/spec this repo is built from.

## 1. Prerequisites

- Node.js 20+
- pnpm 9+ (`corepack enable` provides it)
- Docker (for Jaeger/otel-collector locally, and optionally Mailpit/Postgres — see below)

## 2. External services (all free tier, no card required)

FoodBowl connects directly to a few external services rather than running everything in Docker. Each one is optional in the sense that the app degrades gracefully without it (see each section), but you'll want all of them for a fully working local setup.

### NeonDB (Postgres) — required

1. Create a free project at [neon.tech](https://neon.tech).
2. In the project dashboard, go to **Connection Details** and copy the **pooled** connection string (it looks like `postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require&channel_binding=require`).
3. Paste it into `.env` as `DATABASE_URL`.
4. **Free-tier cold start**: Neon suspends its compute after a period of inactivity. The *first* request after it's been idle can fail or time out while it wakes up (a few seconds) — this is expected, not a bug. If `/health/ready` briefly returns `db: disconnected` right after starting the app, retry in a few seconds.

There's no local Postgres fallback wired up by default — `infra/docker-compose.yml` has a `postgres` service defined but commented out if you'd rather develop against a local DB (uncomment it, and set `DATABASE_URL` back to `postgresql://foodbowl:foodbowl@localhost:5432/foodbowl`).

### Supabase Storage — optional (menu images, delivery proof photos, avatars)

1. Create a free project at [supabase.com](https://supabase.com).
2. Go to **Project Settings → API** and copy the **Project URL** (`SUPABASE_URL`) and the **service_role** key (`SUPABASE_SERVICE_ROLE_KEY`) — not the `anon` key; the backend needs the elevated one, and it's never exposed to the frontend.
3. Create the storage buckets referenced in `.env.example` (`menu-images`, `restaurant-assets`, `delivery-proofs`, `user-avatars`) from the Supabase dashboard's Storage section.

Without these set, image-upload features simply won't work yet — they're not built as of this writing anyway (see `.claude/progress.md`), so this can be deferred.

### Brevo (SMTP) — optional (email notifications)

1. Create a free account at [brevo.com](https://www.brevo.com) (300 emails/day free, no card required).
2. Go to **SMTP & API → SMTP tab**. Your SMTP login is your Brevo account email; the password is the generated **SMTP key** shown there — not your account password.
3. Set `SMTP_USER` (your Brevo login email) and `SMTP_PASSWORD` (the SMTP key) in `.env`.
4. `SMTP_FROM` must be a sender address verified in Brevo (**Senders, Domains & Dedicated IPs**).

Without these set, the app still boots fine — no code sends email yet (`NotificationProvider` is a future milestone), so this is entirely inert either way right now. For local testing without a real Brevo account, `infra/docker-compose.yml` also runs a `mailpit` container (a local SMTP catcher with a web UI at [localhost:8025](http://localhost:8025)) — point `SMTP_HOST` at `localhost` (or `mailpit` from inside Docker), port `1025`, no auth, to use it instead.

### Upstash Redis — optional (auth rate limiting + menu caching)

1. Create a free database at [upstash.com](https://upstash.com).
2. Open the database, go to the **REST API** tab. It shows a ready-to-copy `@upstash/redis` env snippet with exactly two variables.
3. Copy both into `.env`:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

**Important**: Upstash also shows a separate `rediss://...` connection string elsewhere in the console (under "Connect to your database"), for TCP/RESP-protocol clients like `ioredis`. That is **not** what this app uses — `@upstash/redis` is an HTTP/REST client and specifically needs the `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` pair from the REST API tab. The two are different credentials; the `rediss://` password will not work as the REST token.

What Redis is actually used for here, and how the app behaves without it:

| Feature | Without Redis configured |
|---|---|
| Rate limiting on `/auth/login`, `/auth/register`, `/users/me/password` (fixed-window, per IP) | No-ops — requests are never blocked. A warning is logged once at boot so this is visible, not silent. |
| Caching `GET /api/v1/menu` (60s TTL, invalidated on every menu write) | Every read just goes straight to Postgres — slower under load, but correct. |

The app **never crashes or fails to boot** due to missing Redis config — see `apps/api/src/lib/redis.ts`.

## 3. Configure environment

```bash
cp .env.example .env
```

Then fill in the values from the sections above. `.env` is gitignored — real secrets belong there, never in `.env.example` (which is committed as a template with empty/placeholder values).

## 4. Local development

### With Docker (recommended)

```bash
pnpm install
pnpm docker:up
```

This builds and starts `api` + `web` (with hot reload via bind mounts) plus an OpenTelemetry Collector and Jaeger (trace UI at [localhost:16686](http://localhost:16686)). Both app containers connect straight out to Neon/Supabase/Brevo/Upstash via `.env` — there's no local Postgres or Redis container running by default.

### Without Docker (host only)

```bash
pnpm install
docker compose -f infra/docker-compose.yml up otel-collector jaeger -d   # optional, for tracing
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## 5. Run migrations + seed data

```bash
pnpm db:migrate
pnpm db:seed
```

This is idempotent — safe to re-run. It creates the restaurant, all RBAC roles/permissions, demo menu items, a couple of sample orders, and one account per role (see next section).

## 6. Default logins

The seed script is the **only** bootstrap path — it creates one account per role, all on the same password. **Every other user (more staff, delivery partners, additional owners) is created afterward from the owner's Users screen at `/admin/users`, not by editing the seed file or the database directly.** This is a deliberate design choice (see `BUILD_PROMPT.md` §3.4) — user management is a UI feature, not an ops task.

| Role | Email | Password | Dashboard | What it demonstrates |
|---|---|---|---|---|
| Restaurant owner ("super admin") | `owner@foodbowl.local` | `Password123!` | [localhost:3000/admin](http://localhost:3000/admin) | Full permissions by default — the only role that can hold `users.manage` / `restaurant.manage`. |
| Staff — orders only | `staff.orders@foodbowl.local` | `Password123!` | [localhost:3000/staff](http://localhost:3000/staff) | The `staff` role's default baseline permission (`orders.view`) with nothing extra granted. |
| Staff — menu + delivery | `staff.menu@foodbowl.local` | `Password123!` | [localhost:3000/staff](http://localhost:3000/staff) | Per-user permission **overrides** — this account has `menu.manage`, `delivery.assign`, and `orders.manage` granted individually on top of the staff baseline, demonstrating that permissions are per-employee, not just per-role. |
| Delivery partner | `delivery1@foodbowl.local`, `delivery2@foodbowl.local` | `Password123!` | [localhost:3000/delivery](http://localhost:3000/delivery) | The `delivery_partner` role's `delivery.fulfill` permission. |
| Customer | `customer1@foodbowl.local`, `customer2@foodbowl.local`, `customer3@foodbowl.local` | `Password123!` | [localhost:3000](http://localhost:3000) | Public self-registration path — customers get no RBAC permissions; their access is scoped by resource ownership instead. |

Logging in redirects you straight to your role's dashboard (owner/staff → their console, delivery → their queue, customer → the storefront).

In development (`NODE_ENV` ≠ `production`), the login page also shows one-tap buttons that fill in each seeded account's credentials — convenience only, and the block is hidden automatically outside dev.

### Changing the default password

**Do this before this ever runs anywhere but your own machine.** Every account — including the seeded ones — can change its own password:

1. Log in with the credentials above.
2. Go to `/profile` → **Change password**.
3. Enter the current password and a new one (min. 8 characters).

This calls `PATCH /api/v1/users/me/password`, which verifies the current password, rehashes the new one with argon2, and revokes every other active session's refresh token (so changing your password on one device signs you out everywhere else, while the device you changed it on stays logged in until its short-lived access token naturally expires). It's self-service only — nothing currently *forces* a password change on first login; that's a known, accepted gap for a learning project (see `.claude/progress.md`).

### Adding more users

Log in as the owner, go to **Users** in the sidebar (`/admin/users`):

- **Add user** — creates a staff, delivery partner, or additional owner account with a temporary password you set.
- **Role dropdown** per row — reassign an existing user's role (resets their permission overrides to the new role's defaults).
- **Permissions** (staff rows only) — expand to grant/revoke individual permissions beyond the staff baseline.
- **Deactivate** — immediately blocks login and revokes all active sessions for that user, without deleting their order/audit history.
- **Delete** — only allowed for a user with zero order/delivery/audit history; otherwise the API rejects it and you should deactivate instead.

## 7. Troubleshooting

Real issues hit and fixed while building this — documented here in case they recur (e.g. after pulling upstream changes, or if you extend the Docker setup yourself):

- **`docker compose up` fails with `manifest for jaegertracing/all-in-one:X.YZ not found`**: the Jaeger `all-in-one` image requires the *full* patch version tag (e.g. `1.62.0`, not `1.62`). Check `infra/docker-compose.yml`'s `jaeger` service image tag against what's actually published on Docker Hub.
- **`web` container: `Cannot find module '.../next/dist/bin/next'`**: the named `node_modules` volume was created empty and didn't inherit the image's installed packages — a known Docker gotcha when a named volume sits inside an already bind-mounted parent directory. The `dev` stage's `CMD` in both Dockerfiles reinstalls at container start specifically to route around this; if you see this again, check that the `CMD` still does `pnpm install ... && pnpm dev` rather than just `pnpm dev`.
- **`api` container: `ERR_UNKNOWN_FILE_EXTENSION` on `tracing.ts`**: don't bootstrap OpenTelemetry via a `tsx --import ./path/to/file.ts` CLI flag under `tsx watch` — it runs the app in a worker thread and doesn't reliably apply its TypeScript loader to a flag-supplied file there. Import it as the literal first line of `server.ts` instead (already done — flagging in case this pattern gets reintroduced).
- **`api` container: Prisma error `libssl.so.1.1: cannot open shared object file`**: `node:20-slim` ships no OpenSSL at all, so Prisma's runtime detection guesses wrong. Both Dockerfile stages that run Prisma (`base` and `prod`) need `RUN apt-get install -y openssl`.
- **`/health/ready` returns `db: disconnected` right after starting**: almost certainly Neon's free-tier compute waking up from being idle (see the NeonDB section above), not a real failure — retry after a few seconds.
- **Nothing crashes, but rate limiting/menu caching don't seem to do anything**: check the boot log for `UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN not set` — this is expected/by-design when Redis isn't configured (see the Upstash section above), not an error.
