import { Prisma } from '@prisma/client';
import { ORDER_STATUS, ROLES, TERMINAL_STATUSES, type OrderStatus, type ReportSummaryDTO } from '@foodbowl/shared';
import { prisma } from '../../db/prisma';
import { dec, fmt } from '../../lib/money';

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The numbers behind the owner's overview. "Revenue" is cash actually
 * collected: the total of DELIVERED orders (cancelled and in-flight orders
 * never count). All day boundaries are UTC — there is no restaurant timezone
 * setting in v1.
 */
export async function getSummary(now = new Date()): Promise<ReportSummaryDTO> {
  const startOfToday = new Date(`${isoDay(now)}T00:00:00.000Z`);
  const weekStart = new Date(startOfToday.getTime() - 6 * DAY_MS);
  const monthStart = new Date(startOfToday.getTime() - 29 * DAY_MS);

  const [daily, active, top, items, availableItems, staff] = await Promise.all([
    prisma.$queryRaw<{ day: Date; orders: number; revenue: Prisma.Decimal; delivered: number; cancelled: number }[]>(Prisma.sql`
      SELECT date_trunc('day', "placedAt" AT TIME ZONE 'UTC')::date AS day,
             count(*)::int AS orders,
             COALESCE(sum(total) FILTER (WHERE status = 'DELIVERED'), 0) AS revenue,
             (count(*) FILTER (WHERE status = 'DELIVERED'))::int AS delivered,
             (count(*) FILTER (WHERE status = 'CANCELLED'))::int AS cancelled
      FROM orders
      WHERE "placedAt" >= ${weekStart}
      GROUP BY 1
      ORDER BY 1`),
    prisma.order.groupBy({
      by: ['status'],
      where: { status: { notIn: TERMINAL_STATUSES } },
      _count: { _all: true },
    }),
    prisma.orderItem.groupBy({
      by: ['nameSnapshot'],
      where: { order: { status: ORDER_STATUS.DELIVERED, placedAt: { gte: monthStart } } },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    }),
    prisma.menuItem.count(),
    prisma.menuItem.count({ where: { isAvailable: true } }),
    prisma.user.count({ where: { isActive: true, role: { key: ROLES.STAFF } } }),
  ]);

  const byDay = new Map(daily.map((d) => [isoDay(d.day), d]));
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = isoDay(new Date(weekStart.getTime() + i * DAY_MS));
    const row = byDay.get(date);
    return { date, ordersPlaced: row?.orders ?? 0, revenue: fmt(dec(row?.revenue ?? 0)) };
  });
  const today = byDay.get(isoDay(startOfToday));

  const order: OrderStatus[] = ['PLACED', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];
  return {
    generatedAt: now.toISOString(),
    today: {
      ordersPlaced: today?.orders ?? 0,
      ordersDelivered: today?.delivered ?? 0,
      ordersCancelled: today?.cancelled ?? 0,
      revenue: fmt(dec(today?.revenue ?? 0)),
    },
    last7Days,
    activeByStatus: order.map((status) => ({
      status,
      count: active.find((a) => a.status === status)?._count._all ?? 0,
    })),
    topItems: top.map((t) => ({
      name: t.nameSnapshot,
      quantity: t._sum.quantity ?? 0,
      revenue: fmt(dec(t._sum.lineTotal ?? 0)),
    })),
    menu: { items, available: availableItems },
    staff: { active: staff },
  };
}
