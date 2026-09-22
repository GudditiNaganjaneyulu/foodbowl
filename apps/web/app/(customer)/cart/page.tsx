'use client';

import Link from 'next/link';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { VegIndicator } from '@/components/menu/veg-indicator';
import { useCart } from '@/lib/cart-context';

const DELIVERY_FEE = 2.5;

export default function CartPage() {
  const { lines, subtotal, setQuantity, removeItem } = useCart();

  if (lines.length === 0) {
    return (
      <div className="container flex flex-col items-center gap-3 py-24 text-center text-muted-foreground">
        <ShoppingBag className="h-10 w-10" />
        <p>Your cart is empty. Browse the menu to add something delicious.</p>
        <Button asChild className="mt-2">
          <Link href="/">Browse menu</Link>
        </Button>
      </div>
    );
  }

  const total = subtotal + DELIVERY_FEE;

  return (
    <div className="container flex flex-col gap-6 py-6 pb-40 md:grid md:grid-cols-3 md:pb-8">
      <div className="flex flex-col gap-1 md:col-span-2">
        <h1 className="mb-2 text-xl font-semibold">Your cart</h1>
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {lines.map((line) => (
              <div key={line.lineId} className="flex items-center gap-3 p-4">
                <VegIndicator isVeg={line.isVeg} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{line.name}</p>
                  {line.modifiers && line.modifiers.length > 0 && (
                    <p className="truncate text-xs text-muted-foreground">
                      {line.modifiers.map((m) => m.name).join(', ')}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">${line.price.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => setQuantity(line.lineId, line.quantity - 1)}
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-5 text-center text-sm font-medium">{line.quantity}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => setQuantity(line.lineId, line.quantity + 1)}
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => removeItem(line.lineId)}
                  aria-label="Remove item"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Desktop: summary card in the sidebar. Mobile: fixed bottom bar (below),
          this block is hidden there to avoid showing the total twice. */}
      <Card className="hidden h-fit md:sticky md:top-20 md:block">
        <CardContent className="flex flex-col gap-4 p-5">
          <h2 className="font-semibold">Order summary</h2>
          <SummaryRows subtotal={subtotal} total={total} />
          <Button disabled className="mt-2" title="Order placement lands in the next build milestone">
            Checkout (COD) — coming soon
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Cash on delivery only. Order placement wires up to the API in the next milestone.
          </p>
        </CardContent>
      </Card>

      {/* Mobile: fixed bottom checkout bar, sitting above the bottom nav. */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-background p-4 pb-safe md:hidden">
        <div className="mb-3 flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">Total (incl. ${DELIVERY_FEE.toFixed(2)} delivery)</span>
          <span className="text-base font-semibold">${total.toFixed(2)}</span>
        </div>
        <Button disabled className="w-full" title="Order placement lands in the next build milestone">
          Checkout (COD) — coming soon
        </Button>
      </div>
    </div>
  );
}

function SummaryRows({ subtotal, total }: { subtotal: number; total: number }) {
  return (
    <>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span>${subtotal.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Delivery fee</span>
        <span>${DELIVERY_FEE.toFixed(2)}</span>
      </div>
      <Separator />
      <div className="flex justify-between font-semibold">
        <span>Total</span>
        <span>${total.toFixed(2)}</span>
      </div>
    </>
  );
}
