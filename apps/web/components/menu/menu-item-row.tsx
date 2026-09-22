'use client';

import Image from 'next/image';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { VegIndicator } from './veg-indicator';
import { useCart } from '@/lib/cart-context';
import { cn } from '@/lib/utils';

export interface MenuItemRowData {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  isVeg: boolean;
  imageUrl?: string | null;
  hasModifiers: boolean;
}

/**
 * List-row layout (not an image-grid card): most seeded items have no
 * imageUrl, and Swiggy/Zomato both fall back to exactly this — veg dot,
 * name, description, price on the left, a dashed-outline ADD button on the
 * right, optionally with a thumbnail when a photo exists.
 *
 * Items with modifier groups (size, spice level, add-ons) can't be
 * quick-added — there's a choice to make first — so ADD (and tapping the
 * row) opens the customization sheet instead of adding directly.
 */
export function MenuItemRow({
  item,
  isLast,
  onOpenDetail,
}: {
  item: MenuItemRowData;
  isLast?: boolean;
  onOpenDetail: () => void;
}) {
  const { addItem } = useCart();

  function handleAddClick() {
    if (item.hasModifiers) {
      onOpenDetail();
    } else {
      addItem({ menuItemId: item.id, name: item.name, price: item.price, isVeg: item.isVeg });
    }
  }

  return (
    <div>
      <div
        className={cn('flex items-start justify-between gap-4 py-4', item.hasModifiers && 'cursor-pointer')}
        onClick={item.hasModifiers ? onOpenDetail : undefined}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <VegIndicator isVeg={item.isVeg} />
          <h3 className="font-medium leading-snug">{item.name}</h3>
          <span className="text-sm font-semibold">${item.price.toFixed(2)}</span>
          {item.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
          )}
          {item.hasModifiers && <span className="text-xs font-medium text-primary">Customizable</span>}
        </div>

        <div className="flex w-28 shrink-0 flex-col items-center gap-2">
          {item.imageUrl ? (
            <div className="relative h-24 w-28 overflow-hidden rounded-xl bg-muted">
              <Image src={item.imageUrl} alt={item.name} fill sizes="112px" className="object-cover" />
            </div>
          ) : (
            <div className="h-2" />
          )}
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'w-full border-2 border-primary font-semibold text-primary hover:bg-primary/5 hover:text-primary',
              item.imageUrl && '-mt-5 bg-background shadow-md',
            )}
            onClick={(e) => {
              e.stopPropagation();
              handleAddClick();
            }}
          >
            <Plus className="h-3.5 w-3.5" /> ADD
          </Button>
        </div>
      </div>
      {!isLast && <Separator />}
    </div>
  );
}
