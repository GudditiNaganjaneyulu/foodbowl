import { Check, X } from 'lucide-react';
import { ORDER_STATUS, ORDER_STATUS_LABELS, type OrderDTO, type OrderStatus } from '@foodbowl/shared';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/format';

const HAPPY_PATH: OrderStatus[] = [
  ORDER_STATUS.PLACED,
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY_FOR_PICKUP,
  ORDER_STATUS.OUT_FOR_DELIVERY,
  ORDER_STATUS.DELIVERED,
];

const CUSTOMER_HINT: Partial<Record<OrderStatus, string>> = {
  PLACED: 'Waiting for the restaurant to accept',
  CONFIRMED: 'The restaurant accepted your order',
  PREPARING: 'Your food is being cooked',
  READY_FOR_PICKUP: 'Packed and waiting for the delivery partner',
  OUT_FOR_DELIVERY: 'On its way to you',
  DELIVERED: 'Enjoy your meal!',
};

/**
 * Vertical progress list built from the order's real status history. Steps
 * that have happened show their time; the current one is highlighted; the
 * rest are dimmed. A cancelled order shows the steps it reached and then a
 * red "Cancelled" step with the reason.
 */
export function StatusTimeline({ order }: { order: OrderDTO }) {
  const reachedAt = new Map<OrderStatus, string>();
  for (const log of order.statusLogs ?? []) reachedAt.set(log.toStatus, log.createdAt);
  if (!reachedAt.has(ORDER_STATUS.PLACED)) reachedAt.set(ORDER_STATUS.PLACED, order.placedAt);

  const cancelled = order.status === ORDER_STATUS.CANCELLED;
  const steps = cancelled ? HAPPY_PATH.filter((s) => reachedAt.has(s)) : HAPPY_PATH;

  return (
    <ol className="flex flex-col">
      {steps.map((status, i) => {
        const reached = reachedAt.has(status);
        const current = !cancelled && status === order.status;
        const last = i === steps.length - 1 && !cancelled;
        return (
          <li key={status} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs',
                  reached ? 'border-success bg-success text-success-foreground' : 'border-border bg-background text-transparent',
                  current && 'ring-4 ring-success/20',
                )}
              >
                {reached && <Check className="h-3.5 w-3.5" />}
              </span>
              {!last && <span className={cn('w-0.5 flex-1', reached && !current ? 'bg-success' : 'bg-border')} />}
            </div>
            <div className={cn('pb-5', !reached && 'opacity-50')}>
              <p className={cn('text-sm font-medium leading-6', current && 'text-success')}>
                {ORDER_STATUS_LABELS[status]}
                {reached && <span className="ml-2 text-xs font-normal text-muted-foreground">{formatTime(reachedAt.get(status)!)}</span>}
              </p>
              {(current || (!reached && !cancelled)) && CUSTOMER_HINT[status] && (
                <p className="text-xs text-muted-foreground">{CUSTOMER_HINT[status]}</p>
              )}
            </div>
          </li>
        );
      })}
      {cancelled && (
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-destructive bg-destructive text-destructive-foreground">
            <X className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-sm font-medium leading-6 text-destructive">
              Cancelled
              {order.cancelledAt && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">{formatTime(order.cancelledAt)}</span>
              )}
            </p>
            {order.cancellationReason && <p className="text-xs text-muted-foreground">{order.cancellationReason}</p>}
          </div>
        </li>
      )}
    </ol>
  );
}
