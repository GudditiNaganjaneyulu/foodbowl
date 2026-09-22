# FoodBowl — Build Progress

Tracks actual progress against the milestones in [BUILD_PROMPT.md](../BUILD_PROMPT.md) §14. Update this file at the end of each work session — check off what's done, note what's next, record anything a future session needs to know that isn't obvious from the code.

Last updated: 2026-09-22

## Status by milestone

- [x] **1. Scaffold** — pnpm workspace, `packages/shared`, `apps/api`, `apps/web`, root tooling (eslint flat config + `.eslintrc.json` for web), docker-compose skeleton, `.env.example`.
- [x] **2. DB + Auth** — Full Prisma schema (RBAC + menu + cart + orders + delivery + notifications + audit log). Migration `20260921154718_init` applied and verified against real Postgres. Register/login/refresh/logout working (argon2 + rotated refresh tokens + JWT with `permVersion`). `requireAuth`/`requirePermission` guards in place. `docs/RBAC.md` written.
- [x] **2a. User Management UI** (BUILD_PROMPT.md §3.4, added after initial scaffold per explicit request) — `/admin/users` page: add user, deactivate/reactivate, change role, per-staff permission checklist. Backed by `/api/v1/admin/users*`, gated on `users.manage` (owner-only). Verified live: 401 unauthenticated, 403 for staff lacking permission, full deactivate→reactivate→login cycle, audit log writes.
- [x] **3. Observability plumbing** — pino logger with trace/span correlation, OpenTelemetry bootstrap (`src/lib/tracing.ts`, loaded via `--import`), otel-collector + Jaeger + Mailpit in docker-compose, `/health` and `/health/ready` endpoints. **Not yet verified**: a trace actually showing up in the Jaeger UI end-to-end (collector was up during testing but I didn't check the Jaeger UI itself — worth a quick look next session).
- [x] **4a. Menu module — read side** — Public `GET /api/v1/menu` works, verified live against seeded data. Theme-complete storefront page consuming it (category tabs, item cards, add-to-cart into a local cart context).
- [ ] **4b. Menu module — write side / admin UI** — `POST/PATCH/DELETE` menu routes exist and typecheck, but there's **no admin UI wired to them yet** — `/admin/menu` and `/staff/menu` are still "coming soon" placeholders. Not live-tested.
- [ ] **5. Cart + order placement** — Cart is currently **client-local only** (`apps/web/lib/cart-context.tsx`, in-memory, not persisted). No `/api/v1/cart` or `/api/v1/orders` (POST) backend routes exist yet. Checkout button on `/cart` is disabled with an explanatory note. This is the next real milestone.
- [ ] **6. Order lifecycle + Socket.IO** — Shared order-status state machine constants exist (`packages/shared/src/constants/order-status.ts`, `TRANSITION_REQUIREMENTS`), but no `OrderService.transition()`, no Socket.IO wiring, no order queue UI yet.
- [ ] **7. Delivery workflow** — `DeliveryAssignment` schema exists; no service/routes/UI yet.
- [ ] **8. Notifications** — `Notification` schema exists; no `NotificationProvider`/service/routes yet.
- [ ] **9. Frontend polish** — Deferred until the above land (no point polishing placeholder screens).
- [ ] **10. Tests** — No automated tests written yet (Vitest/Supertest are installed as devDependencies but unused).
- [x] **11. README** — Local dev setup instructions written and match what's actually implemented.
- [x] **12. Infra: direct NeonDB + Brevo SMTP** (2026-09-22) — Switched from local docker-compose Postgres to a direct NeonDB connection everywhere (dev, Docker, prod-style), and from Mailpit-only to Brevo (free tier) for real SMTP, with Mailpit kept as an optional local fallback. See details below.
- [x] **13. Self-service password change** (2026-09-22) — `PATCH /api/v1/users/me/password` (verify current password → argon2 rehash → revoke other sessions' refresh tokens) + a "Change password" card on `/profile`. This is how the seeded default logins (e.g. `owner@foodbowl.local` / `Password123!`) are meant to be rotated off — not by editing the DB. README now documents the default login/password/dashboard URL per role explicitly; login page shows a dev-only quick-fill hint for the seeded accounts (hidden when `NODE_ENV=production`).

## What's been verified live (not just typechecked)

Ran against real Docker Postgres (not mocked), with a real running API server:

- `pnpm --filter @foodbowl/shared typecheck` — clean
- `pnpm --filter @foodbowl/api typecheck` — clean (after fixing 3 real bugs, see below)
- `pnpm --filter @foodbowl/web typecheck` and `next build` — clean (after fixing 1 real bug, see below)
- `prisma migrate dev --name init` against local Postgres — applied cleanly, migration committed at `apps/api/prisma/migrations/20260921154718_init/`
- `tsx prisma/seed.ts` — seeded 9 demo users across all 4 roles + menu + sample orders
- Live API smoke test: `/health`, `/health/ready`, `/api/v1/menu` (public), `/api/v1/auth/login`, `/api/v1/admin/users` (GET/POST/PATCH status), permission enforcement (401/403), deactivated-user login rejection

## Real bugs found during verification (all fixed)

1. `apps/api/src/lib/tracing.ts` — used `resourceFromAttributes` which doesn't exist in the installed `@opentelemetry/resources` version; switched to `new Resource(...)`.
2. `apps/api/src/modules/menu/menu.routes.ts` — the update-menu-item schema included `modifierGroups`, which isn't a valid Prisma scalar update shape (it's a nested relation). Fixed by omitting `modifierGroups` from `updateMenuItemSchema` — nested modifier group edits need their own endpoint later, not silently accepted and ignored.
3. `apps/api/src/plugins/error-handler.ts` — `error` was typed `unknown` at the point `.message` was accessed; fixed by casting once to `Error & { statusCode?: number }`.
4. `apps/web/app/(admin)`, `(staff)`, `(delivery)` — used Next.js **route groups** (parentheses — no URL segment) where **real path segments** were needed. `(admin)/page.tsx`, `(staff)/page.tsx`, `(delivery)/page.tsx` were all silently colliding at `/`. Fixed by renaming to real folders: `app/admin/`, `app/staff/`, `app/delivery/`. `(public)`, `(customer)`, `(auth)` remain as genuine route groups since their children have distinct real path segments.
5. **Security**: `passwordHash` (the argon2 hash) was leaking in the `/api/v1/admin/users` list and create JSON responses — caught by actually curling the endpoint and inspecting the response, not by reading the code. Fixed with Prisma's `omit` API (`previewFeatures = ["omitApi"]` added to `schema.prisma`, regenerated client, applied `omit: { passwordHash: true }` to every `User` query in `admin-users.service.ts`).
6. ESLint peer-dependency conflict: root installs ESLint 9 (flat config, for api/shared), but `eslint-config-next@14.2` wants ESLint 8. Pinned `apps/web`'s own `eslint` devDependency to `^8.57.1` so pnpm resolves a compatible nested copy for that workspace.

## Direct NeonDB + Brevo switch (2026-09-22)

The user is now running against real NeonDB and Brevo accounts (not local Docker Postgres / Mailpit). Changes made:

- `infra/docker-compose.yml`: `postgres` service commented out (user did this themselves — left as-is, not reverted); removed the `api` service's hardcoded `DATABASE_URL`/`SMTP_HOST` environment overrides that pointed at the local containers, and removed the now-invalid `depends_on: postgres` block (would have broken `docker compose up` outright, referencing a commented-out service). `mailpit` service kept, just unwired by default, documented as an optional fallback.
- `apps/api/src/config/env.ts`: added `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` (optional) to the env schema — Brevo requires auth, Mailpit didn't.
- **Real bug found and fixed**: `dotenv/config`'s default import loads `.env` relative to `process.cwd()`, but `pnpm --filter @foodbowl/api dev` (and anything invoked via `pnpm --filter` from repo root) runs with cwd set to `apps/api`, not the repo root where `.env` actually lives. This meant the host-based dev flow in the README was silently broken — it could never see the root `.env` at all. Fixed by resolving the path explicitly from `env.ts`'s own file location (`import.meta.url` + 4 `path.resolve` levels up to repo root) instead of relying on cwd. Verified: `pnpm --filter @foodbowl/api dev` from repo root now loads `DATABASE_URL`/JWT secrets correctly (previously failed with `Required` errors on those fields).
- `.env` (real, gitignored) now has the user's actual Neon connection string and Brevo SMTP key; `.env.example` (committed) updated with placeholder Brevo/Neon values and explanatory comments — no real secrets in the committed template.
- `prisma migrate deploy` + seed run successfully against the **live Neon database** (not just local Postgres) — verified via `/health/ready` and `/api/v1/menu` returning real seeded data through the actual API server.
- **Neon free-tier cold start observed firsthand**: first several `/health/ready` calls after the compute had been idle returned `db: disconnected` (`Can't reach database server`) even though DNS/TCP connectivity was confirmed fine; it connected successfully after ~15s of retries. This is expected free-tier behavior (auto-suspended compute waking up), not a config bug — worth remembering if health checks look flaky after idle periods.
- **Flagged to user, not touched**: `.env.example` (which IS committed, unlike `.env`) had a "version 2" block appended with what looks like a real Grafana Cloud OTLP `Authorization: Basic <token>` credential pasted in. It's not committed yet (only an older version without it is in git history), so nothing has leaked, but it's sitting in a file that's normally committed. Left it alone since it was the user's own in-progress edit — flagged clearly, did not move/redact/delete it. **Follow up if this is still there next session** — either move it to `.env` (gitignored) or confirm the token has been rotated before it's ever committed.

## Known gaps / things to double check next session

- Docker/Colima wasn't running at the start of the previous session and had to be started manually (`colima start`) before `docker compose` worked — if resuming on a machine without Colima already running, expect the same.
- Haven't yet verified traces actually land in the Jaeger UI (localhost:16686) — collector and Jaeger containers came up fine, just didn't visually confirm a trace appeared.
- `apps/web/lib/cart-context.tsx` is explicitly a temporary client-local stand-in — its comment says milestone 5 swaps it for the real `/api/v1/cart`-backed version; don't build more UI on top of the local-only version without knowing that's coming.
- No automated tests exist yet — everything so far has been verified by manual curl/build/typecheck, not a test suite.
- SMTP is configured (Brevo) but **no code actually sends email yet** — `NotificationProvider`/email sending is milestone 8, still unbuilt. The Brevo credentials in `.env` are inert until then.
- Password change is self-service only, no forced-reset-on-first-login flow — a seeded/admin-created account keeps working with its default/temp password until someone manually visits `/profile` and changes it. Acceptable for a learning project; flag if this ever needs to become a hard requirement (would need a `mustChangePassword` flag on `User` + a redirect guard).

## Suggested next session starting point

Milestone 5 (Cart + Order placement) per BUILD_PROMPT.md §14: build `/api/v1/cart` (GET/POST/PATCH/DELETE) and `/api/v1/orders` (POST place order from cart, snapshotting prices), wire the frontend cart context to it, and replace the disabled "Checkout (COD)" button on `/cart` with a real flow.
