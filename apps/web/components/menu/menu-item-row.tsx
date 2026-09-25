'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart } from '@/lib/cart-context';
import { cn } from '@/lib/utils';
import { FoodImage } from './food-image';
import { VegIndicator } from './veg-indicator';

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
 * One dish, laid out for the screen it's on:
 *  - phones: a list row — details on the left, photo on the right with the ADD
 *    button overlapping its bottom edge (Swiggy/Zomato style);
 *  - tablets/desktops: a card in a grid — big photo on top, ADD in its corner.
 * It's one component with responsive classes, so there is a single set of
 * markup, data and click behaviour for both.
 *
 * Tapping anywhere opens the item sheet (bigger photo, options, special
 * instructions). ADD adds a plain item straight away; items with options
 * open the sheet, since there is a choice to make first.
 */
export function MenuItemRow({
  item,
  onOpenDetail,
}: {
  item: MenuItemRowData;
  onOpenDetail: () => void;
}) {
  const { addItem } = useCart();
  const hasPhoto = Boolean(item.imageUrl);

  function handleAdd(e: React.MouseEvent) {
    e.stopPropagation();
    if (item.hasModifiers) onOpenDetail();
    else addItem({ menuItemId: item.id, name: item.name, price: item.price, isVeg: item.isVeg, imageUrl: item.imageUrl });
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpenDetail}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpenDetail())}
      data-testid="menu-card"
      data-item={item.name}
      className={cn(
        'group flex cursor-pointer items-start justify-between gap-4 border-b border-border py-5 outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring',
        // Card on ≥ md: photo above the text, framed, lifts on hover.
        'md:flex-col-reverse md:justify-end md:gap-0 md:overflow-hidden md:rounded-2xl md:border md:bg-card md:py-0 md:shadow-sm md:transition-shadow md:hover:shadow-md',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:w-full md:flex-none md:gap-1 md:p-4">
        <VegIndicator isVeg={item.isVeg} />
        <h3 className="font-medium leading-snug">{item.name}</h3>
        <span className="text-sm font-semibold">${item.price.toFixed(2)}</span>
        {item.description && <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>}
        {item.hasModifiers && <span className="text-xs font-medium text-primary">Customizable</span>}
      </div>

      {/* Photo column. Without a photo: just the ADD button on phones, a placeholder tile on cards. */}
      <div className={cn('relative w-28 shrink-0 sm:w-32 md:w-full', !hasPhoto && 'pb-1 md:pb-0')}>
        <FoodImage
          src={item.imageUrl}
          alt={item.name}
          className={cn('h-24 w-28 rounded-2xl sm:h-28 sm:w-32 md:aspect-[4/3] md:h-auto md:w-full md:rounded-none', !hasPhoto && 'hidden md:flex')}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
          aria-label={`Add ${item.name}`}
          className={cn(
            // z-10 + relative: must paint ABOVE the photo, which is a positioned element.
            'relative z-10 w-24 border-2 border-primary bg-background font-semibold text-primary shadow-md hover:bg-accent hover:text-primary',
            hasPhoto
              ? 'absolute -bottom-3 left-1/2 -translate-x-1/2 md:bottom-3 md:left-auto md:right-3 md:translate-x-0'
              : 'mx-auto mt-0 flex md:absolute md:bottom-3 md:right-3 md:mx-0',
          )}
        >
          <Plus className="h-3.5 w-3.5" /> ADD
        </Button>
      </div>
    </article>
  );
}
