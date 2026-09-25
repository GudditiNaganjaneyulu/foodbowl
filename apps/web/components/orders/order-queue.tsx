'use client';

import * as React from 'react';
import { Clock, MapPin, Radio, Truck } from 'lucide-react';
import { type OrderDTO, type OrderStatus } from '@foodbowl/shared';
import { OrderDetailSheet } from '@/components/orders/order-detail-sheet';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatDateTime, money, timeAgo } from '@/lib/format';
import { useSocket } from '@/lib/socket';
import { useNow } from '@/lib/use-now';
import { KITCHEN_NEXT, useOrderActions } from '@/lib/use-order-actions';
import { useOrderQueue } from '@/lib/use-order-queue';
import { orderStatusLabel } from '@/lib/order-status-styles';
import { cn } from '@/lib/utils';

const COLUMNS: OrderStatus[] = ['PLACED', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];
/** A new order nobody has accepted for this long is flagged. */
const STALE_PLACED_MS = 5 * 60_000;

/** Live kanban board of the restaurant's orders, plus a history tab. */
export function OrderQueue() {
  const { hasPermission } = useAuth();
  const { connected } = useSocket();
  const [tab, setTab] = React.useState<'active' | 'history'>('active');
  const active = useOrderQueue('active');
  const history = useOrderQueue('history');
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [fetched, setFetched] = React.useState<OrderDTO | null>(null);
  const now = useNow();

  const handleChanged = React.useCallback(
    (order: OrderDTO) => {
      active.upsert(order);
      history.upsert(order);
    },
    [active, history],
  );
  const { advance, busyId } = useOrderActions(handleChanged);
  const canManage = hasPermission('orders.manage');

  // Deep link from a notification: /staff?order=<id> opens that order.
  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('order');
    if (id) {
      setOpenId(id);
      apiClient.get<OrderDTO>(`/api/v1/orders/${id}`).then(setFetched).catch(() => undefined);
    }
  }, []);

  const all = [...(active.orders ?? []), ...(history.orders ?? [])];
  const selected = all.find((o) => o.id === openId) ?? (fetched?.id === openId ? fetched : null);

  const list = tab === 'active' ? active : history;
  const byStatus = (status: OrderStatus) => (active.orders ?? []).filter((o) => o.status === status);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-border bg-background p-0.5 text-sm">
          {(['active', 'history'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn('rounded px-3 py-1.5 font-medium capitalize', tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {t === 'active' ? `Active${active.orders ? ` (${active.orders.length})` : ''}` : 'Completed'}
            </button>
          ))}
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="New orders appear automatically">
          <Radio className={cn('h-3.5 w-3.5', connected && 'text-success')} /> {connected ? 'Live' : 'Connecting…'}
        </span>
      </div>

      {list.error && <p className="text-sm text-destructive">{list.error}</p>}
      {!list.orders && !list.error && (
        <div className="flex gap-3">
          <Skeleton className="h-40 w-72" />
          <Skeleton className="h-40 w-72" />
        </div>
      )}

      {tab === 'active' && active.orders && (
        <>
          {active.orders.length === 0 && (
            <p className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
              No active orders. New ones will appear here the moment they're placed.
            </p>
          )}
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0" data-testid="kanban">
            {COLUMNS.map((status) => {
              const orders = byStatus(status);
              return (
                <section key={status} className="w-[17rem] shrink-0 snap-start" aria-label={orderStatusLabel(status)} data-testid={`col-${status}`}>
                  <h3 className="mb-2 flex items-center justify-between text-sm font-semibold">
                    {orderStatusLabel(status)}
                    <Badge variant="secondary">{orders.length}</Badge>
                  </h3>
                  <div className="flex flex-col gap-2">
                    {orders.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        now={now}
                        canManage={canManage}
                        busy={busyId === order.id}
                        onOpen={() => setOpenId(order.id)}
                        onAdvance={(to) => advance(order, to)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {tab === 'history' && history.orders && (
        <div className="flex flex-col gap-2" data-testid="history">
          {history.orders.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Nothing completed yet.</p>}
          {history.orders.map((order) => (
            <Card key={order.id} role="button" tabIndex={0} className="cursor-pointer hover:bg-accent/40" onClick={() => setOpenId(order.id)} onKeyDown={(e) => e.key === 'Enter' && setOpenId(order.id)}>
              <CardContent className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {order.orderNumber} <span className="font-normal text-muted-foreground">· {order.customer.name}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(order.placedAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums">{money(order.total)}</span>
                  <OrderStatusBadge status={order.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <OrderDetailSheet
        order={selected}
        open={openId !== null && selected !== null}
        onOpenChange={(o) => !o && setOpenId(null)}
        onChanged={handleChanged}
      />
    </div>
  );
}

function OrderCard({
  order,
  now,
  canManage,
  busy,
  onOpen,
  onAdvance,
}: {
  order: OrderDTO;
  now: number;
  canManage: boolean;
  busy: boolean;
  onOpen: () => void;
  onAdvance: (to: 'CONFIRMED' | 'PREPARING' | 'READY_FOR_PICKUP') => void;
}) {
  const next = KITCHEN_NEXT[order.status];
  const waiting = order.status === 'PLACED' && now - new Date(order.placedAt).getTime() > STALE_PLACED_MS;
  const itemCount = order.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <Card className={cn('transition-colors hover:bg-accent/30', waiting && 'border-destructive/60')} data-testid="order-card" data-order-number={order.orderNumber}>
      <CardContent className="flex flex-col gap-2 p-3 text-sm">
        <button type="button" onClick={onOpen} className="flex flex-col gap-1.5 text-left">
          <span className="flex items-center justify-between gap-2">
            <span className="font-semibold">{order.orderNumber}</span>
            <span className={cn('inline-flex items-center gap-1 text-xs', waiting ? 'font-medium text-destructive' : 'text-muted-foreground')}>
              <Clock className="h-3 w-3" /> {timeAgo(order.placedAt, now)}
            </span>
          </span>
          <span className="text-muted-foreground">
            {order.customer.name} · {itemCount} item{itemCount === 1 ? '' : 's'} · {money(order.total)}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" /> {order.address.line1}, {order.address.city}
          </span>
          {order.delivery && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Truck className="h-3 w-3" /> {order.delivery.deliveryPartner.name} · {order.delivery.status.toLowerCase().replace('_', ' ')}
            </span>
          )}
          {order.notes && <span className="line-clamp-1 text-xs italic text-muted-foreground">“{order.notes}”</span>}
        </button>
        {next && canManage && (
          <Button size="sm" disabled={busy} onClick={() => onAdvance(next.to)} data-testid="advance">
            {busy ? 'Updating…' : next.label}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
