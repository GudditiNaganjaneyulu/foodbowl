'use client';

import * as React from 'react';
import type { DeliveryPartnerDTO, OrderDTO } from '@foodbowl/shared';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

const STATUS_TEXT = {
  OFFERED: 'Offered — waiting for them to accept',
  ACCEPTED: 'Accepted',
  REJECTED: 'Declined — offer it to someone else',
  PICKED_UP: 'Picked up',
  DELIVERED: 'Delivered',
} as const;

/**
 * Offer an order to a delivery partner (needs delivery.assign). Shows who has
 * it now, and — while it is only offered or was declined — lets staff pick
 * someone else. Renders nothing for users without the permission.
 */
export function AssignRider({ order, onChanged }: { order: OrderDTO; onChanged: (order: OrderDTO) => void }) {
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const canAssign = hasPermission('delivery.assign');
  const [partners, setPartners] = React.useState<DeliveryPartnerDTO[] | null>(null);
  const [choice, setChoice] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!canAssign) return;
    apiClient.get<DeliveryPartnerDTO[]>('/api/v1/delivery/partners').then(setPartners).catch(() => setPartners([]));
  }, [canAssign, order.delivery?.status]);

  const delivery = order.delivery;
  const eligible = ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'].includes(order.status);
  const locked = delivery && !['OFFERED', 'REJECTED'].includes(delivery.status);

  async function offer() {
    if (!choice) return;
    setBusy(true);
    try {
      const updated = await apiClient.post<OrderDTO>('/api/v1/delivery/assignments', { orderId: order.id, deliveryPartnerId: choice });
      onChanged(updated);
      setChoice('');
      toast({ title: `Offered to ${updated.delivery?.deliveryPartner.name}`, variant: 'success' });
    } catch (err) {
      toast({ title: "Couldn't assign", description: err instanceof ApiError ? err.message : undefined, variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="assign-rider">
      {delivery && (
        <p>
          <span className="font-medium">{delivery.deliveryPartner.name}</span>{' '}
          <span className="text-muted-foreground">— {STATUS_TEXT[delivery.status]}</span>
        </p>
      )}
      {canAssign && eligible && !locked && (
        <div className="flex gap-2">
          <Select aria-label="Delivery partner" value={choice} onChange={(e) => setChoice(e.target.value)} disabled={partners === null}>
            <option value="">{delivery ? 'Choose another partner…' : 'Choose a delivery partner…'}</option>
            {partners?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.activeAssignments} active)
              </option>
            ))}
          </Select>
          <Button onClick={offer} disabled={!choice || busy}>
            {busy ? 'Offering…' : 'Offer'}
          </Button>
        </div>
      )}
      {canAssign && !delivery && !eligible && (
        <p className="text-xs text-muted-foreground">Accept the order first, then you can assign a delivery partner.</p>
      )}
    </div>
  );
}
