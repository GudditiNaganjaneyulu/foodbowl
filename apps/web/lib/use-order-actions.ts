'use client';

import * as React from 'react';
import type { OrderDTO, OrderStatus } from '@foodbowl/shared';
import { useToast } from '@/components/ui/toaster';
import { apiClient, ApiError } from './api-client';

type KitchenStatus = 'CONFIRMED' | 'PREPARING' | 'READY_FOR_PICKUP';

/** The one obvious next step for the kitchen at each stage. */
export const KITCHEN_NEXT: Partial<Record<OrderStatus, { to: KitchenStatus; label: string }>> = {
  PLACED: { to: 'CONFIRMED', label: 'Accept order' },
  CONFIRMED: { to: 'PREPARING', label: 'Start preparing' },
  PREPARING: { to: 'READY_FOR_PICKUP', label: 'Mark ready' },
};

/** The restaurant can cancel up to and including PREPARING. */
export const RESTAURANT_CAN_CANCEL: OrderStatus[] = ['PLACED', 'CONFIRMED', 'PREPARING'];

/** Kitchen and cancel actions with consistent error handling; returns the updated order on success. */
export function useOrderActions(onChanged?: (order: OrderDTO) => void) {
  const { toast } = useToast();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const run = React.useCallback(
    async (order: OrderDTO, call: () => Promise<OrderDTO>, success: string) => {
      setBusyId(order.id);
      try {
        const updated = await call();
        onChanged?.(updated);
        toast({ title: success, variant: 'success' });
        return updated;
      } catch (err) {
        toast({
          title: "That didn't work",
          description: err instanceof ApiError ? err.message : 'Please try again.',
          variant: 'error',
        });
        return null;
      } finally {
        setBusyId(null);
      }
    },
    [onChanged, toast],
  );

  const advance = React.useCallback(
    (order: OrderDTO, to: KitchenStatus) =>
      run(order, () => apiClient.patch<OrderDTO>(`/api/v1/orders/${order.id}/status`, { status: to }), `Order ${order.orderNumber} updated`),
    [run],
  );

  const cancel = React.useCallback(
    (order: OrderDTO, reason: string) =>
      run(order, () => apiClient.post<OrderDTO>(`/api/v1/orders/${order.id}/cancel`, { reason }), `Order ${order.orderNumber} cancelled`),
    [run],
  );

  return { advance, cancel, busyId };
}
