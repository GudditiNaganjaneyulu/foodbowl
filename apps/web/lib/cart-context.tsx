'use client';

import * as React from 'react';
import type { CartDTO, CartItemDTO } from '@foodbowl/shared';
import { apiClient, ApiError } from './api-client';
import { useAuth } from './auth-context';
import { useToast } from '@/components/ui/toaster';

export interface SelectedModifier {
  id: string;
  groupId: string;
  name: string;
  priceDelta: number;
}

export interface CartLine {
  /** Server cart-line id when logged in; a synthetic key for guests. */
  lineId: string;
  menuItemId: string;
  name: string;
  /** Unit price including any selected modifiers' price deltas. */
  price: number;
  quantity: number;
  isVeg: boolean;
  imageUrl?: string | null;
  note?: string | null;
  modifiers: SelectedModifier[];
  /** False when the item was hidden/disabled after being added. */
  available: boolean;
}

export interface AddItemInput {
  menuItemId: string;
  name: string;
  price: number;
  isVeg: boolean;
  imageUrl?: string | null;
  modifiers?: SelectedModifier[];
  /** Special instructions for this item ("no onions"). */
  note?: string;
}

interface CartContextValue {
  lines: CartLine[];
  /** Quantity of available items (what the customer will actually be charged for). */
  itemCount: number;
  subtotal: number;
  unavailableCount: number;
  /** False until the first load (guest storage or server cart) has finished. */
  ready: boolean;
  addItem: (item: AddItemInput, quantity?: number) => void;
  removeItem: (lineId: string) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  /** Set (or clear, with an empty string) the special instructions on one line. */
  updateNote: (lineId: string, note: string) => void;
  clear: () => void;
  /** Re-read the server cart (e.g. after placing an order). */
  refresh: () => Promise<void>;
}

const CartContext = React.createContext<CartContextValue | undefined>(undefined);

const GUEST_KEY = 'foodbowl.guestCart.v1';
const MAX_QTY = 20;

// ── guest (logged-out) persistence ───────────────────────────────────────

function readGuestCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
}
function writeGuestCart(lines: CartLine[]) {
  try {
    if (lines.length === 0) localStorage.removeItem(GUEST_KEY);
    else localStorage.setItem(GUEST_KEY, JSON.stringify(lines));
  } catch {
    // Private mode / storage full: the cart just won't survive a reload.
  }
}

/**
 * Same base item with different modifier selections (e.g. "Mild" vs "Hot"
 * Butter Chicken) must NOT merge into one line — they're different orders.
 */
function computeLineId(menuItemId: string, modifiers?: SelectedModifier[], note?: string) {
  const mods = (modifiers ?? []).map((m) => m.id).sort().join(',');
  const instructions = (note ?? '').trim().toLowerCase();
  return mods || instructions ? `${menuItemId}:${mods}:${instructions}` : menuItemId;
}

// ── server ↔ UI mapping ──────────────────────────────────────────────────

function toLine(item: CartItemDTO): CartLine {
  return {
    lineId: item.id,
    menuItemId: item.menuItemId,
    name: item.name,
    price: Number(item.unitPrice),
    quantity: item.quantity,
    isVeg: item.isVeg,
    imageUrl: item.imageUrl,
    note: item.note,
    available: item.available,
    modifiers: item.modifiers.map((m) => ({
      id: m.modifierId,
      groupId: m.modifierGroupId,
      name: m.name,
      priceDelta: Number(m.priceDelta),
    })),
  };
}

const toRequest = (line: Pick<CartLine, 'menuItemId' | 'quantity' | 'modifiers'> & { note?: string | null }) => ({
  menuItemId: line.menuItemId,
  quantity: line.quantity,
  selectedModifiers: line.modifiers.map((m) => ({ modifierGroupId: m.groupId, modifierId: m.id })),
  note: line.note?.trim() || undefined,
});

/**
 * Cart state for both audiences:
 *  - Logged out: kept in localStorage so browsing → adding → logging in loses nothing.
 *  - Logged in: the server cart (/api/v1/cart) is the source of truth, so it
 *    follows the customer across devices. On login, any guest lines are merged
 *    into it. Prices always come from the server; the client never decides them.
 *
 * Changes apply to the screen immediately (optimistic) and are sent to the
 * server one at a time, in order; the server's answer then replaces the local
 * guess, and a failure rolls back to the server's real state with a message.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const userId = user?.id ?? null;

  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [ready, setReady] = React.useState(false);
  const linesRef = React.useRef(lines);
  React.useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  // Serialises server writes so quick successive taps can't race each other.
  const queue = React.useRef<Promise<unknown>>(Promise.resolve());

  const loadServerCart = React.useCallback(async () => {
    const cart = await apiClient.get<CartDTO>('/api/v1/cart');
    setLines(cart.items.map(toLine));
  }, []);

  // Load on mount and whenever the logged-in user changes.
  React.useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setReady(false);

    if (!userId) {
      setLines(readGuestCart());
      setReady(true);
      return;
    }

    (async () => {
      try {
        const guest = readGuestCart();
        let merged: CartDTO | null = null;
        for (const line of guest) {
          // One unavailable item shouldn't stop the rest from moving across.
          merged = await apiClient.post<CartDTO>('/api/v1/cart/items', toRequest(line)).catch(() => merged);
        }
        if (guest.length > 0) writeGuestCart([]);
        if (cancelled) return;
        if (merged) setLines(merged.items.map(toLine));
        else await loadServerCart();
      } catch (err) {
        if (!cancelled) {
          toast({
            title: 'Could not load your cart',
            description: err instanceof ApiError ? err.message : undefined,
            variant: 'error',
          });
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, authLoading, loadServerCart, toast]);

  /** Apply `optimistic` now; for logged-in users also send `call` and adopt the server's answer. */
  const mutate = React.useCallback(
    (optimistic: (prev: CartLine[]) => CartLine[], call?: () => Promise<CartDTO>) => {
      setLines((prev) => {
        const next = optimistic(prev);
        if (!userId) writeGuestCart(next);
        return next;
      });
      if (!userId || !call) return;

      queue.current = queue.current.then(async () => {
        try {
          const cart = await call();
          setLines(cart.items.map(toLine));
        } catch (err) {
          toast({
            title: "Couldn't update your cart",
            description: err instanceof ApiError ? err.message : undefined,
            variant: 'error',
          });
          await loadServerCart().catch(() => undefined);
        }
      });
    },
    [userId, toast, loadServerCart],
  );

  const addItem = React.useCallback<CartContextValue['addItem']>(
    (item, quantity = 1) => {
      const modifiers = item.modifiers ?? [];
      const note = item.note?.trim() || undefined;
      const lineId = computeLineId(item.menuItemId, modifiers, note);
      mutate(
        (prev) => {
          const existing = prev.find((l) => l.lineId === lineId);
          if (existing) {
            return prev.map((l) => (l.lineId === lineId ? { ...l, quantity: Math.min(l.quantity + quantity, MAX_QTY) } : l));
          }
          return [...prev, { ...item, note, lineId, quantity, modifiers, available: true }];
        },
        () => apiClient.post<CartDTO>('/api/v1/cart/items', toRequest({ menuItemId: item.menuItemId, quantity, modifiers, note })),
      );
    },
    [mutate],
  );

  const removeItem = React.useCallback<CartContextValue['removeItem']>(
    (lineId) =>
      mutate(
        (prev) => prev.filter((l) => l.lineId !== lineId),
        () => apiClient.delete<CartDTO>(`/api/v1/cart/items/${lineId}`),
      ),
    [mutate],
  );

  const setQuantity = React.useCallback<CartContextValue['setQuantity']>(
    (lineId, quantity) => {
      if (quantity <= 0) return removeItem(lineId);
      const clamped = Math.min(quantity, MAX_QTY);
      mutate(
        (prev) => prev.map((l) => (l.lineId === lineId ? { ...l, quantity: clamped } : l)),
        () => apiClient.patch<CartDTO>(`/api/v1/cart/items/${lineId}`, { quantity: clamped }),
      );
    },
    [mutate, removeItem],
  );

  const updateNote = React.useCallback<CartContextValue['updateNote']>(
    (lineId, note) => {
      const trimmed = note.trim();
      mutate(
        (prev) => prev.map((l) => (l.lineId === lineId ? { ...l, note: trimmed || null } : l)),
        () => apiClient.patch<CartDTO>(`/api/v1/cart/items/${lineId}`, { note: trimmed || null }),
      );
    },
    [mutate],
  );

  const clear = React.useCallback(
    () => mutate(() => [], () => apiClient.delete<CartDTO>('/api/v1/cart')),
    [mutate],
  );

  const refresh = React.useCallback(async () => {
    if (userId) await loadServerCart();
  }, [userId, loadServerCart]);

  const value = React.useMemo<CartContextValue>(() => {
    const purchasable = lines.filter((l) => l.available);
    return {
      lines,
      itemCount: purchasable.reduce((sum, l) => sum + l.quantity, 0),
      subtotal: purchasable.reduce((sum, l) => sum + l.price * l.quantity, 0),
      unavailableCount: lines.length - purchasable.length,
      ready,
      addItem,
      removeItem,
      setQuantity,
      updateNote,
      clear,
      refresh,
    };
  }, [lines, ready, addItem, removeItem, setQuantity, updateNote, clear, refresh]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = React.useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
