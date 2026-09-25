'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, MessageSquareText, Minus, Plus, Plus as PlusIcon, ShoppingBag, Trash2 } from 'lucide-react';
import type { AddressDTO, OrderDTO, RestaurantDTO } from '@foodbowl/shared';
import { AddressForm } from '@/components/address/address-form';
import { FoodImage } from '@/components/menu/food-image';
import { VegIndicator } from '@/components/menu/veg-indicator';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toaster';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useCart } from '@/lib/cart-context';
import { addressLine, money } from '@/lib/format';
import { cn } from '@/lib/utils';

const QUICK_NOTES = ['Leave at the door', "Don't ring the bell", 'Call when you arrive', 'No cutlery or napkins'];

export default function CartPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const { lines, subtotal, unavailableCount, ready, setQuantity, removeItem, updateNote, refresh } = useCart();
  const [editingNote, setEditingNote] = React.useState<{ id: string; text: string } | null>(null);

  const [restaurant, setRestaurant] = React.useState<RestaurantDTO | null>(null);
  const [addresses, setAddresses] = React.useState<AddressDTO[] | null>(null);
  const [addressId, setAddressId] = React.useState<string | null>(null);
  const [addingAddress, setAddingAddress] = React.useState(false);
  const [notes, setNotes] = React.useState('');
  const [placing, setPlacing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiClient.get<RestaurantDTO>('/api/v1/restaurant').then(setRestaurant).catch(() => undefined);
  }, []);

  React.useEffect(() => {
    if (!user) return;
    apiClient
      .get<AddressDTO[]>('/api/v1/users/me/addresses')
      .then((list) => {
        setAddresses(list);
        setAddressId((current) => current ?? list.find((a) => a.isDefault)?.id ?? list[0]?.id ?? null);
      })
      .catch(() => setAddresses([]));
  }, [user]);

  if (!ready || authLoading) return <div className="container py-24" />;

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

  const deliveryFee = Number(restaurant?.deliveryFee ?? 0);
  const minOrder = Number(restaurant?.minOrderAmount ?? 0);
  const total = subtotal + deliveryFee;
  const closed = restaurant ? !restaurant.isOpen : false;
  const belowMinimum = subtotal < minOrder;

  // The first reason checkout is not possible right now, shown on the button itself.
  const blocker = !user
    ? null
    : closed
      ? 'Restaurant is closed'
      : unavailableCount > 0
        ? 'Remove unavailable items'
        : belowMinimum
          ? `Add ${money(minOrder - subtotal)} more (min ${money(minOrder)})`
          : !addressId
            ? 'Choose a delivery address'
            : null;

  async function placeOrder() {
    if (!addressId) return;
    setPlacing(true);
    setError(null);
    try {
      const order = await apiClient.post<OrderDTO>('/api/v1/orders', { addressId, notes: notes.trim() || undefined });
      await refresh();
      toast({ title: `Order ${order.orderNumber} placed`, description: 'The restaurant has been notified.', variant: 'success' });
      router.push(`/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not place your order. Please try again.');
      await refresh().catch(() => undefined);
    } finally {
      setPlacing(false);
    }
  }

  const checkoutButton = user ? (
    <Button className="w-full" disabled={placing || blocker !== null} onClick={placeOrder}>
      {placing ? 'Placing order…' : (blocker ?? `Place order · ${money(total)}`)}
    </Button>
  ) : (
    <Button className="w-full" asChild>
      <Link href="/login?next=/cart">Log in to place your order</Link>
    </Button>
  );

  return (
    <div className="container flex flex-col gap-6 py-6 pb-44 md:grid md:grid-cols-3 md:pb-8">
      <div className="flex flex-col gap-4 md:col-span-2">
        <h1 className="text-xl font-semibold">Your cart</h1>

        {closed && (
          <Notice tone="warning">
            {restaurant?.name ?? 'The restaurant'} is closed right now and isn't taking orders. Your cart is saved.
          </Notice>
        )}
        {unavailableCount > 0 && (
          <Notice tone="warning">
            Some items are no longer available. Remove them (marked below) to continue.
          </Notice>
        )}

        <Card>
          <CardContent className="divide-y divide-border p-0">
            {lines.map((line) => (
              <div key={line.lineId} className={cn('flex flex-col gap-2 p-4', !line.available && 'bg-destructive/5')} data-testid="cart-line">
                <div className="flex items-start gap-3">
                  <FoodImage src={line.imageUrl} alt={line.name} className="h-16 w-16 shrink-0 rounded-lg sm:h-20 sm:w-20" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <VegIndicator isVeg={line.isVeg} />
                      <p className={cn('truncate font-medium', !line.available && 'text-muted-foreground line-through')}>{line.name}</p>
                    </div>
                    {line.modifiers.length > 0 && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{line.modifiers.map((m) => m.name).join(', ')}</p>
                    )}
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {line.available ? money(line.price) : <span className="font-medium text-destructive">No longer available</span>}
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-destructive" onClick={() => removeItem(line.lineId)} aria-label="Remove item">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pl-[4.75rem] sm:pl-[5.75rem]">
                  {line.available ? (
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQuantity(line.lineId, line.quantity - 1)} aria-label="Decrease quantity">
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-5 text-center text-sm font-medium" data-testid="line-quantity">{line.quantity}</span>
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQuantity(line.lineId, line.quantity + 1)} aria-label="Increase quantity">
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <span />
                  )}
                  {line.available && <span className="text-sm font-semibold tabular-nums">{money(line.price * line.quantity)}</span>}
                </div>

                {line.available && (
                  <div className="pl-[4.75rem] sm:pl-[5.75rem]">
                    {editingNote?.id === line.lineId ? (
                      <form
                        className="flex gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          updateNote(line.lineId, editingNote.text);
                          setEditingNote(null);
                        }}
                      >
                        <Input
                          autoFocus
                          aria-label={`Instructions for ${line.name}`}
                          placeholder="e.g. no onions, extra spicy"
                          maxLength={300}
                          value={editingNote.text}
                          onChange={(e) => setEditingNote({ id: line.lineId, text: e.target.value })}
                          className="h-9"
                        />
                        <Button type="submit" size="sm" data-testid="save-line-note">Save</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditingNote(null)}>Cancel</Button>
                      </form>
                    ) : line.note ? (
                      <button
                        type="button"
                        onClick={() => setEditingNote({ id: line.lineId, text: line.note ?? '' })}
                        className="flex items-start gap-1.5 rounded bg-warning/10 px-2 py-1 text-left text-xs hover:bg-warning/20"
                        data-testid="line-note"
                      >
                        <MessageSquareText className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>“{line.note}” <span className="text-muted-foreground underline">Edit</span></span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingNote({ id: line.lineId, text: '' })}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        data-testid="add-line-note"
                      >
                        <MessageSquareText className="h-3 w-3" /> Add instructions
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {user && (
          <Card>
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Deliver to</h2>
                {!addingAddress && (
                  <Button size="sm" variant="ghost" onClick={() => setAddingAddress(true)}>
                    <PlusIcon className="h-3.5 w-3.5" /> New address
                  </Button>
                )}
              </div>

              {addresses === null ? (
                <p className="text-sm text-muted-foreground">Loading addresses…</p>
              ) : (
                <>
                  {addresses.length === 0 && !addingAddress && (
                    <p className="text-sm text-muted-foreground">You have no saved addresses yet — add one to continue.</p>
                  )}
                  <div className="flex flex-col gap-2">
                    {addresses.map((a) => (
                      <label
                        key={a.id}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm',
                          addressId === a.id ? 'border-primary bg-primary/5' : 'border-border',
                        )}
                      >
                        <input type="radio" name="address" className="mt-1" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                        <span>
                          <span className="font-medium">{a.label}</span>
                          {a.isDefault && <span className="ml-2 text-xs text-muted-foreground">Default</span>}
                          <span className="block text-muted-foreground">{addressLine(a)}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              )}

              {addingAddress && (
                <div className="rounded-md border border-dashed border-border p-3">
                  <AddressForm
                    submitLabel="Save and deliver here"
                    onCancel={() => setAddingAddress(false)}
                    onSaved={(saved) => {
                      setAddresses((prev) => [...(prev ?? []).map((a) => (saved.isDefault ? { ...a, isDefault: false } : a)), saved]);
                      setAddressId(saved.id);
                      setAddingAddress(false);
                    }}
                  />
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label htmlFor="order-notes" className="text-sm font-medium">
                  Instructions for the restaurant &amp; delivery <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <div className="flex flex-wrap gap-1.5" data-testid="quick-notes">
                  {QUICK_NOTES.map((phrase) => {
                    const on = notes.includes(phrase);
                    return (
                      <button
                        key={phrase}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setNotes((n) => (on ? n.replace(phrase, '').replace(/\s{2,}/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '') : [n.trim().replace(/[.\s]+$/, ''), phrase].filter(Boolean).join('. ')))}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                          on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {phrase}
                      </button>
                    );
                  })}
                </div>
                <Textarea id="order-notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Allergies, gate code, where to leave it…" />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="hidden h-fit md:sticky md:top-20 md:block">
        <CardContent className="flex flex-col gap-4 p-5">
          <h2 className="font-semibold">Order summary</h2>
          <SummaryRows subtotal={subtotal} deliveryFee={deliveryFee} total={total} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          {checkoutButton}
          <p className="text-center text-xs text-muted-foreground">Cash on delivery only.</p>
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-background p-4 pb-safe md:hidden">
        <div className="mb-3 flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">Total (incl. {money(deliveryFee)} delivery)</span>
          <span className="text-base font-semibold">{money(total)}</span>
        </div>
        {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
        {checkoutButton}
      </div>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'warning'; children: React.ReactNode }) {
  return (
    <div className={cn('flex items-start gap-2 rounded-md border p-3 text-sm', tone === 'warning' && 'border-warning/50 bg-warning/10')}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <p>{children}</p>
    </div>
  );
}

function SummaryRows({ subtotal, deliveryFee, total }: { subtotal: number; deliveryFee: number; total: number }) {
  return (
    <>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span>{money(subtotal)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Delivery fee</span>
        <span>{money(deliveryFee)}</span>
      </div>
      <Separator />
      <div className="flex justify-between font-semibold">
        <span>Total</span>
        <span>{money(total)}</span>
      </div>
    </>
  );
}
