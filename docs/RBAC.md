# RBAC Model

Source of truth for roles/permissions is code, not this doc: `packages/shared/src/constants/{roles,permissions}.ts`. This file explains the model and mirrors the current defaults — update it whenever those constants change.

## Roles

| Role | Key | Notes |
|---|---|---|
| Customer | `customer` | Public self-registration. No permissions — customer-only actions (own cart/orders/profile) are scoped by ownership (`userId` match), not the permission system. |
| Restaurant Owner | `restaurant_owner` | Gets every permission by default. Only role that can hold `users.manage` / `restaurant.manage`. |
| Delivery Partner | `delivery_partner` | Created by an owner via the Users screen. Gets `delivery.fulfill` (act on their own assigned deliveries). |
| Staff | `staff` | Created by an owner. Baseline permission is `orders.view`; the owner grants additional permissions per staff member via `UserPermission` overrides. |

## Permissions

| Key | Meaning |
|---|---|
| `menu.manage` | Create/update/delete categories and menu items |
| `orders.view` | See the order queue |
| `orders.manage` | Advance order status (CONFIRMED → PREPARING → READY_FOR_PICKUP), cancel orders |
| `delivery.assign` | Offer an order to a delivery partner |
| `delivery.fulfill` | Act on an order assigned to you as a delivery partner (accept/reject/pickup/deliver) |
| `reports.view` | View revenue/order reports |
| `restaurant.manage` | Edit restaurant settings (hours, delivery fee, open/closed) — **owner only** |
| `users.manage` | Add/deactivate users, assign roles, grant/revoke staff permissions — **owner only** |

`restaurant.manage` and `users.manage` are in `OWNER_ONLY_PERMISSIONS` and can never be granted to a `staff` account via the per-user override UI, even by an owner — the API rejects it server-side.

## How effective permissions are computed

`apps/api/src/lib/rbac.ts#getEffectivePermissions`:

1. Start with the user's role's default permissions (`RolePermission`).
2. Apply per-user overrides (`UserPermission.granted = true` adds, `false` removes).
3. Result is cached per-request only — never across requests, so a permission change takes effect on the user's next API call (and immediately once their JWT is refreshed, since `permVersion` is bumped on every permission/role change).

Routes call `requirePermission(PERMISSIONS.X)` (or `requireRole(...)` for the rare role-only checks) as a Fastify `preHandler`. The frontend's `usePermissions()` hook (`apps/web/lib/auth-context.tsx`) mirrors this for UI visibility only — it is never the enforcement point.

## User management

See BUILD_PROMPT.md §3.4. All user creation/deactivation/role/permission changes happen through `/api/v1/admin/users*`, gated on `users.manage`, exercised from the Owner Dashboard's Users screen (`apps/web/app/(admin)/users/page.tsx`). Every action writes an `AuditLog` row.
