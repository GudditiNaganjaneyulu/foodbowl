# End-to-end journey

A real-browser test of the whole product against a running stack. Several people, each in their own browser session, work together **live**: a customer orders, the kitchen sees it appear without reloading, dispatch offers it, a rider accepts, picks up and delivers with a proof photo, the customer watches every step, a support conversation moves across three roles, a new customer completes onboarding, and then every main screen is re-checked at phone width (no sideways scrolling, composer on screen, ADD button not covered by its photo).

It complements the API test suite (`apps/api/test`), which covers rules and permissions exhaustively without a browser. This one catches what only a browser sees: layout, real-time delivery between users, uploads, redirects.

## Setup

It **creates orders, users and conversations**, so run it only against a throwaway database — never your Neon one.

1. A seeded throwaway Postgres, migrated (see *Running the tests* in `docs/GETTING_STARTED.md`).
2. The API against it, with Redis, email and Supabase switched off so nothing external is touched and proof photos use built-in storage:

   ```bash
   DATABASE_URL=postgresql://foodbowl:foodbowl@localhost:5433/foodbowl PORT=4100 WEB_ORIGIN=http://localhost:3100 \
   UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN= EMAIL_NOTIFICATIONS_ENABLED=false SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= \
   pnpm --filter @foodbowl/api start
   ```
3. The web app built to talk to that API (`NEXT_PUBLIC_*` are baked in at build time):

   ```bash
   NEXT_PUBLIC_API_URL=http://localhost:4100 NEXT_PUBLIC_SOCKET_URL=http://localhost:4100 pnpm --filter @foodbowl/web build
   pnpm --filter @foodbowl/web exec next start -p 3100
   ```
4. Google Chrome installed (the test drives it directly; nothing is downloaded).

## Run

```bash
cd e2e && npm install
WEB=http://localhost:3100 API=http://localhost:4100 npm test
```

Screenshots of each stage are written to `e2e/shots/` (and of every browser when a step fails).

| Variable | Meaning |
|---|---|
| `WEB` / `API` | Addresses of the running stack (defaults `:3000` / `:4000`) |
| `CHROME_PATH` | Path to a Chrome/Chromium binary, if it isn't found automatically |
| `E2E_RESET_CMD` | Optional shell command that returns the test DB to a clean state, run before and after. Example for the docker Postgres above: `docker exec fb-test-pg psql -U foodbowl -d foodbowl -q -c "update restaurants set \"isOpen\"=true, \"deliveryFee\"=2.5; update menu_items set \"isAvailable\"=true where id like 'seed-item-%'; delete from orders where notes like 'E2E%'; delete from cart_items; delete from notifications; delete from support_tickets; delete from categories where name like 'E2E%'; delete from addresses where line1 like '%E2E%'"` |

The steps assume the standard seed (`pnpm db:seed`): the demo accounts, the ~24-dish menu, and `staff.support@foodbowl.local`.
