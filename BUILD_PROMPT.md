# FoodBowl — Claude Code Build Prompt

> **How to use this file:** Paste this entire document as your first prompt to Claude Code in an empty repository (or run `claude` in this repo and say "read BUILD_PROMPT.md and start building"). It is written as a single, self-contained instruction set. Work through the milestones in order, committing after each one, and ask before making irreversible infra decisions (creating cloud resources, pushing, etc.) that aren't covered here.

---

## 0. Mission

Build **FoodBowl**, a single-restaurant food-ordering web application (Swiggy/Zomato-style UX, but scoped to one restaurant) in **one repository**. It must support four roles with real RBAC, a full order lifecycle from cart to COD delivery, and be observable and swappable by design — we will change payment providers, notification channels, and storage/telemetry backends later without rewrites.

**Repository name:** `foodbowl`

**Non-negotiables:**
- **One repository, no exceptions.** Frontend, backend, shared packages, infra, and docs all live in this single monorepo (`foodbowl`). Never split into separate repos, even for "just the frontend" or "just infra" — one clone, one `docker compose up`.
- Single Postgres database hosted on **NeonDB**.
- File/image storage on **Supabase Storage** (not Supabase Auth/DB — just storage).
- Payments: **Cash on Delivery only** for v1, but behind a `PaymentProvider` interface so Razorpay/Stripe/UPI can be added later without touching order logic.
- Structured logging + distributed tracing from day one, via **OpenTelemetry** (vendor-neutral) — no hard dependency on Datadog/Honeycomb/etc. We decide the backend later; the code should just emit OTLP.
- Clean layering: routes → controllers → services → repositories/Prisma. No business logic in route handlers.
- **This is a testing/learning project, not a production system.** Optimize every external dependency choice for $0 cost — see §1.1.
- **User creation, removal, and role/permission assignment happen only through the Owner Dashboard UI** — there is no CLI script or ad-hoc DB edit path for ongoing user management (seeding only bootstraps the first owner account). See §3.4.

---

## 1. Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | one language, shared types between FE/BE |
| Backend framework | Fastify | fast, good plugin model, first-class OpenTelemetry + pino support |
| ORM | Prisma | works cleanly with NeonDB (Postgres), great DX for migrations + seeding |
| Frontend | Next.js 14+ (App Router) + React | SSR for menu pages (SEO), API routes not needed since we have a separate backend |
| Styling | Tailwind CSS + shadcn/ui | fast to build a clean multi-role UI |
| Auth | Custom JWT (access + refresh tokens) via `jose`, argon2 for password hashing | full control over RBAC claims; avoids coupling to a specific auth vendor |
| Validation | Zod (shared schemas package) | single source of truth for FE + BE validation |
| Realtime | Socket.IO (order status channel) | simplest way to push live order tracking to customers/staff |
| Storage | Supabase Storage (via `@supabase/supabase-js`, storage-only, no Supabase Auth/DB) | requested; used for menu item images, restaurant logo, delivery proof photos |
| DB | NeonDB Postgres | requested; serverless Postgres, branching for dev/preview |
| Logging | pino (structured JSON) | fast, pairs well with OpenTelemetry log correlation |
| Tracing | OpenTelemetry SDK, OTLP exporter | tool-agnostic; point `OTEL_EXPORTER_OTLP_ENDPOINT` at anything later (Jaeger, Tempo, Honeycomb, Datadog agent) |
| Local trace/log viewing | Jaeger + an OTel Collector in docker-compose | so tracing is visibly working in dev with zero paid tooling |
| Containerization | Docker + docker-compose | local dev parity |
| Package management | pnpm workspaces (monorepo) | fast installs, good monorepo support |
| Testing | Vitest (unit/integration), Supertest (API) | fast, TS-native |

### 1.1 Free-Tier / Zero-Cost Constraints (this is a learning project)

Every external dependency here must run on a genuinely free tier — no credit-card-gated trials, no paid SaaS. Concretely:

- **NeonDB** — use the free project tier (default branch, smallest compute). This project's data volume never needs more.
- **Supabase** — free tier project, **Storage only** (we don't touch Supabase Auth/DB/Realtime, so usage stays well inside the free storage/bandwidth quota).
- **Observability** — self-hosted, open-source, local: OpenTelemetry Collector + Jaeger via Docker Compose. Do **not** sign up for Datadog/Honeycomb/New Relic/etc. The OTLP pipeline can be pointed at one of those later purely via env var + collector config — nothing paid is required to build, run, or demo this project.
- **Email** — **Brevo** (free tier, 300 emails/day, no card required) for real SMTP sends; Mailpit (local, free, Docker) remains available as a no-auth local fallback for offline dev. Don't wire a paid transactional email provider.
- **Cache/rate limiting** — **Upstash Redis** (free tier, HTTP/REST client via `@upstash/redis`) for auth rate limiting and menu response caching. Optional at the code level — both features no-op cleanly when it's not configured, the app never hard-depends on it being up.
- **Maps/geocoding** — if you want lat/lng on addresses, use a free option (OpenStreetMap Nominatim) or simply skip geocoding and store plain-text addresses — sufficient for a single-restaurant demo. Do not integrate Google Maps Platform (requires billing).
- **SMS/Push** — none. The `PUSH_STUB` notification channel stays a no-op; don't wire Twilio/FCM paid tiers.
- **Deployment (optional, only if going beyond localhost)** — Vercel free tier for the Next.js frontend, and a free-tier container host (Render/Fly.io free allowance) for the API/Docker services. Cold starts and sleep-on-idle are acceptable here since this isn't production traffic.

If a feature seems to need a paid dependency, flag it and propose the free-tier-compatible alternative rather than adding it silently.

---

## 2. Repository Structure

```
foodbowl/
├── apps/
│   ├── api/                     # Fastify backend
│   │   ├── src/
│   │   │   ├── config/          # env parsing (zod-validated), constants
│   │   │   ├── db/              # prisma client singleton
│   │   │   ├── modules/
│   │   │   │   ├── auth/        # register, login, refresh, roles
│   │   │   │   ├── users/       # profile, addresses
│   │   │   │   ├── menu/        # categories, items, modifiers
│   │   │   │   ├── cart/
│   │   │   │   ├── orders/      # placement, status machine, history
│   │   │   │   ├── restaurant/  # restaurant settings, operating hours
│   │   │   │   ├── staff/       # staff management, shift/permission assignment
│   │   │   │   ├── delivery/    # delivery partner assignment + workflow
│   │   │   │   ├── notifications/
│   │   │   │   └── uploads/     # Supabase storage signed URLs
│   │   │   ├── plugins/         # fastify plugins: auth, rbac, otel, error-handler
│   │   │   ├── lib/
│   │   │   │   ├── logger.ts    # pino instance
│   │   │   │   ├── tracing.ts   # OpenTelemetry bootstrap (loaded before app)
│   │   │   │   ├── rbac.ts      # permission matrix + guard()
│   │   │   │   └── payments/    # PaymentProvider interface + CodProvider
│   │   │   ├── sockets/         # Socket.IO order-status namespace
│   │   │   └── server.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   ├── test/
│   │   ├── Dockerfile
│   │   └── package.json
│   └── web/                     # Next.js frontend
│       ├── app/
│       │   ├── (public)/        # landing, menu browse (no auth)
│       │   ├── (auth)/          # login, register
│       │   ├── (customer)/      # cart, checkout, order tracking, profile, history
│       │   ├── (admin)/         # restaurant owner dashboard
│       │   ├── (staff)/         # staff console (kitchen/counter ops)
│       │   └── (delivery)/      # delivery partner app view
│       ├── components/
│       ├── lib/                 # api client, socket client, auth context
│       ├── Dockerfile
│       └── package.json
├── packages/
│   ├── shared/                  # Zod schemas, TS types, permission constants, order status enum
│   └── config/                  # shared tsconfig, eslint config
├── infra/
│   ├── docker-compose.yml       # api, web, postgres (local fallback), otel-collector, jaeger
│   └── otel-collector-config.yaml
├── docs/
│   ├── ARCHITECTURE.md
│   ├── RBAC.md
│   └── API.md
├── .env.example
├── pnpm-workspace.yaml
├── turbo.json                   # optional: turborepo for task orchestration
└── README.md
```

---

## 3. Roles & RBAC

### 3.1 Roles

1. **customer** — browses menu, orders, tracks own orders, manages own profile/addresses.
2. **restaurant_owner** (admin) — full control: menu, staff, orders, delivery partners, restaurant settings, reports.
3. **delivery_partner** — sees assigned deliveries, updates delivery-leg status, marks delivered.
4. **staff** — internal operational role, subdivided by **staff permissions** (not separate DB roles) so the owner can grant fine-grained access:
   - `staff:menu.manage`
   - `staff:orders.view`
   - `staff:orders.manage` (accept/reject/update prep status)
   - `staff:delivery.assign`
   - `staff:reports.view`

### 3.2 Data model for RBAC

Don't hardcode `if (role === 'admin')` sprinkled everywhere. Use:

```
Role            (id, key, name)              -- customer, restaurant_owner, delivery_partner, staff
Permission      (id, key, description)        -- e.g. "orders.manage", "menu.manage"
RolePermission  (role_id, permission_id)       -- default grants per role
UserPermission  (user_id, permission_id, granted boolean)  -- per-user overrides (mainly for staff)
User            (..., role_id)
```

- `restaurant_owner` and `customer`/`delivery_partner` get their full permission set from `RolePermission` (fixed).
- `staff` users get a baseline from `RolePermission`, and the owner can grant/revoke individual permissions via `UserPermission` — this is how "staff permissions and operations" becomes real per-employee RBAC instead of one blob role.
- Backend: a Fastify `preHandler` guard `requirePermission('orders.manage')` resolves the user's effective permission set (role defaults + overrides) — cache per-request, not per-process.
- Frontend: a `usePermissions()` hook drives conditional rendering, but **never trust the frontend** — every mutation is re-checked server-side.

Write the full permission matrix (role × default permissions) into `docs/RBAC.md` as you implement it.

### 3.3 Auth

- Passwords hashed with argon2id.
- JWT access token (15 min) + refresh token (7 days, rotated, stored hashed in `RefreshToken` table so it can be revoked — support logout-everywhere).
- Access token payload includes `sub`, `role`, and a `permVersion` claim; bump `permVersion` on the user when their permissions change so stale tokens can be rejected without a DB hit on every request (optimistic check), falling back to DB lookup on mismatch.
- Registration is open for `customer`. `restaurant_owner`, `staff`, and `delivery_partner` accounts are created by an existing owner/admin, never via public signup — enforce this server-side.

### 3.4 User Management (UI-driven, admin-only)

Add/remove/role-assignment for non-customer users is a first-class **Owner Dashboard** screen, not a script:

- **New permission**: `users.manage`, granted only to `restaurant_owner` by default (not grantable to staff in v1 — keep user administration owner-only to avoid privilege-escalation edge cases).
- **Users screen** (`/admin/users` in the frontend): table of all users with role, active/inactive status, and (for staff) their granted permissions. Filter by role/status.
- **Add User**: form to create a `staff`, `delivery_partner`, or additional `restaurant_owner` account — email, name, role, temporary password (shown once, user changes it on first login). Calls `POST /api/v1/admin/users`.
- **Remove User**: soft-delete via a **Deactivate** toggle (`PATCH /api/v1/admin/users/:id/status`) — sets `is_active = false`, immediately blocks login and revokes refresh tokens, but preserves their historical orders/deliveries/audit trail. A true hard `DELETE /api/v1/admin/users/:id` is exposed but the service layer rejects it if the user has any orders/assignments/audit rows, so "remove" in practice means deactivate — this keeps referential integrity for order history intact.
- **Assign Role**: `PATCH /api/v1/admin/users/:id/role` — change a user's role (e.g. promote staff to owner, or correct a mis-assigned role). Changing role resets their `UserPermission` overrides to the new role's defaults and bumps `perm_version` so any live session picks it up immediately.
- **Assign/Revoke Permissions** (staff only): inline expandable permission checklist per staff row, backed by the existing `PATCH /api/v1/staff/:userId/permissions` (or fold it under `/api/v1/admin/users/:id/permissions` for consistency — pick one and use it everywhere).
- Every action here writes an `AuditLog` row (actor, action, target user id, before/after state), shown in a simple read-only **Activity Log** tab on the same screen.
- The seed script (§13) is a one-time **local test-data bootstrap** and may pre-create a handful of demo staff/delivery/customer accounts so there's data to test against immediately — that's a convenience for this learning project, not the management path. Once the app is running, all *further* user creation, deactivation, and role/permission changes go through this UI and its `/api/v1/admin/users*` endpoints — there is no other runtime path (no public signup for non-customer roles, no admin script) for managing users.

---

## 4. Database Schema (Prisma)

Model this in `apps/api/prisma/schema.prisma`. Key entities (write full Prisma models with proper relations, indexes, and enums — this is the shape, not literal syntax):

```
User            id, email (unique), phone, password_hash, name, role_id, is_active,
                perm_version, created_at, updated_at

Role            id, key, name
Permission      id, key, description
RolePermission  role_id, permission_id
UserPermission  user_id, permission_id, granted

RefreshToken    id, user_id, token_hash, expires_at, revoked_at, created_at

Address         id, user_id, label, line1, line2, city, state, postal_code,
                lat, lng, is_default

Restaurant      id, name, description, logo_url, address, phone,
                is_open, opens_at, closes_at, min_order_amount, delivery_fee
                -- single row; still modeled as a table for future multi-restaurant support

Category        id, restaurant_id, name, sort_order, is_active

MenuItem        id, category_id, name, description, price, image_url,
                is_veg, is_available, sort_order, created_at, updated_at

ModifierGroup   id, menu_item_id, name, min_select, max_select, required
Modifier        id, modifier_group_id, name, price_delta

Cart            id, user_id (unique, one active cart per user), created_at, updated_at
CartItem        id, cart_id, menu_item_id, quantity, selected_modifiers (json), note

Order           id, order_number (human-readable, unique), user_id, address_id,
                status (enum, see 4.1), subtotal, delivery_fee, discount, total,
                payment_method (enum: COD), payment_status (enum: PENDING, COLLECTED),
                placed_at, delivered_at, cancelled_at, cancellation_reason,
                assigned_delivery_partner_id (nullable), notes

OrderItem       id, order_id, menu_item_id, name_snapshot, price_snapshot,
                quantity, selected_modifiers (json), line_total

OrderStatusLog  id, order_id, from_status, to_status, changed_by_user_id, note, created_at

DeliveryAssignment  id, order_id, delivery_partner_id, assigned_by_user_id,
                     assigned_at, accepted_at, picked_up_at, delivered_at,
                     status (enum: OFFERED, ACCEPTED, REJECTED, PICKED_UP, DELIVERED),
                     proof_image_url, cod_collected boolean, cod_collected_at

Notification    id, user_id, type, title, body, channel (enum: IN_APP, EMAIL, PUSH_STUB),
                is_read, metadata (json), created_at

AuditLog        id, actor_user_id, action, entity_type, entity_id, metadata (json), created_at
```

### 4.1 Order status state machine

```
PLACED → CONFIRMED → PREPARING → READY_FOR_PICKUP → OUT_FOR_DELIVERY → DELIVERED
                                                  ↘ CANCELLED (from PLACED/CONFIRMED/PREPARING only)
```

- Every transition is written through one `OrderService.transition(orderId, toStatus, actor)` function that (a) validates the transition is legal from current state, (b) validates the actor's role/permission is allowed to make that specific transition, (c) writes `OrderStatusLog`, (d) emits a Socket.IO event on the order's room, (e) triggers a notification, (f) emits an OTel span event. Never mutate `Order.status` directly anywhere else.
- Permission-to-transition mapping example: `restaurant_owner`/`staff:orders.manage` can move PLACED→CONFIRMED→PREPARING→READY_FOR_PICKUP; `staff:delivery.assign` (or owner) creates the `DeliveryAssignment` which moves order to OUT_FOR_DELIVERY once the partner accepts; `delivery_partner` can only move their own assigned order OUT_FOR_DELIVERY→DELIVERED; `customer` can only trigger CANCELLED, and only pre-PREPARING.

---

## 5. API Design

REST, versioned under `/api/v1`. Group by module; every mutating route runs through `requireAuth` + `requirePermission(...)`. List the actually-implemented routes in `docs/API.md` as you build (OpenAPI/Swagger via `@fastify/swagger` is a bonus, not required for v1).

Representative surface:

```
POST   /api/v1/auth/register              (customer self-signup)
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

GET    /api/v1/admin/users                  (users.manage — list all users, filter by role/status)
POST   /api/v1/admin/users                  (users.manage — create staff/delivery_partner/owner account)
PATCH  /api/v1/admin/users/:id/role         (users.manage — reassign role, resets permission overrides)
PATCH  /api/v1/admin/users/:id/status       (users.manage — activate/deactivate = "remove")
PATCH  /api/v1/admin/users/:id/permissions  (users.manage — grant/revoke individual permissions, staff only)
DELETE /api/v1/admin/users/:id              (users.manage — hard delete; rejected if user has orders/assignments/audit history — use deactivate instead)

GET    /api/v1/menu                        (public: categories + items)
POST   /api/v1/menu/categories             (menu.manage)
PATCH  /api/v1/menu/categories/:id
POST   /api/v1/menu/items                  (menu.manage)
PATCH  /api/v1/menu/items/:id
DELETE /api/v1/menu/items/:id

GET    /api/v1/cart
POST   /api/v1/cart/items
PATCH  /api/v1/cart/items/:id
DELETE /api/v1/cart/items/:id

POST   /api/v1/orders                      (place order from cart, COD)
GET    /api/v1/orders/me                   (customer order history)
GET    /api/v1/orders/:id
GET    /api/v1/orders                      (orders.view — restaurant/staff queue, filterable by status)
PATCH  /api/v1/orders/:id/status           (orders.manage — advance state machine)
POST   /api/v1/orders/:id/cancel

POST   /api/v1/delivery/assignments        (delivery.assign — offer order to a partner)
PATCH  /api/v1/delivery/assignments/:id/accept    (delivery_partner)
PATCH  /api/v1/delivery/assignments/:id/reject
PATCH  /api/v1/delivery/assignments/:id/picked-up
PATCH  /api/v1/delivery/assignments/:id/delivered  (with COD-collected confirmation + proof photo)
GET    /api/v1/delivery/me/assignments      (delivery_partner's own queue)

GET    /api/v1/users/me
PATCH  /api/v1/users/me
GET    /api/v1/users/me/addresses
POST   /api/v1/users/me/addresses

GET    /api/v1/notifications/me
PATCH  /api/v1/notifications/:id/read

POST   /api/v1/uploads/sign                 (returns a Supabase signed upload URL, scoped by folder/entity)

GET    /api/v1/restaurant
PATCH  /api/v1/restaurant                   (owner: hours, delivery fee, open/closed toggle)

GET    /health                              (liveness)
GET    /health/ready                        (readiness: checks DB connection)
```

Realtime: Socket.IO namespace `/orders`, room per `order:{id}` (customer + assigned staff/delivery partner join), and room per `restaurant:orders` (staff dashboard live queue).

---

## 6. Observability (build this in from milestone 1, not bolted on later)

**Logging**
- `pino` as the base logger, JSON structured output. Every request gets a `requestId` (via `@fastify/request-id` or generated), included in every log line.
- Correlate logs with traces: inject `trace_id` / `span_id` into every log line (pull from the active OTel context) so logs and traces can be joined in whatever backend we pick later.
- Log at service-layer boundaries (order placed, status transitioned, payment recorded, notification sent, permission denied) — not just HTTP access logs.

**Tracing**
- `@opentelemetry/sdk-node` with auto-instrumentation for Fastify, Prisma/pg, and outbound HTTP (Supabase calls). Bootstrap this file **first**, before any other import, in `apps/api/src/lib/tracing.ts` — imported as the literal first line of `server.ts` (`import './lib/tracing'`), not via a `-r`/`--import` CLI flag. ES module import order guarantees that file's side effects run before anything it needs to instrument gets loaded, and it avoids a real bug hit in practice: `tsx watch` runs the app in a worker thread, and a `.ts` file passed via `--import` doesn't reliably get tsx's TypeScript loader applied to it there (`ERR_UNKNOWN_FILE_EXTENSION`) even though the same flag works fine outside watch mode.
- Exporter: OTLP over HTTP, endpoint from `OTEL_EXPORTER_OTLP_ENDPOINT` env var — defaults to the local otel-collector in docker-compose. No vendor SDK imported directly; swapping backends later is an env var + collector config change only.
- Custom spans around: order placement, status transitions, delivery assignment, payment recording — with meaningful attributes (`order.id`, `order.status`, `user.role`), not just auto-instrumented HTTP spans.
- Local dev: docker-compose runs an **otel-collector** that fans out to **Jaeger** (UI at `localhost:16686`) so tracing is visibly working without signing up for anything.

**Metrics (lightweight, optional but recommended)**
- OTel metrics for request counts/latency and order-throughput counters, exported via the same OTLP pipeline. Keep it minimal for v1.

Document the whole pipeline in `docs/ARCHITECTURE.md` including the "how to swap the backend later" note (change `OTEL_EXPORTER_OTLP_ENDPOINT` + collector exporters config, nothing in app code).

---

## 7. Storage (Supabase)

- Use `@supabase/supabase-js` with the **service role key on the backend only** (never exposed to the frontend).
- Buckets: `menu-images`, `restaurant-assets`, `delivery-proofs`, `user-avatars`.
- Backend issues **signed upload URLs** via `POST /api/v1/uploads/sign` (scoped to bucket + path + short expiry) — the frontend uploads directly to Supabase with that URL, then confirms the resulting public/stored path back to the relevant entity (menu item, order delivery proof, etc.). Don't proxy file bytes through the API.
- Wrap all storage calls behind a small `StorageProvider` interface in `apps/api/src/lib/storage/` so it could be swapped for S3/R2 later without touching callers.

---

## 8. Payments (COD only, but abstracted)

```ts
interface PaymentProvider {
  createIntent(order: Order): Promise<PaymentIntentResult>;
  confirmPayment(orderId: string, meta: unknown): Promise<void>;
}
```

- Implement `CodPaymentProvider`: `createIntent` just marks `payment_status = PENDING`; `confirmPayment` is called by the delivery partner's "mark delivered" action with `cod_collected: true`, setting `payment_status = COLLECTED`.
- `OrderService` depends on the `PaymentProvider` interface, resolved from a small factory keyed by `payment_method`, so adding Razorpay/Stripe later means adding a new class + factory entry, not touching order logic.

---

## 9. Notifications

```ts
interface NotificationProvider {
  send(userId: string, notification: NotificationPayload): Promise<void>;
}
```

- v1 implementations: `InAppNotificationProvider` (writes to `Notification` table, pushed live via Socket.IO to the user if connected) and `EmailNotificationProvider` (stub via nodemailer using a local mail catcher in docker-compose — e.g. Mailpit — for dev; real SMTP creds via env in prod).
- A `NotificationService` fans out to configured providers per event type. Trigger points: order placed (customer + restaurant), order status changed (customer), delivery offered (delivery partner), delivery completed (customer + restaurant).
- Keep `PUSH_STUB` channel wired but no-op — so adding real push later is additive.

---

## 10. Frontend (Next.js)

Route groups by role as shown in the structure above. Key screens:

**Public / Customer**
- Landing + menu browse (categories, item cards, veg/non-veg filter, search)
- Item detail modal with modifiers, add-to-cart
- Cart drawer/page, address selection, place order (COD confirmation)
- Order tracking page (live status via Socket.IO, status timeline UI)
- Order history, profile, saved addresses

**Restaurant Owner Dashboard**
- Menu management (CRUD categories/items, image upload via Supabase signed URL, availability toggle)
- Live order queue (kanban-ish by status), order detail drawer
- **Users screen** (§3.4): add/deactivate users, assign roles, grant/revoke staff permissions, view activity log — the only place users are managed
- Delivery partner management: view partners (created via the Users screen), manually assign or view auto-assignment
- Restaurant settings (hours, delivery fee, open/closed switch)
- Basic reports (orders/day, revenue — simple aggregation queries, no BI tooling needed for v1)

**Staff Console** (visibility gated by their granted permissions)
- Order queue filtered to actionable states, "confirm/start preparing/mark ready" actions
- Delivery assignment screen if they hold `staff:delivery.assign`

**Delivery Partner View**
- Offered deliveries (accept/reject), active delivery detail (customer address, contact, items, COD amount due)
- Pickup confirmation, delivered confirmation with COD-collected checkbox + optional proof photo upload

Shared: `lib/apiClient.ts` (typed fetch wrapper using the shared Zod schemas), `lib/socket.ts`, `lib/authContext.tsx` (holds access token in memory, refresh token in httpOnly cookie set by the API), `usePermissions()` hook.

---

## 11. Docker & Local Development

`infra/docker-compose.yml` services:

```yaml
services:
  postgres:        # local fallback DB for offline dev; prod points DATABASE_URL at NeonDB instead
  api:              # apps/api, depends_on postgres, hot-reload via ts-node-dev/tsx in dev target
  web:              # apps/web, Next dev server
  otel-collector:   # infra/otel-collector-config.yaml — receives OTLP, exports to jaeger + logs to stdout
  jaeger:           # trace UI on :16686
  mailpit:          # local SMTP catcher + web UI for notification emails in dev
```

- Multi-stage Dockerfiles for `api` and `web` (dev stage with hot reload, prod stage with build + slim runtime image).
- `docker compose up` should give a fully working stack against local Postgres. Switching `DATABASE_URL` in `.env` to a NeonDB connection string switches the same containers to the cloud DB with zero code changes — this is the whole point of using Prisma + a standard `DATABASE_URL`.
- Root `package.json` scripts: `dev`, `build`, `db:migrate`, `db:seed`, `db:studio`, `test`, `lint`.

---

## 12. Environment Configuration

`.env.example` at repo root (and per-app if needed), validated at boot via a Zod schema in `apps/api/src/config/` so the app fails fast with a clear error if something's missing:

```
# Database — direct NeonDB connection (see apps/api/.env)
DATABASE_URL=postgresql://user:pass@ep-example-pooler.region.aws.neon.tech/foodbowl?sslmode=require

# Auth
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d

# Supabase Storage
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET_MENU=menu-images
SUPABASE_STORAGE_BUCKET_PROOFS=delivery-proofs

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_SERVICE_NAME=foodbowl-api
LOG_LEVEL=info

# Email — Brevo free tier (fall back to local mailpit:1025, no auth, for offline dev)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=orders@foodbowl.local

# Redis — Upstash free tier (optional: rate limiting + menu caching no-op without it)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# App
PORT=4000
WEB_ORIGIN=http://localhost:3000
NODE_ENV=development
```

Never commit real secrets — `.env` is gitignored, `.env.example` documents keys with dummy/empty values.

---

## 13. Seed Data

`apps/api/prisma/seed.ts` should create, idempotently:

- 1 restaurant ("FoodBowl Kitchen") with hours + delivery fee.
- Roles + permissions + role-permission defaults (the RBAC matrix from §3).
- Users: 1 `restaurant_owner`, 2 `staff` (one with only `orders.manage`, one with `menu.manage` + `delivery.assign`, to demonstrate per-user overrides), 2 `delivery_partner`, 3 `customer` accounts — all with a clearly documented dev password (e.g. `Password123!`) printed to console on seed.
- 4–6 categories, 20+ menu items across them with images pointing at placeholder URLs (or upload a couple of real sample images to Supabase if credentials are present), a few items with modifier groups (size, spice level, add-ons).
- A handful of past orders in various terminal states (DELIVERED, CANCELLED) for order-history/reporting screens to have data, plus one live order in PLACED state so the tracking UI has something to show immediately after seeding.

---

## 14. Build Order (do this incrementally, commit after each milestone)

1. **Scaffold** — pnpm workspace, `packages/shared`, empty `apps/api` and `apps/web`, root tooling (eslint, prettier, tsconfig base), docker-compose skeleton, `.env.example`.
2. **DB + Auth** — Prisma schema (§4) + RBAC tables, migrations, seed script (§13), register/login/refresh endpoints, `requireAuth`/`requirePermission` guards. Write `docs/RBAC.md`.
3. **Observability plumbing** — pino logger, OTel bootstrap, otel-collector + Jaeger in docker-compose, health endpoints. Verify a trace shows up in Jaeger UI for a single request before moving on.
4. **Menu module** — categories/items CRUD (owner/staff), public menu read endpoint, Supabase signed upload wiring.
5. **Cart + Order placement** — cart CRUD, order placement transaction (snapshot prices, decrement nothing since no inventory count in v1 unless you want to add `stock_quantity` — optional), COD `PaymentProvider`.
6. **Order lifecycle + Socket.IO** — status state machine, `OrderStatusLog`, live order-tracking socket events, restaurant order queue endpoint/UI.
7. **User Management UI** (§3.4) — owner can add/deactivate staff, delivery partners, and other owners, reassign roles, and toggle individual staff permissions, all from the Users screen; staff/delivery console views reflect only what's granted, enforced both client- and server-side.
8. **Delivery workflow** — assignment creation, accept/reject, pickup/delivered transitions, COD-collected confirmation, proof photo upload.
9. **Notifications** — in-app + email providers wired to the lifecycle events from steps 6 and 8.
10. **Frontend polish** — customer order history/profile, owner reports, responsive pass, loading/error states.
11. **Tests** — unit tests for `OrderService` state machine and `rbac.ts` guard logic at minimum; a couple of Supertest integration tests for the auth + order-placement happy path.
12. **README** — full local setup instructions (clone → `pnpm i` → `docker compose up` → `pnpm db:migrate` → `pnpm db:seed` → `pnpm dev`), architecture diagram/summary, and how to point at real NeonDB/Supabase/OTel backends for a deployed environment.

---

## 15. Explicit Non-Goals for v1

- No online payment gateway integration (interface only).
- No multi-restaurant support (schema allows it via `Restaurant` table, but only one row is used).
- No real push notifications (stubbed channel only).
- No inventory/stock management beyond `is_available` toggle.
- No automated delivery-partner geo-matching — assignment is manual (owner/staff picks from available partners) or simple round-robin; real dispatch optimization is future work.

---

Work through this in order, ask before creating any real external accounts/resources (NeonDB project, Supabase project) if credentials aren't already provided in the environment, and keep the layering (routes/controllers/services/repositories) honest so each of the "replace later" seams in this doc actually stays swappable.
