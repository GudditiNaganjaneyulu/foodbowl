'use client';

import * as React from 'react';
import { Clock, MapPin, Radio, Truck } from 'lucide-react';
import { REALTIME, type DeliveryPartnerDTO, type OrderDTO } from '@foodbowl/shared';
import { AssignRider } from '@/components/delivery/assign-rider';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/api-client';
import { money, timeAgo } from '@/lib/format';
import { useSocket, useSocketEvent } from '@/lib/socket';
import { useNow } from '@/lib/use-now';
import { useOrderQueue } from '@/lib/use-order-queue';
import { cn } from '@/lib/utils';

const NEEDS_RIDER = ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'];

/**
 * Dispatch screen: which orders still need a delivery partner, which offers
 * are waiting to be accepted, and who is out delivering — with live updates,
 * and the riders' current workload so staff can balance it.
 */
export function DispatchBoard() {
  const { orders, error, upsert } = useOrderQueue('active');
  const { connected } = useSocket();
  const now = useNow();
  const [partners, setPartners] = React.useState<DeliveryPartnerDTO[] | null>(null);

  const loadPartners = React.useCallback(() => {
    apiClient.get<DeliveryPartnerDTO[]>('/api/v1/delivery/partners').then(setPartners).catch(() => setPartners([]));
  }, []);
  React.useEffect(loadPartners, [loadPartners]);
  useSocketEvent<OrderDTO>(REALTIME.EVENTS.ORDER_UPDATED, loadPartners);

  const needsRider = (orders ?? []).filter((o) => NEEDS_RIDER.includes(o.status) && (!o.delivery || o.delivery.status === 'REJECTED'));
  const offered = (orders ?? []).filter((o) => o.delivery?.status === 'OFFERED' && NEEDS_RIDER.includes(o.status));
  const assigned = (orders ?? []).filter((o) => o.delivery && ['ACCEPTED', 'PICKED_UP'].includes(o.delivery.status));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Delivery assignment</h2>
          <p className="text-sm text-muted-foreground">Offer confirmed orders to a delivery partner and follow them to the door.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Radio className={cn('h-3.5 w-3.5', connected && 'text-success')} /> {connected ? 'Live' : 'Connecting…'}
        </span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Delivery partners</CardTitle>
        </CardHeader>
        <CardContent>
          {partners === null ? (
            <Skeleton className="h-10 w-full" />
          ) : partners.length === 0 ? (
            <p className="text-sm text-muted-foreground">No delivery partners yet — the owner can add them from the Users screen.</p>
          ) : (
            <ul className="flex flex-wrap gap-2" data-testid="partners">
              {partners.map((p) => (
                <li key={p.id} className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-sm">
                  <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                  {p.name}
                  <span className={cn('rounded-full px-1.5 text-xs', p.activeAssignments > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                    {p.activeAssignments === 0 ? 'free' : `${p.activeAssignments} active`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Group title="Needs a delivery partner" empty="Nothing waiting — every confirmed order has a partner." orders={orders && needsRider} now={now} onChanged={upsert} testId="needs-rider" />
      <Group title="Offered — waiting to be accepted" empty="No open offers." orders={orders && offered} now={now} onChanged={upsert} testId="offered" />
      <Group title="With a delivery partner" empty="No deliveries in progress." orders={orders && assigned} now={now} onChanged={upsert} testId="assigned" />
    </div>
  );
}

function Group({
  title,
  empty,
  orders,
  now,
  onChanged,
  testId,
}: {
  title: string;
  empty: string;
  orders: OrderDTO[] | null | undefined;
  now: number;
  onChanged: (o: OrderDTO) => void;
  testId: string;
}) {
  return (
    <section className="flex flex-col gap-3" data-testid={testId}>
      <h3 className="text-sm font-semibold">
        {title} {orders && <span className="font-normal text-muted-foreground">({orders.length})</span>}
      </h3>
      {!orders && <Skeleton className="h-24 w-full" />}
      {orders?.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {orders?.map((order) => (
          <Card key={order.id} data-testid="dispatch-card" data-order-number={order.orderNumber}>
            <CardContent className="flex flex-col gap-3 p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{order.orderNumber}</span>
                <OrderStatusBadge status={order.status} />
              </div>
              <div className="flex flex-col gap-1 text-muted-foreground">
                <span>
                  {order.customer.name} · {money(order.total)}
                </span>
                <span className="flex items-center gap-1 text-xs">
                  <MapPin className="h-3 w-3" /> {order.address.line1}, {order.address.city}
                </span>
                <span className="flex items-center gap-1 text-xs">
                  <Clock className="h-3 w-3" /> placed {timeAgo(order.placedAt, now)}
                </span>
              </div>
              <AssignRider order={order} onChanged={onChanged} />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
