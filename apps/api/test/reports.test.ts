import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ReportSummaryDTO } from '@foodbowl/shared';
import { deleteSince, resetBaseline } from './cleanup';
import { ACCOUNTS, SEED, describeDb, login, type Session } from './helpers';

let app: FastifyInstance;
let prisma: typeof import('../src/db/prisma').prisma;
let owner: Session, kitchen: Session, c1: Session, rider: Session, dispatcher: Session;
let addressId: string;
const createdOrderIds: string[] = [];
const startedAt = new Date();
const summary = async () => (await owner.req('GET', '/api/v1/admin/reports/summary')).body as ReportSummaryDTO;

describeDb('reports (needs TEST_DATABASE_URL)', () => {
  beforeAll(async () => {
    const { buildApp } = await import('../src/app');
    ({ prisma } = await import('../src/db/prisma'));
    await resetBaseline(prisma);
    app = await buildApp();
    await app.ready();
    [owner, kitchen, c1, rider, dispatcher] = await Promise.all([
      login(app, ACCOUNTS.owner), login(app, ACCOUNTS.staffOrders), login(app, ACCOUNTS.customer1),
      login(app, ACCOUNTS.delivery1), login(app, ACCOUNTS.staffMenu),
    ]);
    addressId = (await c1.req('POST', '/api/v1/users/me/addresses', {
      label: 'T', line1: '1 St', city: 'C', state: 'S', postalCode: '1',
    })).body.id;
  });

  afterAll(async () => {
    const { settleNotifications } = await import('../src/modules/notifications/notification.service');
    await settleNotifications();
    await prisma.cartItem.deleteMany({ where: { cart: { userId: c1.userId } } });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    await prisma.address.delete({ where: { id: addressId } });
    await deleteSince(prisma, startedAt);
    await app.close();
  });

  it('is limited to reports.view (the owner), not staff or customers', async () => {
    expect((await kitchen.req('GET', '/api/v1/admin/reports/summary')).status).toBe(403);
    expect((await c1.req('GET', '/api/v1/admin/reports/summary')).status).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/reports/summary' })).statusCode).toBe(401);
    expect((await owner.req('GET', '/api/v1/admin/reports/summary')).status).toBe(200);
  });

  it('returns a well-formed summary with exactly 7 consecutive days ending today', async () => {
    const s = await summary();
    expect(s.last7Days).toHaveLength(7);
    const dates = s.last7Days.map((d) => d.date);
    expect(dates.at(-1)).toBe(new Date().toISOString().slice(0, 10));
    for (let i = 1; i < 7; i++) {
      expect(new Date(dates[i]!).getTime() - new Date(dates[i - 1]!).getTime()).toBe(86_400_000);
    }
    expect(s.activeByStatus.map((a) => a.status)).toEqual(['PLACED', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY']);
    expect(s.menu.items).toBeGreaterThanOrEqual(s.menu.available);
    expect(s.staff.active).toBeGreaterThanOrEqual(2);
    expect(s.today.revenue).toMatch(/^\d+\.\d{2}$/);
  });

  it('counts placed orders immediately but revenue only once cash is collected', async () => {
    const before = await summary();

    await c1.req('DELETE', '/api/v1/cart');
    await c1.req('POST', '/api/v1/cart/items', { menuItemId: SEED.springRolls, quantity: 2 }); // 11.98 + 2.50 fee
    const order = (await c1.req('POST', '/api/v1/orders', { addressId })).body;
    createdOrderIds.push(order.id);

    const placed = await summary();
    expect(placed.today.ordersPlaced).toBe(before.today.ordersPlaced + 1);
    expect(placed.today.revenue).toBe(before.today.revenue); // nothing delivered yet
    expect(placed.activeByStatus.find((a) => a.status === 'PLACED')!.count).toBe(
      before.activeByStatus.find((a) => a.status === 'PLACED')!.count + 1,
    );

    for (const status of ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP']) await kitchen.req('PATCH', `/api/v1/orders/${order.id}/status`, { status });
    const offered = (await dispatcher.req('POST', '/api/v1/delivery/assignments', { orderId: order.id, deliveryPartnerId: rider.userId })).body;
    const id = offered.delivery.id;
    await rider.req('PATCH', `/api/v1/delivery/assignments/${id}/accept`);
    await rider.req('PATCH', `/api/v1/delivery/assignments/${id}/picked-up`);
    await rider.req('PATCH', `/api/v1/delivery/assignments/${id}/delivered`, { codCollected: true });

    const delivered = await summary();
    expect(delivered.today.ordersDelivered).toBe(before.today.ordersDelivered + 1);
    expect(Number(delivered.today.revenue) - Number(before.today.revenue)).toBeCloseTo(14.48, 2);
    expect(delivered.activeByStatus.find((a) => a.status === 'OUT_FOR_DELIVERY')!.count).toBe(
      before.activeByStatus.find((a) => a.status === 'OUT_FOR_DELIVERY')!.count,
    );
    expect(delivered.last7Days.at(-1)!.ordersPlaced).toBe(delivered.today.ordersPlaced);
    expect(delivered.topItems.find((t) => t.name === 'Crispy Spring Rolls')!.quantity).toBeGreaterThanOrEqual(2);
  });

  it('does not count cancelled orders as revenue', async () => {
    const before = await summary();
    await c1.req('DELETE', '/api/v1/cart');
    await c1.req('POST', '/api/v1/cart/items', { menuItemId: SEED.springRolls });
    const order = (await c1.req('POST', '/api/v1/orders', { addressId })).body;
    createdOrderIds.push(order.id);
    await c1.req('POST', `/api/v1/orders/${order.id}/cancel`, { reason: 'test' });
    const after = await summary();
    expect(after.today.ordersCancelled).toBe(before.today.ordersCancelled + 1);
    expect(after.today.revenue).toBe(before.today.revenue);
  });
});
