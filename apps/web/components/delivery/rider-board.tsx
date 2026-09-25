'use client';

import * as React from 'react';
import { CheckCircle2, MapPin, Navigation, Package, Phone, Radio, StickyNote } from 'lucide-react';
import { REALTIME, type DeliveryAssignmentWithOrderDTO, type OrderDTO } from '@foodbowl/shared';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ImageUploader } from '@/components/ui/image-uploader';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toaster';
import { apiClient, ApiError } from '@/lib/api-client';
import { addressLine, formatDateTime, money } from '@/lib/format';
import { useSocket, useSocketEvent } from '@/lib/socket';

/**
 * A delivery partner's work: new offers to accept or decline, deliveries in
 * progress with everything needed at the door (address, phone, items, cash to
 * collect), and the pickup / delivered steps. Updates live.
 */
export function RiderBoard({ scope }: { scope: 'active' | 'history' }) {
  const { toast } = useToast();
  const { connected } = useSocket();
  const [items, setItems] = React.useState<DeliveryAssignmentWithOrderDTO[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [declining, setDeclining] = React.useState<DeliveryAssignmentWithOrderDTO | null>(null);
  const [completing, setCompleting] = React.useState<DeliveryAssignmentWithOrderDTO | null>(null);

  const load = React.useCallback(async () => {
    try {
      setItems(await apiClient.get<DeliveryAssignmentWithOrderDTO[]>(`/api/v1/delivery/me/assignments?scope=${scope}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load deliveries');
    }
  }, [scope]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Offers, kitchen progress and cancellations all reach the rider's private room.
  useSocketEvent<OrderDTO>(REALTIME.EVENTS.ORDER_UPDATED, () => void load());
  const { socket } = useSocket();
  React.useEffect(() => {
    if (!socket) return;
    socket.on('connect', load);
    return () => {
      socket.off('connect', load);
    };
  }, [socket, load]);

  async function step(a: DeliveryAssignmentWithOrderDTO, action: 'accept' | 'picked-up', done: string) {
    setBusyId(a.id);
    try {
      await apiClient.patch(`/api/v1/delivery/assignments/${a.id}/${action}`);
      toast({ title: done, variant: 'success' });
      await load();
    } catch (err) {
      toast({ title: "That didn't work", description: err instanceof ApiError ? err.message : undefined, variant: 'error' });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const offers = items?.filter((a) => a.status === 'OFFERED') ?? [];
  const inProgress = items?.filter((a) => a.status === 'ACCEPTED' || a.status === 'PICKED_UP') ?? [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{scope === 'active' ? 'My deliveries' : 'Delivery history'}</h2>
        {scope === 'active' && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Radio className={connected ? 'h-3.5 w-3.5 text-success' : 'h-3.5 w-3.5'} /> {connected ? 'Live' : 'Connecting…'}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!items && !error && <Skeleton className="h-40 w-full" />}

      {scope === 'active' && items && items.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-20 text-center text-muted-foreground">
          <Package className="h-8 w-8" />
          <p>No deliveries right now. New offers will show up here instantly.</p>
        </div>
      )}

      {scope === 'active' && offers.length > 0 && (
        <section className="flex flex-col gap-3" data-testid="offers">
          <h3 className="text-sm font-semibold">New offers ({offers.length})</h3>
          {offers.map((a) => (
            <Card key={a.id} className="border-primary/40" data-testid="offer-card" data-order-number={a.order.orderNumber}>
              <CardContent className="flex flex-col gap-3 p-4 text-sm">
                <Summary a={a} />
                <div className="flex gap-2">
                  <Button className="flex-1" disabled={busyId === a.id} onClick={() => step(a, 'accept', `Accepted ${a.order.orderNumber}`)} data-testid="accept">
                    Accept
                  </Button>
                  <Button variant="outline" disabled={busyId === a.id} onClick={() => setDeclining(a)} data-testid="decline">
                    Decline
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {scope === 'active' && inProgress.length > 0 && (
        <section className="flex flex-col gap-3" data-testid="in-progress">
          <h3 className="text-sm font-semibold">In progress ({inProgress.length})</h3>
          {inProgress.map((a) => {
            const ready = a.order.status === 'READY_FOR_PICKUP';
            return (
              <Card key={a.id} data-testid="delivery-card" data-order-number={a.order.orderNumber}>
                <CardContent className="flex flex-col gap-3 p-4 text-sm">
                  <Summary a={a} detailed />
                  {a.status === 'ACCEPTED' && (
                    <>
                      {!ready && (
                        <p className="rounded-md bg-muted p-2.5 text-xs text-muted-foreground">
                          The kitchen is still on it ({a.order.status.toLowerCase().replace(/_/g, ' ')}). You'll be able to confirm pickup when it's ready.
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Button className="flex-1" disabled={!ready || busyId === a.id} onClick={() => step(a, 'picked-up', 'Marked as picked up')} data-testid="picked-up">
                          {ready ? 'Picked up from restaurant' : 'Waiting for the kitchen'}
                        </Button>
                        <Button variant="ghost" disabled={busyId === a.id} onClick={() => setDeclining(a)}>
                          Back out
                        </Button>
                      </div>
                    </>
                  )}
                  {a.status === 'PICKED_UP' && (
                    <Button disabled={busyId === a.id} onClick={() => setCompleting(a)} data-testid="mark-delivered">
                      <CheckCircle2 className="h-4 w-4" /> Mark delivered
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      {scope === 'history' && items && (
        <section className="flex flex-col gap-2" data-testid="history-list">
          {items.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No finished deliveries yet.</p>}
          {items.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {a.order.orderNumber} <span className="font-normal text-muted-foreground">· {a.order.customer.name}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(a.deliveredAt ?? a.assignedAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums">{money(a.order.total)}</span>
                  {a.order.status === 'CANCELLED' ? <OrderStatusBadge status="CANCELLED" /> : <Badge variant={a.status === 'DELIVERED' ? 'success' : 'outline'}>{a.status.toLowerCase().replace('_', ' ')}</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <DeclineDialog assignment={declining} onClose={() => setDeclining(null)} onDone={load} />
      <CompleteDialog assignment={completing} onClose={() => setCompleting(null)} onDone={load} />
    </div>
  );
}

function Summary({ a, detailed = false }: { a: DeliveryAssignmentWithOrderDTO; detailed?: boolean }) {
  const o = a.order;
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLine(o.address))}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-semibold">{o.orderNumber}</span>
        <OrderStatusBadge status={o.status} />
      </div>
      <p className="flex items-start gap-2">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span>
          {addressLine(o.address)}
          <a href={maps} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <Navigation className="h-3 w-3" /> Directions
          </a>
        </span>
      </p>
      <p className="rounded-md bg-primary/10 px-3 py-2 font-semibold text-primary" data-testid="cash-due">
        Collect {money(o.total)} in cash
      </p>
      {detailed && (
        <>
          <p className="flex items-center gap-2">
            {o.customer.name}
            {o.customer.phone && (
              <a href={`tel:${o.customer.phone}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                <Phone className="h-3.5 w-3.5" /> {o.customer.phone}
              </a>
            )}
          </p>
          <ul className="text-muted-foreground">
            {o.items.map((i) => (
              <li key={i.id}>
                {i.quantity} × {i.name}
                {i.modifiers.length > 0 && <span className="text-xs"> ({i.modifiers.map((m) => m.name).join(', ')})</span>}
              </li>
            ))}
          </ul>
          {o.notes && (
            <p className="flex items-start gap-2 rounded-md bg-warning/10 p-2.5">
              <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {o.notes}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function DeclineDialog({ assignment, onClose, onDone }: { assignment: DeliveryAssignmentWithOrderDTO | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function confirm() {
    if (!assignment) return;
    setBusy(true);
    try {
      await apiClient.patch(`/api/v1/delivery/assignments/${assignment.id}/reject`, { reason: reason.trim() || undefined });
      toast({ title: `Declined ${assignment.order.orderNumber}` });
      setReason('');
      onClose();
    } catch (err) {
      toast({ title: "Couldn't decline", description: err instanceof ApiError ? err.message : undefined, variant: 'error' });
    } finally {
      setBusy(false);
      onDone();
    }
  }

  return (
    <Dialog open={assignment !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline {assignment?.order.orderNumber}?</DialogTitle>
          <DialogDescription>The restaurant will be told so they can offer it to someone else.</DialogDescription>
        </DialogHeader>
        <Textarea aria-label="Reason" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="destructive" disabled={busy} onClick={confirm} data-testid="confirm-decline">
            {busy ? 'Declining…' : 'Decline delivery'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteDialog({ assignment, onClose, onDone }: { assignment: DeliveryAssignmentWithOrderDTO | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [collected, setCollected] = React.useState(false);
  const [proofUrl, setProofUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setCollected(false);
    setProofUrl(null);
  }, [assignment?.id]);

  async function confirm() {
    if (!assignment) return;
    setBusy(true);
    try {
      await apiClient.patch(`/api/v1/delivery/assignments/${assignment.id}/delivered`, {
        codCollected: collected,
        proofImageUrl: proofUrl ?? undefined,
      });
      toast({ title: `${assignment.order.orderNumber} delivered`, description: 'Nice work!', variant: 'success' });
      onClose();
    } catch (err) {
      toast({ title: "Couldn't complete", description: err instanceof ApiError ? err.message : undefined, variant: 'error' });
    } finally {
      setBusy(false);
      onDone();
    }
  }

  return (
    <Dialog open={assignment !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm delivery of {assignment?.order.orderNumber}</DialogTitle>
          <DialogDescription>Hand over the order and collect the cash before confirming.</DialogDescription>
        </DialogHeader>
        <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
          <input type="checkbox" className="mt-1" checked={collected} onChange={(e) => setCollected(e.target.checked)} data-testid="cod-collected" />
          <span>
            I collected <strong>{assignment ? money(assignment.order.total) : ''}</strong> in cash from the customer.
          </span>
        </label>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">
            Proof photo <span className="font-normal text-muted-foreground">(optional)</span>
          </p>
          {proofUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proofUrl} alt="Delivery proof" className="h-32 w-32 rounded-md object-cover" />
          ) : (
            assignment && <ImageUploader bucket="delivery-proofs" entityId={assignment.order.id} onUploaded={setProofUrl} label="Add a photo" />
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Not yet
          </Button>
          <Button disabled={!collected || busy} onClick={confirm} data-testid="confirm-delivered">
            {busy ? 'Saving…' : 'Confirm delivered'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
