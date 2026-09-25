import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { REALTIME, type NotificationDTO, type NotificationListDTO, type OrderDTO } from '@foodbowl/shared';
import type { FastifyInstance } from 'fastify';
import { settleNotifications } from '../src/modules/notifications/notification.service';
import { deleteSince, resetBaseline } from './cleanup';
import { ACCOUNTS, SEED, describeDb, login, type Session } from './helpers';

let app: FastifyInstance;
let prisma: typeof import('../src/db/prisma').prisma;
let owner: Session, kitchen: Session, dispatcher: Session, rider1: Session, c1: Session, c2: Session;
let addressId: string;
const createdOrderIds: string[] = [];
const startedAt = new Date();

async function newOrder(): Promise<OrderDTO> {
  await c1.req('DELETE', '/api/v1/cart');
  await c1.req('POST', '/api/v1/cart/items', { menuItemId: SEED.springRolls });
  const res = await c1.req('POST', '/api/v1/orders', { addressId });
  createdOrderIds.push(res.body.id);
  return res.body;
}
const inbox = async (s: Session, query = '') => (await s.req('GET', `/api/v1/notifications/me${query}`)).body as NotificationListDTO;
const typesFor = async (s: Session) => (await inbox(s)).items.map((n) => n.type);

describeDb('notifications (needs TEST_DATABASE_URL)', () => {
  beforeAll(async () => {
    const { buildApp } = await import('../src/app');
    ({ prisma } = await import('../src/db/prisma'));
    await resetBaseline(prisma);
    app = await buildApp();
    await app.ready();
    [owner, kitchen, dispatcher, rider1, c1, c2] = await Promise.all([
      login(app, ACCOUNTS.owner),
      login(app, ACCOUNTS.staffOrders),
      login(app, ACCOUNTS.staffMenu),
      login(app, ACCOUNTS.delivery1),
      login(app, ACCOUNTS.customer1),
      login(app, ACCOUNTS.customer2),
    ]);
    addressId = (await c1.req('POST', '/api/v1/users/me/addresses', {
      label: 'Test', line1: '1 Test St', city: 'Testville', state: 'TS', postalCode: '12345',
    })).body.id;
  });

  afterAll(async () => {
    await settleNotifications();
    await prisma.cartItem.deleteMany({ where: { cart: { userId: c1.userId } } });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    await prisma.address.delete({ where: { id: addressId } });
    await deleteSince(prisma, startedAt);
    await app.close();
  });

  it('requires authentication', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/notifications/me' })).statusCode).toBe(401);
  });

  it('tells the customer and the restaurant when an order is placed', async () => {
    const order = await newOrder();
    await settleNotifications();

    const mine = (await inbox(c1)).items.find((n) => n.metadata.orderId === order.id)!;
    expect(mine).toMatchObject({ type: 'order.placed', isRead: false });
    expect(mine.title).toContain(order.orderNumber);
    expect(mine.metadata).toMatchObject({ orderNumber: order.orderNumber, status: 'PLACED' });

    // The owner and both seeded staff hold orders.view; the customer's neighbour does not.
    for (const staff of [owner, kitchen, dispatcher]) {
      expect((await inbox(staff)).items.some((n) => n.type === 'order.new' && n.metadata.orderId === order.id)).toBe(true);
    }
    expect((await inbox(c2)).items.some((n) => n.metadata.orderId === order.id)).toBe(false);
    expect((await inbox(rider1)).items.some((n) => n.metadata.orderId === order.id)).toBe(false);
  });

  it('keeps the customer informed at each status', async () => {
    const order = await newOrder();
    await kitchen.req('PATCH', `/api/v1/orders/${order.id}/status`, { status: 'CONFIRMED' });
    await kitchen.req('PATCH', `/api/v1/orders/${order.id}/status`, { status: 'PREPARING' });
    await settleNotifications();
    const forOrder = (await inbox(c1)).items.filter((n) => n.metadata.orderId === order.id);
    expect(forOrder.map((n) => n.type).sort()).toEqual(['order.placed', 'order.status_changed', 'order.status_changed']);
    expect(forOrder.filter((n) => n.type === 'order.status_changed').map((n) => n.metadata.to).sort()).toEqual(['CONFIRMED', 'PREPARING']);
  });

  it("doesn't notify customers about their own cancellation, but does tell the restaurant", async () => {
    const order = await newOrder();
    await settleNotifications();
    const before = (await inbox(c1)).items.filter((n) => n.metadata.orderId === order.id).length;

    await c1.req('POST', `/api/v1/orders/${order.id}/cancel`, { reason: 'Changed my mind' });
    await settleNotifications();
    expect((await inbox(c1)).items.filter((n) => n.metadata.orderId === order.id)).toHaveLength(before);
    const staffSide = (await inbox(owner)).items.find((n) => n.type === 'order.cancelled' && n.metadata.orderId === order.id);
    expect(staffSide?.body).toContain('Changed my mind');
  });

  it('tells the customer when the restaurant cancels, with the reason', async () => {
    const order = await newOrder();
    await owner.req('POST', `/api/v1/orders/${order.id}/cancel`, { reason: 'Kitchen closed early' });
    await settleNotifications();
    const n = (await inbox(c1)).items.find((x) => x.metadata.orderId === order.id && x.metadata.to === 'CANCELLED')!;
    expect(n.body).toContain('Kitchen closed early');
    expect((await inbox(owner)).items.some((x) => x.type === 'order.cancelled' && x.metadata.orderId === order.id)).toBe(false);
  });

  it('drives the delivery notifications: offered, declined, ready, on its way, delivered', async () => {
    const order = await newOrder();
    await kitchen.req('PATCH', `/api/v1/orders/${order.id}/status`, { status: 'CONFIRMED' });

    const offered = (await dispatcher.req('POST', '/api/v1/delivery/assignments', { orderId: order.id, deliveryPartnerId: rider1.userId })).body as OrderDTO;
    await settleNotifications();
    const offer = (await inbox(rider1)).items.find((n) => n.type === 'delivery.offered' && n.metadata.orderId === order.id)!;
    expect(offer.body).toContain('1 Test St');
    expect(offer.body).toContain('$8.49');

    await rider1.req('PATCH', `/api/v1/delivery/assignments/${offered.delivery!.id}/reject`, { reason: 'Too far' });
    await settleNotifications();
    const declined = (await inbox(dispatcher)).items.find((n) => n.type === 'delivery.rejected' && n.metadata.orderId === order.id)!;
    expect(declined.body).toContain('Too far');

    await dispatcher.req('POST', '/api/v1/delivery/assignments', { orderId: order.id, deliveryPartnerId: rider1.userId });
    await rider1.req('PATCH', `/api/v1/delivery/assignments/${offered.delivery!.id}/accept`);
    await kitchen.req('PATCH', `/api/v1/orders/${order.id}/status`, { status: 'PREPARING' });
    await kitchen.req('PATCH', `/api/v1/orders/${order.id}/status`, { status: 'READY_FOR_PICKUP' });
    await settleNotifications();
    expect((await typesFor(rider1))).toContain('delivery.ready');

    await rider1.req('PATCH', `/api/v1/delivery/assignments/${offered.delivery!.id}/picked-up`);
    await rider1.req('PATCH', `/api/v1/delivery/assignments/${offered.delivery!.id}/delivered`, { codCollected: true });
    await settleNotifications();

    const customerTitles = (await inbox(c1)).items.filter((n) => n.metadata.orderId === order.id).map((n) => n.metadata.to ?? n.type);
    expect(customerTitles).toEqual(expect.arrayContaining(['OUT_FOR_DELIVERY', 'DELIVERED']));
    const onItsWay = (await inbox(c1)).items.find((n) => n.metadata.to === 'OUT_FOR_DELIVERY' && n.metadata.orderId === order.id)!;
    expect(onItsWay.body).toContain('Delivery Dev');
    const done = (await inbox(owner)).items.find((n) => n.type === 'delivery.completed' && n.metadata.orderId === order.id)!;
    expect(done.body).toContain('Delivery Dev');
  });

  it('warns the assigned rider when an order is cancelled', async () => {
    const order = await newOrder();
    await kitchen.req('PATCH', `/api/v1/orders/${order.id}/status`, { status: 'CONFIRMED' });
    await dispatcher.req('POST', '/api/v1/delivery/assignments', { orderId: order.id, deliveryPartnerId: rider1.userId });
    await owner.req('POST', `/api/v1/orders/${order.id}/cancel`, { reason: 'x' });
    await settleNotifications();
    expect((await inbox(rider1)).items.some((n) => n.type === 'delivery.cancelled' && n.metadata.orderId === order.id)).toBe(true);
  });

  describe('reading and marking', () => {
    it('counts unread, filters, and marks one or all as read', async () => {
      await newOrder();
      await settleNotifications();
      const all = await inbox(c1);
      expect(all.unreadCount).toBeGreaterThan(0);

      const unread = await inbox(c1, '?unread=true&limit=2');
      expect(unread.items.length).toBeLessThanOrEqual(2);
      expect(unread.items.every((n) => !n.isRead)).toBe(true);

      const target = all.items[0]!;
      const one = await c1.req('PATCH', `/api/v1/notifications/${target.id}/read`);
      expect(one.body).toMatchObject({ id: target.id, isRead: true });
      expect((await inbox(c1)).unreadCount).toBe(all.unreadCount - 1);

      const bulk = await c1.req('POST', '/api/v1/notifications/read-all');
      expect(bulk.body).toMatchObject({ ok: true, updated: all.unreadCount - 1 });
      expect((await inbox(c1)).unreadCount).toBe(0);
      expect((await inbox(c1, '?unread=true')).items).toEqual([]);
    });

    it("never reveals or modifies someone else's notifications", async () => {
      await newOrder();
      await settleNotifications();
      const theirs = (await inbox(c1)).items[0]!;
      expect((await c2.req('PATCH', `/api/v1/notifications/${theirs.id}/read`)).status).toBe(404);
      expect((await c1.req('PATCH', '/api/v1/notifications/does-not-exist/read')).status).toBe(404);
      expect((await c1.req('GET', '/api/v1/notifications/me?limit=0')).status).toBe(400);
      const stillUnread = (await inbox(c1)).items.find((n) => n.id === theirs.id)!;
      expect(stillUnread.isRead).toBe(false);
    });
  });

  describe('live delivery', () => {
    let socket: Socket | undefined;
    afterAll(() => socket?.disconnect());

    it('pushes notification:new to the recipient as it is created', async () => {
      await app.listen({ port: 0, host: '127.0.0.1' });
      const addr = app.server.address();
      const url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}${REALTIME.NAMESPACE}`;
      socket = connect(url, { auth: { token: c1.token }, transports: ['websocket'], reconnection: false });
      await new Promise<void>((resolve, reject) => {
        socket!.on('connect', () => resolve());
        socket!.on('connect_error', reject);
      });

      const pushed = new Promise<NotificationDTO>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('no notification:new within 3s')), 3000);
        socket!.once(REALTIME.EVENTS.NOTIFICATION, (n: NotificationDTO) => {
          clearTimeout(t);
          resolve(n);
        });
      });
      const order = await newOrder();
      const n = await pushed;
      expect(n).toMatchObject({ type: 'order.placed', isRead: false });
      expect(n.metadata.orderId).toBe(order.id);
    });
  });
});
