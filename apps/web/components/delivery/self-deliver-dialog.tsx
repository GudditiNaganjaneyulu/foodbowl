'use client';

import * as React from 'react';
import type { OrderDTO } from '@foodbowl/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toaster';
import { apiClient, ApiError } from '@/lib/api-client';
import { money } from '@/lib/format';

/**
 * For when no delivery partner is available: staff/owner with delivery.assign
 * take the order straight to DELIVERED themselves, same cash-collection
 * confirmation as a rider's — see AssignRider, which renders the trigger.
 */
export function SelfDeliverDialog({ order, onClose, onChanged }: { order: OrderDTO | null; onClose: () => void; onChanged: (order: OrderDTO) => void }) {
  const { toast } = useToast();
  const [collected, setCollected] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => setCollected(false), [order?.id]);

  async function confirm() {
    if (!order) return;
    setBusy(true);
    try {
      const updated = await apiClient.patch<OrderDTO>(`/api/v1/delivery/orders/${order.id}/self-deliver`, { codCollected: collected });
      onChanged(updated);
      toast({ title: `${order.orderNumber} delivered`, description: 'Marked as delivered by the restaurant.', variant: 'success' });
      onClose();
    } catch (err) {
      toast({ title: "Couldn't complete", description: err instanceof ApiError ? err.message : undefined, variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={order !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deliver {order?.orderNumber} ourselves?</DialogTitle>
          <DialogDescription>No delivery partner? Hand this order over directly and confirm the cash before completing it.</DialogDescription>
        </DialogHeader>
        <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
          <input type="checkbox" className="mt-1" checked={collected} onChange={(e) => setCollected(e.target.checked)} data-testid="self-deliver-cod-collected" />
          <span>
            I collected <strong>{order ? money(order.total) : ''}</strong> in cash from the customer.
          </span>
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Not yet
          </Button>
          <Button disabled={!collected || busy} onClick={confirm} data-testid="confirm-self-deliver">
            {busy ? 'Saving…' : 'Confirm delivered'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
