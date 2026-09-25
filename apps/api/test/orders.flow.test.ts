import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { REALTIME, type CartDTO, type OrderDTO } from '@foodbowl/shared';
import type { FastifyInstance } from 'fastify';
import { settleNotifications } from '../src/modules/notifications/notification.service';
import { deleteSince, resetBaseline } from './cleanup';
import { ACCOUNTS, SEED, describeDb, login, type Session } from './helpers';

let app: FastifyInstance;
let prisma: typeof import('../src/db/prisma').prisma;
let owner: Session, kitchen: Session, viewer: Session, c1: Session, c2: Session;
let c1Address: string;
let c2Address: string;
const createdOrderIds: string[] = [];
const createdAddressIds: string[] = [];
let viewerUserId: string;
const startedAt = new Date();

const addToCart = (s: Session, body: object) => s.req('POST', '/api/v1/cart/items', body);
const emptyCart = (s: Session) => s.req('DELETE', '/api/v1/cart');

async function placeSimpleOrder(s: Session, addressId: string, notes?: string): Promise<OrderDTO> {
  await emptyCart(s);
  await addToCart(s, { menuItemId: SEED.springRolls, quantity: 1 });
  const res = await s.req('POST', '/api/v1/orders', { addressId, notes });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  createdOrderIds.push(res.body.id);
  return res.body;
}

describeDb('cart, checkout and order lifecycle (needs TEST_DATABASE_URL)', () => {
  beforeAll(async () => {
    const { buildApp } = await import('../src/app');
    ({ prisma } = await import('../src/db/prisma'));
    await resetBaseline(prisma);
    app = await buildApp();
    await app.ready();

    [owner, kitchen, c1, c2] = await Promise.all([
      login(app, ACCOUNTS.owner),
      login(app, ACCOUNTS.staffOrders),
      login(app, ACCOUNTS.customer1),
      login(app, ACCOUNTS.customer2),
    ]);

    // A staff account with NO overrides: default staff = orders.view only.
    const email = `viewer-${Date.now()}@test.local`;
    const created = await owner.req('POST', '/api/v1/admin/users', {
      email,
      name: 'View Only',
      role: 'staff',
      temporaryPassword: 'view-only-pass-1',
    });
    expect(created.status).toBe(201);
    viewerUserId = created.body.id;
    viewer = await login(app, email, 'view-only-pass-1');

    const a1 = await c1.req('POST', '/api/v1/users/me/addresses', {
      label: 'Test', line1: '1 Test St', city: 'Testville', state: 'TS', postalCode: '12345',
    });
    const a2 = await c2.req('POST', '/api/v1/users/me/addresses', {
      label: 'Test', line1: '2 Test St', city: 'Testville', state: 'TS', postalCode: '12345',
    });
    c1Address = a1.body.id;
    c2Address = a2.body.id;
    createdAddressIds.push(c1Address, c2Address);
  });

  afterAll(async () => {
    await settleNotifications();
    await owner.req('PATCH', '/api/v1/restaurant', { isOpen: true, minOrderAmount: 5, deliveryFee: 2.5 });
    await prisma.menuItem.update({ where: { id: SEED.springRolls }, data: { isAvailable: true } });
    await prisma.cartItem.deleteMany({ where: { cart: { userId: { in: [c1.userId, c2.userId] } } } });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    await prisma.address.deleteMany({ where: { id: { in: createdAddressIds } } });
    await prisma.userPermission.deleteMany({ where: { userId: viewerUserId } });
    await deleteSince(prisma, startedAt);
    await prisma.user.delete({ where: { id: viewerUserId } });
    await app.close();
  });

  describe('restaurant', () => {
    it('is public and reports fee and minimum', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/restaurant' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toMatchObject({ name: 'FoodBowl Kitchen', deliveryFee: '2.50', minOrderAmount: '5.00' });
    });

    it('can only be changed with restaurant.manage', async () => {
      expect((await kitchen.req('PATCH', '/api/v1/restaurant', { isOpen: false })).status).toBe(403);
      expect((await c1.req('PATCH', '/api/v1/restaurant', { isOpen: false })).status).toBe(403);
      const ok = await owner.req('PATCH', '/api/v1/restaurant', { deliveryFee: 3 });
      expect(ok.body.deliveryFee).toBe('3.00');
      await owner.req('PATCH', '/api/v1/restaurant', { deliveryFee: 2.5 });
    });

    it('validates input', async () => {
      const res = await owner.req('PATCH', '/api/v1/restaurant', { opensAt: '25:99', deliveryFee: -1 });
      expect(res.status).toBe(400);
    });
  });

  describe('cart', () => {
    it('requires authentication', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/cart' });
      expect(res.statusCode).toBe(401);
    });

    it('starts empty', async () => {
      await emptyCart(c1);
      const res = await c1.req('GET', '/api/v1/cart');
      expect(res.body).toEqual({ items: [], itemCount: 0, subtotal: '0.00' });
    });

    it('prices lines server-side and ignores any price the client sends', async () => {
      await emptyCart(c1);
      const res = await addToCart(c1, {
        menuItemId: SEED.butterChicken,
        quantity: 2,
        selectedModifiers: [
          { modifierGroupId: SEED.spiceGroup, modifierId: SEED.spiceHot, priceDelta: -100, name: 'FREE' },
          { modifierGroupId: SEED.addonsGroup, modifierId: SEED.addonExtraChicken },
        ],
        price: 0.01,
      });
      expect(res.status).toBe(200);
      const cart = res.body as CartDTO;
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]).toMatchObject({ unitPrice: '15.49', lineTotal: '30.98', quantity: 2, available: true });
      expect(cart.items[0]!.modifiers.map((m) => m.name).sort()).toEqual(['Extra Chicken', 'Hot']);
      expect(cart.subtotal).toBe('30.98');
      expect(cart.itemCount).toBe(2);
    });

    it('rejects a missing required choice and options from another item', async () => {
      const missing = await addToCart(c1, { menuItemId: SEED.butterChicken, quantity: 1 });
      expect(missing.status).toBe(400);
      expect(missing.body.error).toMatch(/Spice Level/);
      const foreign = await addToCart(c1, {
        menuItemId: SEED.friedRice,
        selectedModifiers: [{ modifierGroupId: SEED.spiceGroup, modifierId: SEED.spiceHot }],
      });
      expect(foreign.status).toBe(400);
    });

    it('merges identical lines and keeps different customizations apart', async () => {
      await emptyCart(c1);
      const hot = { menuItemId: SEED.butterChicken, selectedModifiers: [{ modifierGroupId: SEED.spiceGroup, modifierId: SEED.spiceHot }] };
      const mild = { menuItemId: SEED.butterChicken, selectedModifiers: [{ modifierGroupId: SEED.spiceGroup, modifierId: SEED.spiceMild }] };
      await addToCart(c1, { ...hot, quantity: 1 });
      await addToCart(c1, { ...hot, quantity: 2 });
      const res = await addToCart(c1, { ...mild, quantity: 1 });
      const items = (res.body as CartDTO).items;
      expect(items).toHaveLength(2);
      expect(items.find((i) => i.modifiers[0]?.name === 'Hot')?.quantity).toBe(3);
    });

    it('keeps different special instructions on separate lines, and carries them onto the order', async () => {
      await emptyCart(c1);
      await addToCart(c1, { menuItemId: SEED.springRolls, quantity: 1 });
      await addToCart(c1, { menuItemId: SEED.springRolls, quantity: 1, note: '  Extra crispy, please ' });
      const merged = await addToCart(c1, { menuItemId: SEED.springRolls, quantity: 1, note: 'extra crispy, please' });
      const items = (merged.body as CartDTO).items;
      expect(items).toHaveLength(2); // plain ×1, "extra crispy" ×2
      expect(items.find((i) => i.note)).toMatchObject({ note: 'Extra crispy, please', quantity: 2 });
      expect(items.find((i) => !i.note)).toMatchObject({ quantity: 1 });

      // A blank note clears it (and it then just sits on its own line).
      const lineId = items.find((i) => i.note)!.id;
      const cleared = await c1.req('PATCH', `/api/v1/cart/items/${lineId}`, { note: '   ' });
      expect((cleared.body as CartDTO).items.every((i) => i.note === null)).toBe(true);

      await c1.req('PATCH', `/api/v1/cart/items/${lineId}`, { note: 'Extra crispy, please' });
      const res = await c1.req('POST', '/api/v1/orders', { addressId: c1Address });
      expect(res.status).toBe(201);
      createdOrderIds.push(res.body.id);
      const order = res.body as OrderDTO;
      expect(order.items).toHaveLength(2);
      expect(order.items.map((i) => i.note)).toEqual(expect.arrayContaining([null, 'Extra crispy, please']));
      expect(order.items[0]!.imageUrl).toBe('/menu/crispy-spring-rolls.jpg');
      // …and the kitchen sees it too, not just the customer.
      const forKitchen = (await kitchen.req('GET', `/api/v1/orders/${order.id}`)).body as OrderDTO;
      expect(forKitchen.items.find((i) => i.note)?.note).toBe('Extra crispy, please');
    });

    it('caps a line at 20 and validates quantity', async () => {
      await emptyCart(c1);
      await addToCart(c1, { menuItemId: SEED.springRolls, quantity: 15 });
      const res = await addToCart(c1, { menuItemId: SEED.springRolls, quantity: 15 });
      expect((res.body as CartDTO).items[0]!.quantity).toBe(20);
      expect((await addToCart(c1, { menuItemId: SEED.springRolls, quantity: 0 })).status).toBe(400);
      expect((await addToCart(c1, { menuItemId: SEED.springRolls, quantity: 21 })).status).toBe(400);
    });

    it('updates and removes lines, and hides other users\' lines', async () => {
      await emptyCart(c1);
      const added = (await addToCart(c1, { menuItemId: SEED.springRolls })).body as CartDTO;
      const lineId = added.items[0]!.id;

      const patched = await c1.req('PATCH', `/api/v1/cart/items/${lineId}`, { quantity: 4, note: 'crispy' });
      expect(patched.body.items[0]).toMatchObject({ quantity: 4, note: 'crispy', lineTotal: '23.96' });

      expect((await c2.req('PATCH', `/api/v1/cart/items/${lineId}`, { quantity: 1 })).status).toBe(404);
      expect((await c2.req('DELETE', `/api/v1/cart/items/${lineId}`)).status).toBe(404);
      expect((await c1.req('PATCH', `/api/v1/cart/items/${lineId}`, {})).status).toBe(400);

      const removed = await c1.req('DELETE', `/api/v1/cart/items/${lineId}`);
      expect(removed.body.items).toEqual([]);
    });

    it('rejects unknown items', async () => {
      expect((await addToCart(c1, { menuItemId: 'does-not-exist' })).status).toBe(404);
    });

    it('flags items that become unavailable and excludes them from the subtotal', async () => {
      await emptyCart(c1);
      await addToCart(c1, { menuItemId: SEED.springRolls, quantity: 1 });
      await prisma.menuItem.update({ where: { id: SEED.springRolls }, data: { isAvailable: false } });
      const cart = (await c1.req('GET', '/api/v1/cart')).body as CartDTO;
      expect(cart.items[0]!.available).toBe(false);
      expect(cart).toMatchObject({ subtotal: '0.00', itemCount: 0 });

      const order = await c1.req('POST', '/api/v1/orders', { addressId: c1Address });
      expect(order.status).toBe(409);
      expect(order.body.error).toMatch(/no longer available/);
      await prisma.menuItem.update({ where: { id: SEED.springRolls }, data: { isAvailable: true } });
    });
  });

  describe('placing an order', () => {
    it('snapshots prices, totals correctly and empties the cart', async () => {
      await emptyCart(c1);
      await addToCart(c1, {
        menuItemId: SEED.butterChicken,
        quantity: 2,
        selectedModifiers: [
          { modifierGroupId: SEED.spiceGroup, modifierId: SEED.spiceHot },
          { modifierGroupId: SEED.addonsGroup, modifierId: SEED.addonExtraChicken },
        ],
      });
      await addToCart(c1, { menuItemId: SEED.springRolls, quantity: 1, note: 'x' });

      const res = await c1.req('POST', '/api/v1/orders', { addressId: c1Address, notes: 'Ring twice' });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      createdOrderIds.push(res.body.id);
      const order = res.body as OrderDTO;

      expect(order).toMatchObject({
        status: 'PLACED',
        subtotal: '36.97', // 2 × 15.49 + 5.99
        deliveryFee: '2.50',
        discount: '0.00',
        total: '39.47',
        paymentMethod: 'COD',
        paymentStatus: 'PENDING',
        notes: 'Ring twice',
      });
      expect(order.orderNumber).toMatch(/^FB-\d{6}$/);
      expect(order.items.map((i) => i.name).sort()).toEqual(['Butter Chicken', 'Crispy Spring Rolls']);
      const chicken = order.items.find((i) => i.name === 'Butter Chicken')!;
      expect(chicken).toMatchObject({ unitPrice: '15.49', quantity: 2, lineTotal: '30.98' });
      expect(chicken.modifiers.map((m) => m.name).sort()).toEqual(['Extra Chicken', 'Hot']);

      expect((await c1.req('GET', '/api/v1/cart')).body.items).toEqual([]);

      // Later menu edits must not change what the order says it cost.
      await prisma.menuItem.update({ where: { id: SEED.springRolls }, data: { price: 99 } });
      const again = await c1.req('GET', `/api/v1/orders/${order.id}`);
      await prisma.menuItem.update({ where: { id: SEED.springRolls }, data: { price: 5.99 } });
      expect(again.body.items.find((i: any) => i.name === 'Crispy Spring Rolls').unitPrice).toBe('5.99');

      expect(again.body.statusLogs).toHaveLength(1);
      expect(again.body.statusLogs[0]).toMatchObject({ fromStatus: null, toStatus: 'PLACED', changedBy: { role: 'customer' } });
    });

    it('refuses an empty cart', async () => {
      await emptyCart(c1);
      const res = await c1.req('POST', '/api/v1/orders', { addressId: c1Address });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/empty/);
    });

    it("refuses another user's address and unknown addresses", async () => {
      await emptyCart(c1);
      await addToCart(c1, { menuItemId: SEED.springRolls });
      expect((await c1.req('POST', '/api/v1/orders', { addressId: c2Address })).status).toBe(400);
      expect((await c1.req('POST', '/api/v1/orders', { addressId: 'nope' })).status).toBe(400);
      expect((await c1.req('POST', '/api/v1/orders', {})).status).toBe(400);
    });

    it('enforces the minimum order amount', async () => {
      await emptyCart(c1);
      await addToCart(c1, { menuItemId: SEED.garlicNaan, quantity: 1 }); // 2.99 < 5.00
      const res = await c1.req('POST', '/api/v1/orders', { addressId: c1Address });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/minimum order is \$5\.00/);
    });

    it('refuses orders while the restaurant is closed, then works again once reopened', async () => {
      await emptyCart(c1);
      await addToCart(c1, { menuItemId: SEED.springRolls });
      await owner.req('PATCH', '/api/v1/restaurant', { isOpen: false });
      const closed = await c1.req('POST', '/api/v1/orders', { addressId: c1Address });
      expect(closed.status).toBe(409);
      expect(closed.body.error).toMatch(/closed/);
      expect((await c1.req('GET', '/api/v1/cart')).body.items).toHaveLength(1); // nothing was lost

      await owner.req('PATCH', '/api/v1/restaurant', { isOpen: true });
      const open = await c1.req('POST', '/api/v1/orders', { addressId: c1Address });
      expect(open.status).toBe(201);
      createdOrderIds.push(open.body.id);
    });

    it('uses the current delivery fee', async () => {
      await owner.req('PATCH', '/api/v1/restaurant', { deliveryFee: 4 });
      const order = await placeSimpleOrder(c1, c1Address);
      await owner.req('PATCH', '/api/v1/restaurant', { deliveryFee: 2.5 });
      expect(order).toMatchObject({ deliveryFee: '4.00', total: '9.99' });
    });
  });

  describe('viewing orders', () => {
    it('lists my orders newest first, only mine', async () => {
      const mine = await placeSimpleOrder(c1, c1Address);
      const list = (await c1.req('GET', '/api/v1/orders/me')).body as OrderDTO[];
      expect(list[0]!.id).toBe(mine.id);
      expect(list.every((o) => o.customer.id === c1.userId)).toBe(true);
    });

    it("hides an order from other customers with 404, not 403", async () => {
      const order = await placeSimpleOrder(c1, c1Address);
      expect((await c2.req('GET', `/api/v1/orders/${order.id}`)).status).toBe(404);
      expect((await c1.req('GET', `/api/v1/orders/${order.id}`)).status).toBe(200);
      expect((await c1.req('GET', '/api/v1/orders/does-not-exist')).status).toBe(404);
    });

    it('gives the queue only to staff with orders.view', async () => {
      const order = await placeSimpleOrder(c1, c1Address);
      expect((await c1.req('GET', '/api/v1/orders')).status).toBe(403);
      for (const staff of [kitchen, viewer, owner]) {
        const res = await staff.req('GET', '/api/v1/orders');
        expect(res.status).toBe(200);
        expect((res.body as OrderDTO[]).some((o) => o.id === order.id)).toBe(true);
      }
    });

    it('filters the queue by status and rejects unknown statuses', async () => {
      const bad = await kitchen.req('GET', '/api/v1/orders?status=NOPE');
      expect(bad.status).toBe(400);
      const res = await kitchen.req('GET', '/api/v1/orders?status=DELIVERED,CANCELLED&limit=5');
      expect(res.status).toBe(200);
      expect((res.body as OrderDTO[]).every((o) => ['DELIVERED', 'CANCELLED'].includes(o.status))).toBe(true);
    });
  });

  describe('order lifecycle', () => {
    it('walks the kitchen path and records every step', async () => {
      const order = await placeSimpleOrder(c1, c1Address);
      for (const status of ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP']) {
        const res = await kitchen.req('PATCH', `/api/v1/orders/${order.id}/status`, { status, note: `to ${status}` });
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body.status).toBe(status);
      }
      const detail = (await c1.req('GET', `/api/v1/orders/${order.id}`)).body as OrderDTO;
      expect(detail.statusLogs!.map((l) => l.toStatus)).toEqual(['PLACED', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP']);
      expect(detail.statusLogs![1]).toMatchObject({ fromStatus: 'PLACED', note: 'to CONFIRMED', changedBy: { role: 'staff' } });
    });

    it('rejects skipping steps with 409', async () => {
      const order = await placeSimpleOrder(c1, c1Address);
      const res = await kitchen.req('PATCH', `/api/v1/orders/${order.id}/status`, { status: 'PREPARING' });
      expect(res.status).toBe(409);
    });

    it('does not let the kitchen endpoint deliver an order, or accept junk', async () => {
      const order = await placeSimpleOrder(c1, c1Address);
      expect((await owner.req('PATCH', `/api/v1/orders/${order.id}/status`, { status: 'DELIVERED' })).status).toBe(400);
      expect((await owner.req('PATCH', `/api/v1/orders/${order.id}/status`, { status: 'OUT_FOR_DELIVERY' })).status).toBe(400);
      expect((await owner.req('PATCH', `/api/v1/orders/${order.id}/status`, { status: 'CANCELLED' })).status).toBe(400);
      expect((await owner.req('PATCH', `/api/v1/orders/${order.id}/status`, {})).status).toBe(400);
    });

    it('requires orders.manage to advance an order', async () => {
      const order = await placeSimpleOrder(c1, c1Address);
      expect((await viewer.req('PATCH', `/api/v1/orders/${order.id}/status`, { status: 'CONFIRMED' })).status).toBe(403);
      expect((await c1.req('PATCH', `/api/v1/orders/${order.id}/status`, { status: 'CONFIRMED' })).status).toBe(403);
      expect((await kitchen.req('PATCH', '/api/v1/orders/does-not-exist/status', { status: 'CONFIRMED' })).status).toBe(404);
    });

    it('lets exactly one of two simultaneous updates win', async () => {
      const order = await placeSimpleOrder(c1, c1Address);
      const [a, b] = await Promise.all([
        kitchen.req('PATCH', `/api/v1/orders/${order.id}/status`, { status: 'CONFIRMED' }),
        owner.req('PATCH', `/api/v1/orders/${order.id}/status`, { status: 'CONFIRMED' }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const detail = (await owner.req('GET', `/api/v1/orders/${order.id}`)).body as OrderDTO;
      expect(detail.statusLogs!.filter((l) => l.toStatus === 'CONFIRMED')).toHaveLength(1);
    });

    describe('cancellation', () => {
      it('lets a customer cancel their own PLACED order and records why', async () => {
        const order = await placeSimpleOrder(c1, c1Address);
        const res = await c1.req('POST', `/api/v1/orders/${order.id}/cancel`, { reason: 'Changed my mind' });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 'CANCELLED', cancellationReason: 'Changed my mind' });
        expect(res.body.cancelledAt).toBeTruthy();
      });

      it('requires a reason', async () => {
        const order = await placeSimpleOrder(c1, c1Address);
        expect((await c1.req('POST', `/api/v1/orders/${order.id}/cancel`, {})).status).toBe(400);
      });

      it('lets a customer cancel while CONFIRMED but not once PREPARING', async () => {
        const order = await placeSimpleOrder(c1, c1Address);
        await kitchen.req('PATCH', `/api/v1/orders/${order.id}/status`, { status: 'CONFIRMED' });
        await kitchen.req('PATCH', `/api/v1/orders/${order.id}/status`, { status: 'PREPARING' });
        const late = await c1.req('POST', `/api/v1/orders/${order.id}/cancel`, { reason: 'too slow' });
        expect(late.status).toBe(403);
        expect(late.body.error).toMatch(/already started/);
        // …but the restaurant still can.
        const byOwner = await owner.req('POST', `/api/v1/orders/${order.id}/cancel`, { reason: 'Out of ingredients' });
        expect(byOwner.status).toBe(200);
      });

      it("won't cancel someone else's order or one that is already final", async () => {
        const order = await placeSimpleOrder(c1, c1Address);
        // 404 (not 403): a stranger must not even learn the order exists.
        expect((await c2.req('POST', `/api/v1/orders/${order.id}/cancel`, { reason: 'x' })).status).toBe(404);
        expect((await viewer.req('POST', `/api/v1/orders/${order.id}/cancel`, { reason: 'x' })).status).toBe(403);
        await c1.req('POST', `/api/v1/orders/${order.id}/cancel`, { reason: 'first' });
        expect((await c1.req('POST', `/api/v1/orders/${order.id}/cancel`, { reason: 'again' })).status).toBe(409);
        expect((await kitchen.req('PATCH', `/api/v1/orders/${order.id}/status`, { status: 'CONFIRMED' })).status).toBe(409);
      });
    });
  });

  describe('addresses', () => {
    it('manages default addresses and protects addresses used by orders', async () => {
      const extra = await c2.req('POST', '/api/v1/users/me/addresses', {
        label: 'Second', line1: '9 Other Rd', city: 'X', state: 'Y', postalCode: '1', isDefault: true,
      });
      expect(extra.status).toBe(201);
      createdAddressIds.push(extra.body.id);
      const list = (await c2.req('GET', '/api/v1/users/me/addresses')).body as { id: string; isDefault: boolean }[];
      expect(list.filter((a) => a.isDefault).map((a) => a.id)).toEqual([extra.body.id]);

      const order = await placeSimpleOrder(c2, c2Address);
      expect((await c2.req('DELETE', `/api/v1/users/me/addresses/${c2Address}`)).status).toBe(409);
      expect((await c2.req('PATCH', `/api/v1/users/me/addresses/${c2Address}`, { line1: 'moved' })).status).toBe(409);
      expect((await c2.req('PATCH', `/api/v1/users/me/addresses/${c2Address}`, { isDefault: true })).status).toBe(200);
      expect((await c1.req('DELETE', `/api/v1/users/me/addresses/${c2Address}`)).status).toBe(404);

      await c2.req('POST', `/api/v1/orders/${order.id}/cancel`, { reason: 'done' });
      expect((await c2.req('PATCH', `/api/v1/users/me/addresses/${c2Address}`, { line1: 'moved' })).status).toBe(200);
      expect((await c2.req('DELETE', `/api/v1/users/me/addresses/${extra.body.id}`)).status).toBe(204);
    });
  });

  describe('profile', () => {
    it('returns and updates my profile', async () => {
      const me = await c1.req('GET', '/api/v1/users/me');
      expect(me.body).toMatchObject({ email: ACCOUNTS.customer1, role: 'customer', permissions: [] });
      const upd = await c1.req('PATCH', '/api/v1/users/me', { phone: '+1 555 0100 200' });
      expect(upd.body.phone).toBe('+1 555 0100 200');
      expect((await c1.req('PATCH', '/api/v1/users/me', {})).status).toBe(400);
    });
  });

  describe('realtime', () => {
    let url: string;
    const sockets: Socket[] = [];

    beforeAll(async () => {
      await app.listen({ port: 0, host: '127.0.0.1' });
      const addr = app.server.address();
      url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}${REALTIME.NAMESPACE}`;
    });
    afterAll(() => sockets.forEach((s) => s.disconnect()));

    const open = (token: string) =>
      new Promise<Socket>((resolve, reject) => {
        const s = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
        sockets.push(s);
        s.on('connect', () => resolve(s));
        s.on('connect_error', reject);
      });
    const emitAck = (s: Socket, event: string, ...args: unknown[]) =>
      new Promise<{ ok: boolean; error?: string }>((resolve) => s.emit(event, ...args, resolve));
    const nextEvent = <T,>(s: Socket, event: string, ms = 3000) =>
      new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`no "${event}" within ${ms}ms`)), ms);
        s.once(event, (payload: T) => {
          clearTimeout(t);
          resolve(payload);
        });
      });

    it('rejects a missing or bad token', async () => {
      await expect(open('garbage')).rejects.toThrow(/unauthorized/);
    });

    it('lets only orders.view staff join the queue', async () => {
      const customerSocket = await open(c1.token);
      expect((await emitAck(customerSocket, REALTIME.ACTIONS.JOIN_QUEUE)).ok).toBe(false);
      const staffSocket = await open(viewer.token);
      expect((await emitAck(staffSocket, REALTIME.ACTIONS.JOIN_QUEUE)).ok).toBe(true);
    });

    it("won't let a customer join someone else's order room", async () => {
      const order = await placeSimpleOrder(c1, c1Address);
      const stranger = await open(c2.token);
      expect((await emitAck(stranger, REALTIME.ACTIONS.JOIN_ORDER, order.id)).ok).toBe(false);
      const mine = await open(c1.token);
      expect((await emitAck(mine, REALTIME.ACTIONS.JOIN_ORDER, order.id)).ok).toBe(true);
    });

    it('pushes a new order to the queue and status changes to the customer and queue', async () => {
      await emptyCart(c1);
      await addToCart(c1, { menuItemId: SEED.springRolls });
      const queue = await open(kitchen.token);
      await emitAck(queue, REALTIME.ACTIONS.JOIN_QUEUE);
      const customerSocket = await open(c1.token);

      const placedEvent = nextEvent<OrderDTO>(queue, REALTIME.EVENTS.ORDER_PLACED);
      const placed = await c1.req('POST', '/api/v1/orders', { addressId: c1Address });
      createdOrderIds.push(placed.body.id);
      expect((await placedEvent).id).toBe(placed.body.id);

      await emitAck(customerSocket, REALTIME.ACTIONS.JOIN_ORDER, placed.body.id);
      const customerUpdate = nextEvent<OrderDTO>(customerSocket, REALTIME.EVENTS.ORDER_UPDATED);
      const queueUpdate = nextEvent<OrderDTO>(queue, REALTIME.EVENTS.ORDER_UPDATED);
      await kitchen.req('PATCH', `/api/v1/orders/${placed.body.id}/status`, { status: 'CONFIRMED' });
      const [forCustomer, forQueue] = await Promise.all([customerUpdate, queueUpdate]);
      expect(forCustomer).toMatchObject({ id: placed.body.id, status: 'CONFIRMED' });
      expect(forCustomer.statusLogs!.map((l) => l.toStatus)).toEqual(['PLACED', 'CONFIRMED']);
      expect(forQueue.status).toBe('CONFIRMED');
    });

    it('does not leak one customer\'s order updates to another customer', async () => {
      const order = await placeSimpleOrder(c1, c1Address);
      const other = await open(c2.token);
      let leaked = false;
      other.on(REALTIME.EVENTS.ORDER_UPDATED, () => (leaked = true));
      other.on(REALTIME.EVENTS.ORDER_PLACED, () => (leaked = true));
      await kitchen.req('PATCH', `/api/v1/orders/${order.id}/status`, { status: 'CONFIRMED' });
      await new Promise((r) => setTimeout(r, 400));
      expect(leaked).toBe(false);
    });
  });
});

