import type { OrderStatus } from '@foodbowl/shared';
import { Badge } from '@/components/ui/badge';
import { ORDER_STATUS_BADGE_VARIANT, orderStatusLabel } from '@/lib/order-status-styles';

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <Badge variant={ORDER_STATUS_BADGE_VARIANT[status]} className={className}>
      {orderStatusLabel(status)}
    </Badge>
  );
}
