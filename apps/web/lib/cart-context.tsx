'use client';

import * as React from 'react';

export interface CartLine {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

interface CartContextValue {
  lines: CartLine[];
  itemCount: number;
  subtotal: number;
  addItem: (item: Omit<CartLine, 'quantity'>) => void;
  removeItem: (menuItemId: string) => void;
  setQuantity: (menuItemId: string, quantity: number) => void;
  clear: () => void;
}

const CartContext = React.createContext<CartContextValue | undefined>(undefined);

/**
 * Client-local cart state for now (demo/dev). Milestone 5 in BUILD_PROMPT.md
 * §14 swaps this for the real /api/v1/cart-backed cart so it persists across
 * devices/sessions — the component API here is written to stay stable when
 * that swap happens.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = React.useState<CartLine[]>([]);

  const addItem = React.useCallback((item: Omit<CartLine, 'quantity'>) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.menuItemId === item.menuItemId);
      if (existing) {
        return prev.map((l) => (l.menuItemId === item.menuItemId ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const removeItem = React.useCallback((menuItemId: string) => {
    setLines((prev) => prev.filter((l) => l.menuItemId !== menuItemId));
  }, []);

  const setQuantity = React.useCallback((menuItemId: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.menuItemId !== menuItemId)
        : prev.map((l) => (l.menuItemId === menuItemId ? { ...l, quantity } : l)),
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
