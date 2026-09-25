import { describe, expect, it } from 'vitest';
import { ORDER_STATUS, PERMISSIONS, ROLES, type OrderStatus } from '@foodbowl/shared';
import type { Actor } from '../src/lib/rbac';
import { authorizeTransition, canViewOrder, type OrderAccess } from '../src/modules/orders/order-rules';

const actor = (role: string, permissions: string[] = [], userId = role): Actor => ({
  userId,
  role,
  permissions: new Set(permissions),
});

const S = ORDER_STATUS;
const order: OrderAccess = { customerId: 'cust', assignedPartnerId: 'rider' };

const owner = actor(ROLES.RESTAURANT_OWNER, Object.values(PERMISSIONS), 'owner');
const kitchen = actor(ROLES.STAFF, [PERMISSIONS.ORDERS_VIEW, PERMISSIONS.ORDERS_MANAGE], 'kitchen');
const viewer = actor(ROLES.STAFF, [PERMISSIONS.ORDERS_VIEW], 'viewer');
const customer = actor(ROLES.CUSTOMER, [], 'cust');
const stranger = actor(ROLES.CUSTOMER, [], 'stranger');
const rider = actor(ROLES.DELIVERY_PARTNER, [PERMISSIONS.DELIVERY_FULFILL], 'rider');
const otherRider = actor(ROLES.DELIVERY_PARTNER, [PERMISSIONS.DELIVERY_FULFILL], 'rider2');

const decide = (from: OrderStatus, to: OrderStatus, who: Actor, access = order) =>
  authorizeTransition({ from, to, actor: who, order: access });

describe('state machine legality', () => {
  it('follows the documented forward path for the kitchen', () => {
    expect(decide(S.PLACED, S.CONFIRMED, kitchen).allowed).toBe(true);
    expect(decide(S.CONFIRMED, S.PREPARING, kitchen).allowed).toBe(true);
    expect(decide(S.PREPARING, S.READY_FOR_PICKUP, kitchen).allowed).toBe(true);
  });

  it('rejects skipping steps and going backwards with 409', () => {
    for (const [from, to] of [
      [S.PLACED, S.PREPARING],
      [S.PLACED, S.READY_FOR_PICKUP],
      [S.CONFIRMED, S.PLACED],
      [S.PREPARING, S.CONFIRMED],
      [S.READY_FOR_PICKUP, S.CANCELLED],
    ] as const) {
      const d = decide(from, to, owner);
      expect(d.allowed).toBe(false);
      if (!d.allowed) expect(d.statusCode).toBe(409);
    }
  });

  it('treats DELIVERED and CANCELLED as final', () => {
    for (const from of [S.DELIVERED, S.CANCELLED]) {
      for (const to of Object.values(S)) {
        expect(decide(from, to, owner).allowed).toBe(false);
      }
    }
  });
});

describe('who may move the kitchen states', () => {
  it('needs orders.manage — view-only staff and customers are refused', () => {
    const d = decide(S.PLACED, S.CONFIRMED, viewer);
    expect(d).toMatchObject({ allowed: false, statusCode: 403 });
    expect(decide(S.PLACED, S.CONFIRMED, customer)).toMatchObject({ allowed: false, statusCode: 403 });
    expect(decide(S.PLACED, S.CONFIRMED, rider)).toMatchObject({ allowed: false, statusCode: 403 });
  });

  it('lets the owner do it', () => {
    expect(decide(S.PLACED, S.CONFIRMED, owner).allowed).toBe(true);
  });
});

describe('cancellation', () => {
  it('lets a customer cancel their own order only before preparation starts', () => {
    expect(decide(S.PLACED, S.CANCELLED, customer).allowed).toBe(true);
    expect(decide(S.CONFIRMED, S.CANCELLED, customer).allowed).toBe(true);
    expect(decide(S.PREPARING, S.CANCELLED, customer)).toMatchObject({ allowed: false, statusCode: 403 });
  });

  it("never lets someone cancel another customer's order", () => {
    expect(decide(S.PLACED, S.CANCELLED, stranger)).toMatchObject({ allowed: false, statusCode: 403 });
  });

  it('lets the owner and orders.manage staff cancel through PREPARING', () => {
    for (const from of [S.PLACED, S.CONFIRMED, S.PREPARING]) {
      expect(decide(from, S.CANCELLED, owner).allowed).toBe(true);
      expect(decide(from, S.CANCELLED, kitchen).allowed).toBe(true);
    }
    expect(decide(S.PLACED, S.CANCELLED, viewer).allowed).toBe(false);
  });

  it('cannot cancel once the order is out for delivery', () => {
    expect(decide(S.OUT_FOR_DELIVERY, S.CANCELLED, owner)).toMatchObject({ allowed: false, statusCode: 409 });
  });
});

describe('delivery leg', () => {
  it('belongs to the assigned rider (or the owner as an override)', () => {
    expect(decide(S.READY_FOR_PICKUP, S.OUT_FOR_DELIVERY, rider).allowed).toBe(true);
    expect(decide(S.OUT_FOR_DELIVERY, S.DELIVERED, rider).allowed).toBe(true);
    expect(decide(S.OUT_FOR_DELIVERY, S.DELIVERED, owner).allowed).toBe(true);
  });

  it('refuses a different rider, kitchen staff and the customer', () => {
    for (const who of [otherRider, kitchen, customer]) {
      expect(decide(S.OUT_FOR_DELIVERY, S.DELIVERED, who)).toMatchObject({ allowed: false, statusCode: 403 });
    }
  });

  it('refuses everyone when nobody is assigned, except the owner', () => {
    const unassigned: OrderAccess = { customerId: 'cust', assignedPartnerId: null };
    expect(decide(S.READY_FOR_PICKUP, S.OUT_FOR_DELIVERY, rider, unassigned).allowed).toBe(false);
    expect(decide(S.READY_FOR_PICKUP, S.OUT_FOR_DELIVERY, owner, unassigned).allowed).toBe(true);
  });
});

describe('canViewOrder', () => {
  it('allows the customer, queue staff and the assigned rider', () => {
    expect(canViewOrder(customer, order)).toBe(true);
    expect(canViewOrder(viewer, order)).toBe(true);
    expect(canViewOrder(kitchen, order)).toBe(true);
    expect(canViewOrder(rider, order)).toBe(true);
  });

  it('hides it from other customers and other riders', () => {
    expect(canViewOrder(stranger, order)).toBe(false);
    expect(canViewOrder(otherRider, order)).toBe(false);
  });
});
