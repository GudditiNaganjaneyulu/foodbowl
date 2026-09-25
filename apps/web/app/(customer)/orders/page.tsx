'use client';

import Link from 'next/link';
import { ChevronRight, ClipboardList } from 'lucide-react';
import { TERMINAL_STATUSES } from '@foodbowl/shared';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth-context';
import { formatDateTime, money } from '@/lib/format';
import { useMyOrders } from '@/lib/use-orders';

export default function OrderHistoryPage() {
  const { user, isLoading } = useAuth();
  const { orders, error } = useMyOrders();

  if (isLoading) return <div className="container py-24" />;

  if (!user) {
    return (
      <div className="container flex flex-col items-center gap-3 py-24 text-center text-muted-foreground">
        <ClipboardList className="h-10 w-10" />
        <p>Log in to see your orders and track them live.</p>
        <Button asChild className="mt-2">
          <Link href="/login?next=/orders">Log in</Link>
        </Button>
      </div>
    );
  }

  const active = orders?.filter((o) => !TERMINAL_STATUSES.includes(o.status)) ?? [];
  const past = orders?.filter((o) => TERMINAL_STATUSES.includes(o.status)) ?? [];

  return (
    <div className="container flex max-w-2xl flex-col gap-6 py-6">
      <h1 className="text-xl font-semibold">Your orders</h1>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!orders && !error && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {orders?.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
          <ClipboardList className="h-10 w-10" />
          <p>You haven't ordered yet.</p>
          <Button asChild>
            <Link href="/">Browse the menu</Link>
          </Button>
        </div>
      )}

      {active.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">In progress</h2>
          {active.map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
        </section>
      )}
      {past.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Past orders</h2>
          {past.map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
        </section>
      )}
    </div>
  );
}

function OrderRow({ order }: { order: import('@foodbowl/shared').OrderDTO }) {
  const summary = order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ');
  return (
    <Link href={`/orders/${order.id}`} data-testid="order-row">
      <Card className="transition-colors hover:bg-accent/40">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{order.orderNumber}</span>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">{summary}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatDateTime(order.placedAt)} · {money(order.total)}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}
