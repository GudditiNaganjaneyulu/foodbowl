'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, MapPin, Phone, Radio } from 'lucide-react';
import { CUSTOMER_CANCELLABLE_STATUSES, type OrderDTO } from '@foodbowl/shared';
import { OrderItems } from '@/components/orders/order-items';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { StatusTimeline } from '@/components/orders/status-timeline';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toaster';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { addressLine, formatDateTime } from '@/lib/format';
import { useSocket } from '@/lib/socket';
import { useOrder } from '@/lib/use-orders';

export default function OrderTrackingPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { order, error, loading, setOrder } = useOrder(id);
  const { connected } = useSocket();

  if (authLoading || (user && loading)) {
    return (
      <div className="container flex max-w-2xl flex-col gap-4 py-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container flex flex-col items-center gap-3 py-24 text-center text-muted-foreground">
        <p>Log in to track your order.</p>
        <Button asChild>
          <Link href={`/login?next=/orders/${id}`}>Log in</Link>
        </Button>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="container flex flex-col items-center gap-3 py-24 text-center text-muted-foreground">
        <p>{error?.statusCode === 404 ? "We couldn't find that order." : (error?.message ?? 'Something went wrong.')}</p>
        <Button asChild variant="outline">
          <Link href="/orders">Back to your orders</Link>
        </Button>
      </div>
    );
  }

  const active = order.status !== 'DELIVERED' && order.status !== 'CANCELLED';
  const canCancel = order.customer.id === user.id && CUSTOMER_CANCELLABLE_STATUSES.includes(order.status);

  return (
    <div className="container flex max-w-2xl flex-col gap-4 py-6">
      <div className="flex flex-col gap-1">
        <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> All orders
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold" data-testid="order-number">{order.orderNumber}</h1>
          <OrderStatusBadge status={order.status} />
          {active && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Updates appear here automatically">
              <Radio className={connected ? 'h-3 w-3 text-success' : 'h-3 w-3'} /> {connected ? 'Live' : 'Connecting…'}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">Placed {formatDateTime(order.placedAt)}</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Status</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusTimeline order={order} />
        </CardContent>
      </Card>

      {order.delivery && ['ACCEPTED', 'PICKED_UP'].includes(order.delivery.status) && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Your delivery partner</p>
              <p className="font-medium">{order.delivery.deliveryPartner.name}</p>
            </div>
            {order.delivery.deliveryPartner.phone && (
              <Button size="sm" variant="outline" asChild>
                <a href={`tel:${order.delivery.deliveryPartner.phone}`}>
                  <Phone className="h-3.5 w-3.5" /> Call
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your order</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <OrderItems order={order} />
          <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">{order.address.label}</p>
              <p className="text-muted-foreground">{addressLine(order.address)}</p>
              {order.notes && <p className="mt-1 text-muted-foreground">Note: {order.notes}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {canCancel && <CancelOrder order={order} onCancelled={setOrder} />}
      {!canCancel && active && order.customer.id === user.id && (
        <p className="text-center text-xs text-muted-foreground">
          The kitchen has started on your order, so it can't be cancelled here. Please contact the restaurant if something is wrong.
        </p>
      )}
    </div>
  );
}

function CancelOrder({ order, onCancelled }: { order: OrderDTO; onCancelled: (o: OrderDTO) => void }) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      onCancelled(await apiClient.post<OrderDTO>(`/api/v1/orders/${order.id}/cancel`, { reason: reason.trim() }));
      toast({ title: `Order ${order.orderNumber} cancelled` });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel the order');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setOpen(true)}>
        Cancel order
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel order {order.orderNumber}?</DialogTitle>
            <DialogDescription>You can cancel until the kitchen starts preparing your food. This can't be undone.</DialogDescription>
          </DialogHeader>
          <Textarea aria-label="Reason for cancelling" placeholder="Why are you cancelling?" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep order
            </Button>
            <Button variant="destructive" disabled={busy || reason.trim().length === 0} onClick={confirm}>
              {busy ? 'Cancelling…' : 'Cancel order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
