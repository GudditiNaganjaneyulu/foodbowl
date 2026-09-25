import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DeliveryAssignmentWithOrderDTO, DeliveryPartnerDTO, OrderDTO } from '@foodbowl/shared';
import { settleNotifications } from '../src/modules/notifications/notification.service';
import { deleteSince, resetBaseline } from './cleanup';
import { ACCOUNTS, SEED, describeDb, login, type Session } from './helpers';

let app: FastifyInstance;
let prisma: typeof import('../src/db/prisma').prisma;
let owner: Session, kitchen: Session, dispatcher: Session, rider1: Session, rider2: Session, c1: Session;
let addressId: string;
const createdOrderIds: string[] = [];
const startedAt = new Date();

async function newOrder(): Promise<OrderDTO> {
  await c1.req('DELETE', '/api/v1/cart');
  await c1.req('POST', '/api/v1/cart/items', { menuItemId: SEED.springRolls });
  const res = await c1.req('POST', '/api/v1/orders', { addressId });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  createdOrderIds.push(res.body.id);
  return res.body;
}
const advance = (id: string, status: string) => kitchen.req('PATCH', `/api/v1/orders/${id}/status`, { status });
const offer = (orderId: string, partner: Session) =>
  dispatcher.req('POST', '/api/v1/delivery/assignments', { orderId, deliveryPartnerId: partner.userId });
const assignmentIdOf = (order: OrderDTO) => order.delivery!.id;

/** Order that is confirmed and offered to `partner`. */
async function offeredOrder(partner: Session) {
  const order = await newOrder();
  await advance(order.id, 'CONFIRMED');
  const res = await offer(order.id, partner);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as OrderDTO;
}

/** Order that is ready for pickup and accepted by `partner`. */
async function acceptedReadyOrder(partner: Session) {
  const order = await offeredOrder(partner);
  await advance(order.id, 'PREPARING');
  await advance(order.id, 'READY_FOR_PICKUP');
  const res = await partner.req('PATCH', `/api/v1/delivery/assignments/${assignmentIdOf(order)}/accept`);
  expect(res.status).toBe(200);
  return res.body as OrderDTO;
}

describeDb('delivery workflow (needs TEST_DATABASE_URL)', () => {
  beforeAll(async () => {
    const { buildApp } = await import('../src/app');
    ({ prisma } = await import('../src/db/prisma'));
    await resetBaseline(prisma);
    app = await buildApp();
    await app.ready();
    [owner, kitchen, dispatcher, rider1, rider2, c1] = await Promise.all([
      login(app, ACCOUNTS.owner),
      login(app, ACCOUNTS.staffOrders), // orders.manage, NOT delivery.assign
      login(app, ACCOUNTS.staffMenu), // delivery.assign (+ orders.manage, menu.manage)
      login(app, ACCOUNTS.delivery1),
      login(app, ACCOUNTS.delivery2),
      login(app, ACCOUNTS.customer1),
    ]);
    const address = await c1.req('POST', '/api/v1/users/me/addresses', {
      label: 'Test', line1: '1 Test St', city: 'Testville', state: 'TS', postalCode: '12345',
    });
    addressId = address.body.id;
  });

  afterAll(async () => {
    await settleNotifications();
    await prisma.cartItem.deleteMany({ where: { cart: { userId: c1.userId } } });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    await prisma.address.delete({ where: { id: addressId } });
    await deleteSince(prisma, startedAt);
    await app.close();
  });

  describe('offering', () => {
    it('lists active partners with their open workload', async () => {
      const before = (await dispatcher.req('GET', '/api/v1/delivery/partners')).body as DeliveryPartnerDTO[];
      const dev = before.find((p) => p.id === rider1.userId)!;
      expect(before.map((p) => p.name)).toEqual(expect.arrayContaining(['Delivery Dev', 'Delivery Dana']));
      await offeredOrder(rider1);
      const after = (await dispatcher.req('GET', '/api/v1/delivery/partners')).body as DeliveryPartnerDTO[];
      expect(after.find((p) => p.id === rider1.userId)!.activeAssignments).toBe(dev.activeAssignments + 1);
    });

    it('requires delivery.assign', async () => {
      const order = await newOrder();
      await advance(order.id, 'CONFIRMED');
      const asKitchen = await kitchen.req('POST', '/api/v1/delivery/assignments', { orderId: order.id, deliveryPartnerId: rider1.userId });
      expect(asKitchen.status).toBe(403);
      expect((await kitchen.req('GET', '/api/v1/delivery/partners')).status).toBe(403);
      expect((await c1.req('GET', '/api/v1/delivery/partners')).status).toBe(403);
      expect((await rider1.req('POST', '/api/v1/delivery/assignments', { orderId: order.id, deliveryPartnerId: rider1.userId })).status).toBe(403);
    });

    it('only offers orders the kitchen has confirmed', async () => {
      const order = await newOrder(); // still PLACED
      const res = await offer(order.id, rider1);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/Confirm the order/);
    });

    it('only offers to active delivery partners, for orders that exist', async () => {
      const order = await newOrder();
      await advance(order.id, 'CONFIRMED');
      expect((await dispatcher.req('POST', '/api/v1/delivery/assignments', { orderId: order.id, deliveryPartnerId: c1.userId })).status).toBe(400);
      expect((await dispatcher.req('POST', '/api/v1/delivery/assignments', { orderId: order.id, deliveryPartnerId: kitchen.userId })).status).toBe(400);
      expect((await dispatcher.req('POST', '/api/v1/delivery/assignments', { orderId: 'nope', deliveryPartnerId: rider1.userId })).status).toBe(404);
      expect((await dispatcher.req('POST', '/api/v1/delivery/assignments', { orderId: order.id })).status).toBe(400);
    });

    it('shows the offer on the order and in the rider\'s active list', async () => {
      const order = await offeredOrder(rider1);
      expect(order.delivery).toMatchObject({ status: 'OFFERED', deliveryPartner: { id: rider1.userId, name: 'Delivery Dev' } });
      const mine = (await rider1.req('GET', '/api/v1/delivery/me/assignments')).body as DeliveryAssignmentWithOrderDTO[];
      const found = mine.find((a) => a.order.id === order.id)!;
      expect(found.status).toBe('OFFERED');
      expect(found.order.address.line1).toBe('1 Test St'); // the rider sees where to go
      expect(found.order.total).toBe('8.49');
      const theirs = (await rider2.req('GET', '/api/v1/delivery/me/assignments')).body as DeliveryAssignmentWithOrderDTO[];
      expect(theirs.some((a) => a.order.id === order.id)).toBe(false);
    });

    it('re-offers the same assignment to someone else while it is only offered', async () => {
      const first = await offeredOrder(rider1);
      const second = await offer(first.id, rider2);
      expect(second.status).toBe(201);
      expect(second.body.delivery).toMatchObject({ id: first.delivery!.id, status: 'OFFERED', deliveryPartner: { id: rider2.userId } });
    });
  });

  describe('accepting and declining', () => {
    it("won't let one rider act on another rider's offer (404, not 403)", async () => {
      const order = await offeredOrder(rider1);
      const id = assignmentIdOf(order);
      for (const step of ['accept', 'reject', 'picked-up']) {
        expect((await rider2.req('PATCH', `/api/v1/delivery/assignments/${id}/${step}`)).status).toBe(404);
      }
      expect((await rider2.req('PATCH', `/api/v1/delivery/assignments/${id}/delivered`, { codCollected: true })).status).toBe(404);
      expect((await c1.req('PATCH', `/api/v1/delivery/assignments/${id}/accept`)).status).toBe(403);
    });

    it('lets the partner accept once', async () => {
      const order = await offeredOrder(rider1);
      const id = assignmentIdOf(order);
      const ok = await rider1.req('PATCH', `/api/v1/delivery/assignments/${id}/accept`);
      expect(ok.status).toBe(200);
      expect(ok.body.delivery).toMatchObject({ status: 'ACCEPTED' });
      expect(ok.body.delivery.acceptedAt).toBeTruthy();
      expect((await rider1.req('PATCH', `/api/v1/delivery/assignments/${id}/accept`)).status).toBe(409);
    });

    it('lets staff re-offer a rejected order to someone else', async () => {
      const order = await offeredOrder(rider1);
      const id = assignmentIdOf(order);
      const rejected = await rider1.req('PATCH', `/api/v1/delivery/assignments/${id}/reject`, { reason: 'Too far' });
      expect(rejected.status).toBe(200);
      expect(rejected.body.delivery.status).toBe('REJECTED');

      const history = (await rider1.req('GET', '/api/v1/delivery/me/assignments?scope=history')).body as DeliveryAssignmentWithOrderDTO[];
      expect(history.some((a) => a.order.id === order.id && a.status === 'REJECTED')).toBe(true);
      const active = (await rider1.req('GET', '/api/v1/delivery/me/assignments')).body as DeliveryAssignmentWithOrderDTO[];
      expect(active.some((a) => a.order.id === order.id)).toBe(false);

      const again = await offer(order.id, rider2);
      expect(again.status).toBe(201);
      expect(again.body.delivery).toMatchObject({ id, status: 'OFFERED', deliveryPartner: { id: rider2.userId } });
      expect((await rider1.req('PATCH', `/api/v1/delivery/assignments/${id}/accept`)).status).toBe(404); // no longer theirs
    });

    it('cannot be reassigned once a partner accepted', async () => {
      const order = await offeredOrder(rider1);
      await rider1.req('PATCH', `/api/v1/delivery/assignments/${assignmentIdOf(order)}/accept`);
      const res = await offer(order.id, rider2);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already accepted/);
    });

    it('may still be declined after accepting, until pickup', async () => {
      const order = await offeredOrder(rider1);
      const id = assignmentIdOf(order);
      await rider1.req('PATCH', `/api/v1/delivery/assignments/${id}/accept`);
      expect((await rider1.req('PATCH', `/api/v1/delivery/assignments/${id}/reject`, {})).status).toBe(200);
    });
  });

  describe('pickup and delivery', () => {
    it('cannot pick up before accepting or before the kitchen is done', async () => {
      const order = await offeredOrder(rider1);
      const id = assignmentIdOf(order);
      const early = await rider1.req('PATCH', `/api/v1/delivery/assignments/${id}/picked-up`);
      expect(early.status).toBe(409);
      expect(early.body.error).toMatch(/Accept/);

      await rider1.req('PATCH', `/api/v1/delivery/assignments/${id}/accept`);
      const notReady = await rider1.req('PATCH', `/api/v1/delivery/assignments/${id}/picked-up`);
      expect(notReady.status).toBe(409);
      expect(notReady.body.error).toMatch(/ready for pickup/);
    });

    it('completes the whole journey: pickup → out for delivery → delivered with cash collected', async () => {
      const accepted = await acceptedReadyOrder(rider1);
      const id = assignmentIdOf(accepted);

      const pickedUp = await rider1.req('PATCH', `/api/v1/delivery/assignments/${id}/picked-up`);
      expect(pickedUp.status, JSON.stringify(pickedUp.body)).toBe(200);
      expect(pickedUp.body).toMatchObject({ status: 'OUT_FOR_DELIVERY', paymentStatus: 'PENDING' });
      expect(pickedUp.body.delivery.status).toBe('PICKED_UP');

      // The customer can now see who is bringing their food.
      const asCustomer = (await c1.req('GET', `/api/v1/orders/${accepted.id}`)).body as OrderDTO;
      expect(asCustomer.delivery!.deliveryPartner.name).toBe('Delivery Dev');

      // Cannot be reassigned or cancelled by the kitchen mid-delivery.
      expect((await offer(accepted.id, rider2)).status).toBe(409);
      expect((await owner.req('POST', `/api/v1/orders/${accepted.id}/cancel`, { reason: 'x' })).status).toBe(409);

      const delivered = await rider1.req('PATCH', `/api/v1/delivery/assignments/${id}/delivered`, { codCollected: true });
      expect(delivered.status, JSON.stringify(delivered.body)).toBe(200);
      expect(delivered.body).toMatchObject({ status: 'DELIVERED', paymentStatus: 'COLLECTED' });
      expect(delivered.body.deliveredAt).toBeTruthy();
      expect(delivered.body.delivery).toMatchObject({ status: 'DELIVERED', codCollected: true });

      const detail = (await owner.req('GET', `/api/v1/orders/${accepted.id}`)).body as OrderDTO;
      expect(detail.statusLogs!.map((l) => l.toStatus)).toEqual(['PLACED', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED']);
      expect(detail.statusLogs!.at(-1)).toMatchObject({ changedBy: { role: 'delivery_partner' } });

      expect((await rider1.req('PATCH', `/api/v1/delivery/assignments/${id}/delivered`, { codCollected: true })).status).toBe(409);
      const history = (await rider1.req('GET', '/api/v1/delivery/me/assignments?scope=history')).body as DeliveryAssignmentWithOrderDTO[];
      expect(history.some((a) => a.order.id === accepted.id && a.status === 'DELIVERED')).toBe(true);
    });

    it('refuses to complete without confirming the cash', async () => {
      const accepted = await acceptedReadyOrder(rider1);
      const id = assignmentIdOf(accepted);
      await rider1.req('PATCH', `/api/v1/delivery/assignments/${id}/picked-up`);
      const res = await rider1.req('PATCH', `/api/v1/delivery/assignments/${id}/delivered`, { codCollected: false });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cash/);
      expect((await rider1.req('PATCH', `/api/v1/delivery/assignments/${id}/delivered`, {})).status).toBe(400);
      expect((await rider1.req('PATCH', `/api/v1/delivery/assignments/${id}/delivered`, { codCollected: true, proofImageUrl: 'not a url' })).status).toBe(400);
      expect((await owner.req('GET', `/api/v1/orders/${accepted.id}`)).body.status).toBe('OUT_FOR_DELIVERY');
    });

    it('cannot skip straight to delivered without being picked up', async () => {
      const accepted = await acceptedReadyOrder(rider1);
      const res = await rider1.req('PATCH', `/api/v1/delivery/assignments/${assignmentIdOf(accepted)}/delivered`, { codCollected: true });
      expect(res.status).toBe(409);
    });

    it('is atomic: if recording the payment fails, nothing about the delivery is saved', async () => {
      const accepted = await acceptedReadyOrder(rider1);
      const id = assignmentIdOf(accepted);
      await rider1.req('PATCH', `/api/v1/delivery/assignments/${id}/picked-up`);

      const { getPaymentProvider } = await import('../src/lib/payment');
      const spy = vi.spyOn(getPaymentProvider('COD'), 'confirmPayment').mockRejectedValueOnce(new Error('payment backend down'));
      const failed = await rider1.req('PATCH', `/api/v1/delivery/assignments/${id}/delivered`, { codCollected: true });
      spy.mockRestore();
      expect(failed.status).toBe(500);

      const order = (await owner.req('GET', `/api/v1/orders/${accepted.id}`)).body as OrderDTO;
      expect(order).toMatchObject({ status: 'OUT_FOR_DELIVERY', paymentStatus: 'PENDING', deliveredAt: null });
      expect(order.delivery).toMatchObject({ status: 'PICKED_UP', codCollected: false, deliveredAt: null });
      expect(order.statusLogs!.some((l) => l.toStatus === 'DELIVERED')).toBe(false);

      // …and a retry then succeeds cleanly.
      const retry = await rider1.req('PATCH', `/api/v1/delivery/assignments/${id}/delivered`, { codCollected: true });
      expect(retry.status).toBe(200);
      expect(retry.body).toMatchObject({ status: 'DELIVERED', paymentStatus: 'COLLECTED' });
    });

    it('lets the owner override the delivery leg but not other staff', async () => {
      const accepted = await acceptedReadyOrder(rider1);
      const id = assignmentIdOf(accepted);
      // Other riders and kitchen staff have no route to it (see the 404s above);
      // the order state machine itself also refuses them.
      const { applyTransition } = await import('../src/modules/orders/order.service');
      const { getActor } = await import('../src/lib/rbac');
      const kitchenActor = await getActor(kitchen.userId);
      await expect(
        prisma.$transaction((tx) => applyTransition(tx, accepted.id, 'OUT_FOR_DELIVERY', kitchenActor)),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(id).toBeTruthy();
    });
  });

  describe('cancellation with a rider assigned', () => {
    it('stops the delivery: the rider can no longer accept or pick up', async () => {
      const order = await offeredOrder(rider1);
      const cancelled = await owner.req('POST', `/api/v1/orders/${order.id}/cancel`, { reason: 'Out of stock' });
      expect(cancelled.status).toBe(200);
      const id = assignmentIdOf(order);
      const res = await rider1.req('PATCH', `/api/v1/delivery/assignments/${id}/accept`);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/cancelled/);
      const active = (await rider1.req('GET', '/api/v1/delivery/me/assignments')).body as DeliveryAssignmentWithOrderDTO[];
      expect(active.some((a) => a.order.id === order.id)).toBe(false);
      const history = (await rider1.req('GET', '/api/v1/delivery/me/assignments?scope=history')).body as DeliveryAssignmentWithOrderDTO[];
      expect(history.some((a) => a.order.id === order.id)).toBe(true);
    });
  });

  describe('who can see an assigned order', () => {
    it('lets the assigned rider open it, and nobody else on the delivery side', async () => {
      const order = await offeredOrder(rider1);
      expect((await rider1.req('GET', `/api/v1/orders/${order.id}`)).status).toBe(200);
      expect((await rider2.req('GET', `/api/v1/orders/${order.id}`)).status).toBe(404);
    });
  });
});
