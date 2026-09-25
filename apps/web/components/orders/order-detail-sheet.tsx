'use client';

import * as React from 'react';
import { MapPin, Phone, StickyNote } from 'lucide-react';
import { REALTIME, type OrderDTO } from '@foodbowl/shared';
import { AssignRider } from '@/components/delivery/assign-rider';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { addressLine, formatDateTime } from '@/lib/format';
import { KITCHEN_NEXT, RESTAURANT_CAN_CANCEL, useOrderActions } from '@/lib/use-order-actions';
import { useSocketEvent } from '@/lib/socket';
import { OrderItems } from './order-items';
import { ProofOfDelivery } from './proof-of-delivery';
import { OrderStatusBadge } from './order-status-badge';
import { StatusTimeline } from './status-timeline';

/**
 * Everything staff need about one order in a side drawer: who and where,
 * what was ordered, its full history, plus the actions they're permitted to
 * take (advance, cancel, assign a rider). Stays live while open.
 */
export function OrderDetailSheet({
  order,
  open,
  onOpenChange,
  onChanged,
}: {
  order: OrderDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: (order: OrderDTO) => void;
}) {
  const { hasPermission } = useAuth();
  const [detail, setDetail] = React.useState<OrderDTO | null>(null);
  const [cancelling, setCancelling] = React.useState(false);
  const [reason, setReason] = React.useState('');

  const handleChanged = React.useCallback(
    (updated: OrderDTO) => {
      setDetail(updated);
      onChanged(updated);
    },
    [onChanged],
  );
  const { advance, cancel, busyId } = useOrderActions(handleChanged);

  // Fetch the full record (with status history) each time the drawer opens.
  React.useEffect(() => {
    if (!open || !order) return;
    setDetail(order);
    setCancelling(false);
    setReason('');
    apiClient.get<OrderDTO>(`/api/v1/orders/${order.id}`).then(setDetail).catch(() => undefined);
    // Re-fetch only when a different order is opened, not on every live tweak of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order?.id]);

  useSocketEvent<OrderDTO>(REALTIME.EVENTS.ORDER_UPDATED, (updated) => {
    if (updated.id === order?.id) setDetail(updated);
  });

  const current = detail ?? order;
  if (!current) return null;

  const next = KITCHEN_NEXT[current.status];
  const canManage = hasPermission('orders.manage');
  const canCancel = canManage && RESTAURANT_CAN_CANCEL.includes(current.status);
  const busy = busyId === current.id;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-2">
            <SheetTitle data-testid="detail-order-number">{current.orderNumber}</SheetTitle>
            <OrderStatusBadge status={current.status} />
          </div>
          <SheetDescription>Placed {formatDateTime(current.placedAt)}</SheetDescription>
        </SheetHeader>

        <div className="mt-5 flex flex-col gap-5 pb-8">
          <section className="flex flex-col gap-2 text-sm">
            <p className="font-medium">{current.customer.name}</p>
            {current.customer.phone && (
              <a href={`tel:${current.customer.phone}`} className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
                <Phone className="h-3.5 w-3.5" /> {current.customer.phone}
              </a>
            )}
            <p className="flex items-start gap-2 text-muted-foreground">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {current.address.label} — {addressLine(current.address)}
              </span>
            </p>
            {current.notes && (
              <p className="flex items-start gap-2 rounded-md bg-warning/10 p-2.5">
                <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{current.notes}</span>
              </p>
            )}
          </section>

          {(next || canCancel) && canManage && (
            <section className="flex flex-col gap-2">
              {next && (
                <Button disabled={busy} onClick={() => advance(current, next.to)}>
                  {busy ? 'Updating…' : next.label}
                </Button>
              )}
              {canCancel && !cancelling && (
                <Button variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setCancelling(true)}>
                  Cancel order
                </Button>
              )}
              {cancelling && (
                <div className="flex flex-col gap-2 rounded-md border border-destructive/30 p-3">
                  <Textarea aria-label="Reason for cancelling" placeholder="Reason (the customer will see this)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
                  <div className="flex gap-2">
                    <Button variant="destructive" disabled={busy || !reason.trim()} onClick={() => cancel(current, reason.trim())}>
                      Confirm cancellation
                    </Button>
                    <Button variant="ghost" onClick={() => setCancelling(false)}>
                      Back
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}

          <Separator />
          <section>
            <h3 className="mb-3 text-sm font-semibold">Items</h3>
            <OrderItems order={current} />
          </section>

          {(current.delivery || hasPermission('delivery.assign')) && (
            <>
              <Separator />
              <section>
                <h3 className="mb-2 text-sm font-semibold">Delivery</h3>
                <AssignRider order={current} onChanged={handleChanged} />
                {current.delivery?.status === 'DELIVERED' && (
                  <div className="mt-3 flex items-center gap-3 text-sm" data-testid="delivery-proof">
                    <ProofOfDelivery url={current.delivery.proofImageUrl} orderNumber={current.orderNumber} />
                    <p className="text-muted-foreground">
                      Delivered {current.delivery.deliveredAt ? formatDateTime(current.delivery.deliveredAt) : ''}
                      {current.delivery.codCollected ? ` · cash collected (${'$' + current.total})` : ''}
                      {!current.delivery.proofImageUrl && <span className="block text-xs">No photo was taken.</span>}
                    </p>
                  </div>
                )}
              </section>
            </>
          )}

          <Separator />
          <section>
            <h3 className="mb-3 text-sm font-semibold">History</h3>
            <StatusTimeline order={current} />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
