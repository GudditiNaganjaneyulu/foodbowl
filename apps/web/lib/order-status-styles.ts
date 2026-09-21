import { ORDER_STATUS_LABELS, type OrderStatus } from '@foodbowl/shared';
import type { BadgeProps } from '@/components/ui/badge';

export const ORDER_STATUS_BADGE_VARIANT: Record<OrderStatus, NonNullable<BadgeProps['variant']>> = {
  PLACED: 'secondary',
  CONFIRMED: 'outline',
  PREPARING: 'warning',
  READY_FOR_PICKUP: 'warning',
  OUT_FOR_DELIVERY: 'default',
  DELIVERED: 'success',
  CANCELLED: 'destructive',
};

export function orderStatusLabel(status: OrderStatus) {
  return ORDER_STATUS_LABELS[status];
}
