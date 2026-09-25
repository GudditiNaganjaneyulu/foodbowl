'use client';

import * as React from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { FoodImage } from './food-image';
import { VegIndicator } from './veg-indicator';
import { cn } from '@/lib/utils';
import { useCart, type SelectedModifier } from '@/lib/cart-context';
import type { MenuItemDTO } from '@/app/(public)/use-menu';

interface ItemDetailSheetProps {
  item: MenuItemDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Full customization sheet — opens when an item has modifier groups (size,
 * spice level, add-ons) that need a choice before it can be added, matching
 * the "Customize" pattern from the reference apps rather than silently
 * ignoring those options the way the plain quick-add row has to.
 */
export function ItemDetailSheet({ item, open, onOpenChange }: ItemDetailSheetProps) {
  const { addItem } = useCart();
  const [selections, setSelections] = React.useState<Record<string, Set<string>>>({});
  const [quantity, setQuantity] = React.useState(1);
  const [note, setNote] = React.useState('');

  React.useEffect(() => {
    if (item) {
      setSelections({});
      setQuantity(1);
      setNote('');
    }
  }, [item]);

  if (!item) return null;

  const basePrice = Number(item.price);

  function toggleModifier(groupId: string, modifierId: string, maxSelect: number) {
    setSelections((prev) => {
      const current = new Set(prev[groupId] ?? []);
      if (current.has(modifierId)) {
        current.delete(modifierId);
      } else {
        if (maxSelect === 1) current.clear();
        else if (current.size >= maxSelect) return prev;
        current.add(modifierId);
      }
      return { ...prev, [groupId]: current };
    });
  }

  const selectedModifiers: SelectedModifier[] = item.modifierGroups.flatMap((group) =>
    group.modifiers
      .filter((m) => selections[group.id]?.has(m.id))
      .map((m) => ({ id: m.id, groupId: group.id, name: m.name, priceDelta: Number(m.priceDelta) })),
  );

  const unitPrice = basePrice + selectedModifiers.reduce((sum, m) => sum + m.priceDelta, 0);
  const totalPrice = unitPrice * quantity;

  // Mirrors the server's rule: a required group always needs at least one
  // choice, even if its minSelect was left at 0.
  const missingRequired = item.modifierGroups.filter(
    (g) => (selections[g.id]?.size ?? 0) < (g.required ? Math.max(g.minSelect, 1) : g.minSelect),
  );
  const canAdd = missingRequired.length === 0;

  function handleAdd() {
    if (!item || !canAdd) return;
    addItem(
      {
        menuItemId: item.id,
        name: item.name,
        price: unitPrice,
        isVeg: item.isVeg,
        imageUrl: item.imageUrl,
        modifiers: selectedModifiers.length > 0 ? selectedModifiers : undefined,
        note: note.trim() || undefined,
      },
      quantity,
    );
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-0 sm:max-w-lg sm:mx-auto">
        {item.imageUrl && (
          <FoodImage src={item.imageUrl} alt={item.name} placeholder={false} className="aspect-[4/3] max-h-72 w-full sm:rounded-t-2xl" />
        )}
        <div className="flex flex-col gap-4 p-5 pb-28">
          <SheetHeader className="text-left">
            <div className="flex items-start gap-2">
              <VegIndicator isVeg={item.isVeg} className="mt-1.5" />
              <div className="flex-1">
                <SheetTitle className="text-xl">{item.name}</SheetTitle>
                <p className="mt-0.5 font-semibold text-foreground">${basePrice.toFixed(2)}</p>
              </div>
            </div>
          </SheetHeader>

          {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}

          {item.modifierGroups.map((group) => (
            <div key={group.id}>
              <Separator className="mb-4" />
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="font-medium">{group.name}</h3>
                <span className="text-xs text-muted-foreground">
                  {group.required ? 'Required' : 'Optional'}
                  {group.maxSelect > 1 ? ` · up to ${group.maxSelect}` : ''}
                </span>
              </div>

              {group.maxSelect === 1 ? (
                <div className="flex flex-wrap gap-2">
                  {group.modifiers.map((mod) => {
                    const active = selections[group.id]?.has(mod.id) ?? false;
                    return (
                      <button
                        key={mod.id}
                        type="button"
                        onClick={() => toggleModifier(group.id, mod.id, group.maxSelect)}
                        className={cn(
                          'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {mod.name}
                        {Number(mod.priceDelta) > 0 && ` (+$${Number(mod.priceDelta).toFixed(2)})`}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {group.modifiers.map((mod) => {
                    const active = selections[group.id]?.has(mod.id) ?? false;
                    return (
                      <label
                        key={mod.id}
                        className="flex cursor-pointer items-center justify-between rounded-md border border-border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() => toggleModifier(group.id, mod.id, group.maxSelect)}
                          />
                          {mod.name}
                        </span>
                        {Number(mod.priceDelta) > 0 && (
                          <span className="text-muted-foreground">+${Number(mod.priceDelta).toFixed(2)}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          <div>
            <Separator className="mb-4" />
            <label htmlFor="item-note" className="mb-2 block font-medium">
              Special instructions <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              id="item-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder="e.g. no onions, extra crispy, sauce on the side"
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">{note.length}/300 · The restaurant is told, but can't always accommodate.</p>
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 flex items-center gap-3 border-t border-border bg-background p-4 pb-safe sm:mx-auto sm:max-w-lg sm:rounded-b-2xl">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              aria-label="Decrease quantity"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span className="w-5 text-center font-medium">{quantity}</span>
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9"
              onClick={() => setQuantity((q) => q + 1)}
              aria-label="Increase quantity"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button className="flex-1 justify-between" disabled={!canAdd} onClick={handleAdd}>
            <span>{canAdd ? 'Add to cart' : `Select ${missingRequired[0]?.name}`}</span>
            <span>${totalPrice.toFixed(2)}</span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
