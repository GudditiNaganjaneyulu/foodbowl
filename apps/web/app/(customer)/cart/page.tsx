'use client';

import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useCart } from '@/lib/cart-context';

export default function CartPage() {
  const { lines, subtotal, setQuantity, removeItem } = useCart();

  if (lines.length === 0) {
    return (
      <div className="container flex flex-col items-center gap-3 py-24 text-center text-muted-foreground">
        <ShoppingBag className="h-10 w-10" />
        <p>Your cart is empty. Browse the menu to add something delicious.</p>
      </div>
    );
  }

  return (
    <div className="container grid gap-8 py-8 md:grid-cols-3">
      <div className="flex flex-col gap-3 md:col-span-2">
        <h1 className="text-xl font-semibold">Your cart</h1>
        {lines.map((line) => (
          <Card key={line.menuItemId}>
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium">{line.name}</p>
                <p className="text-sm text-muted-foreground">${line.price.toFixed(2)} each</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  onClick={() => setQuantity(line.menuItemId, line.quantity - 1)}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-6 text-center text-sm">{line.quantity}</span>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  onClick={() => setQuantity(line.menuItemId, line.quantity + 1)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => removeItem(line.menuItemId)}
                  aria-label="Remove item"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="h-fit">
        <CardContent className="flex flex-col gap-4 p-5">
          <h2 className="font-semibold">Order summary</h2>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Delivery fee</span>
            <span>$2.50</span>
          </div>
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>${(subtotal + 2.5).toFixed(2)}</span>
          </div>
          <Button disabled className="mt-2" title="Order placement lands in the next build milestone">
            Checkout (COD) — coming soon
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Cash on delivery only. Order placement wires up to the API in the next milestone.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
