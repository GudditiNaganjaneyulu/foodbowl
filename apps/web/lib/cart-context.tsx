'use client';

import * as React from 'react';

export interface SelectedModifier {
  id: string;
  name: string;
  priceDelta: number;
}

export interface CartLine {
  /** Unique per distinct customization — see computeLineId below. */
  lineId: string;
  menuItemId: string;
  name: string;
  /** Unit price including any selected modifiers' price deltas. */
  price: number;
  quantity: number;
  isVeg: boolean;
  modifiers?: SelectedModifier[];
}

interface AddItemInput {
  menuItemId: string;
  name: string;
  price: number;
  isVeg: boolean;
  modifiers?: SelectedModifier[];
}

interface CartContextValue {
  lines: CartLine[];
  itemCount: number;
  subtotal: number;
  addItem: (item: AddItemInput, quantity?: number) => void;
  removeItem: (lineId: string) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  clear: () => void;
}

const CartContext = React.createContext<CartContextValue | undefined>(undefined);

/**
 * Same base item with different modifier selections (e.g. "Mild" vs "Hot"
 * Butter Chicken) must NOT merge into one line — they're different orders.
 * Plain items with no modifiers keep merging on menuItemId alone, same as
 * before. Sorting the modifier ids means selection order doesn't matter.
 */
function computeLineId(menuItemId: string, modifiers?: SelectedModifier[]) {
  if (!modifiers || modifiers.length === 0) return menuItemId;
  return `${menuItemId}:${[...modifiers.map((m) => m.id)].sort().join(',')}`;
}

/**
 * Client-local cart state for now (demo/dev). Milestone 5 in BUILD_PROMPT.md
 * §14 swaps this for the real /api/v1/cart-backed cart so it persists across
 * devices/sessions — the component API here is written to stay stable when
 * that swap happens.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = React.useState<CartLine[]>([]);

  const addItem = React.useCallback((item: AddItemInput, quantity = 1) => {
    const lineId = computeLineId(item.menuItemId, item.modifiers);
    setLines((prev) => {
      const existing = prev.find((l) => l.lineId === lineId);
      if (existing) {
        return prev.map((l) => (l.lineId === lineId ? { ...l, quantity: l.quantity + quantity } : l));
      }
      return [...prev, { ...item, lineId, quantity }];
    });
  }, []);

  const removeItem = React.useCallback((lineId: string) => {
    setLines((prev) => prev.filter((l) => l.lineId !== lineId));
  }, []);

  const setQuantity = React.useCallback((lineId: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.lineId !== lineId)
        : prev.map((l) => (l.lineId === lineId ? { ...l, quantity } : l)),
    );
  }, []);

  const clear = React.useCallback(() => setLines([]), []);

  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  const value = React.useMemo(
    () => ({ lines, itemCount, subtotal, addItem, removeItem, setQuantity, clear }),
    [lines, itemCount, subtotal, addItem, removeItem, setQuantity, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = React.useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
