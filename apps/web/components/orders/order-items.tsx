import type { OrderDTO } from '@foodbowl/shared';
import { MessageSquareText } from 'lucide-react';
import { FoodImage } from '@/components/menu/food-image';
import { Separator } from '@/components/ui/separator';
import { money } from '@/lib/format';

/** The ordered items with their chosen options, then the price breakdown. */
export function OrderItems({ order }: { order: OrderDTO }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <ul className="flex flex-col gap-2.5">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-start gap-3">
            <FoodImage src={item.imageUrl} alt={item.name} className="h-11 w-11 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                <span className="text-muted-foreground">{item.quantity} ×</span> {item.name}
              </p>
              {item.modifiers.length > 0 && (
                <p className="text-xs text-muted-foreground">{item.modifiers.map((m) => m.name).join(', ')}</p>
              )}
              {item.note && (
                <p className="mt-1 flex items-start gap-1.5 rounded bg-warning/10 px-2 py-1 text-xs" data-testid="item-note">
                  <MessageSquareText className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>“{item.note}”</span>
                </p>
              )}
            </div>
            <span className="shrink-0 tabular-nums">{money(item.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <Separator />
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-nums">{money(order.subtotal)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Delivery fee</span>
          <span className="tabular-nums">{money(order.deliveryFee)}</span>
        </div>
        {Number(order.discount) > 0 && (
          <div className="flex justify-between text-success">
            <span>Discount</span>
            <span className="tabular-nums">−{money(order.discount)}</span>
          </div>
        )}
        <div className="flex justify-between pt-1 text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{money(order.total)}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Cash on delivery · {order.paymentStatus === 'COLLECTED' ? 'paid' : 'to be paid on delivery'}
        </p>
      </div>
    </div>
  );
}
