'use client';

import { Leaf, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useCart } from '@/lib/cart-context';

export interface MenuItemCardData {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  isVeg: boolean;
}

export function MenuItemCard({ item }: { item: MenuItemCardData }) {
  const { addItem } = useCart();

  return (
    <Card className="flex flex-col justify-between transition-shadow hover:shadow-md">
      <CardContent className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium leading-snug">{item.name}</h3>
          {item.isVeg && (
            <span
              className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-success"
              title="Vegetarian"
            >
              <Leaf className="h-2.5 w-2.5 text-success" />
            </span>
          )}
        </div>
        {item.description && <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>}
      </CardContent>
      <div className="flex items-center justify-between border-t border-border p-4 pt-3">
        <span className="font-semibold">${item.price.toFixed(2)}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => addItem({ menuItemId: item.id, name: item.name, price: item.price })}
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
    </Card>
  );
}
