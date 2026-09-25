'use client';

import * as React from 'react';
import type { RestaurantDTO } from '@foodbowl/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toaster';
import { apiClient, ApiError } from '@/lib/api-client';

export function RestaurantSettings() {
  const { toast } = useToast();
  const [restaurant, setRestaurant] = React.useState<RestaurantDTO | null>(null);
  const [form, setForm] = React.useState({ name: '', description: '', address: '', phone: '', opensAt: '', closesAt: '', minOrderAmount: '', deliveryFee: '' });
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [togglingOpen, setTogglingOpen] = React.useState(false);

  const adopt = React.useCallback((r: RestaurantDTO) => {
    setRestaurant(r);
    setForm({
      name: r.name,
      description: r.description ?? '',
      address: r.address ?? '',
      phone: r.phone ?? '',
      opensAt: r.opensAt ?? '',
      closesAt: r.closesAt ?? '',
      minOrderAmount: Number(r.minOrderAmount).toString(),
      deliveryFee: Number(r.deliveryFee).toString(),
    });
  }, []);

  React.useEffect(() => {
    apiClient.get<RestaurantDTO>('/api/v1/restaurant').then(adopt).catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load settings'));
  }, [adopt]);

  async function setOpen(isOpen: boolean) {
    setTogglingOpen(true);
    try {
      adopt(await apiClient.patch<RestaurantDTO>('/api/v1/restaurant', { isOpen }));
      toast({ title: isOpen ? 'Now accepting orders' : 'Orders paused', description: isOpen ? undefined : 'Customers can browse but not check out.', variant: 'success' });
    } catch (err) {
      toast({ title: "Couldn't update", description: err instanceof ApiError ? err.message : undefined, variant: 'error' });
    } finally {
      setTogglingOpen(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      adopt(
        await apiClient.patch<RestaurantDTO>('/api/v1/restaurant', {
          name: form.name.trim(),
          description: form.description.trim() || null,
          address: form.address.trim() || null,
          phone: form.phone.trim() || null,
          opensAt: form.opensAt || null,
          closesAt: form.closesAt || null,
          minOrderAmount: Number(form.minOrderAmount),
          deliveryFee: Number(form.deliveryFee),
        }),
      );
      toast({ title: 'Settings saved', variant: 'success' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  if (!restaurant) return error ? <p className="text-sm text-destructive">{error}</p> : <Skeleton className="h-64 w-full max-w-2xl" />;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Card>
        <CardContent className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="font-semibold">{restaurant.isOpen ? 'Open for orders' : 'Not taking orders'}</p>
            <p className="text-sm text-muted-foreground">
              {restaurant.isOpen ? 'Customers can check out.' : 'Customers can browse the menu but cannot place orders. Orders already placed continue as normal.'}
            </p>
          </div>
          <Switch aria-label="Open for orders" checked={restaurant.isOpen} disabled={togglingOpen} onCheckedChange={setOpen} data-testid="open-switch" />
        </CardContent>
      </Card>

      <form onSubmit={save}>
        <Card>
          <CardHeader>
            <CardTitle>Restaurant details</CardTitle>
            <CardDescription>Shown on the storefront and used at checkout.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="r-name">Name</Label>
              <Input id="r-name" required value={form.name} onChange={set('name')} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="r-desc">Description</Label>
              <Textarea id="r-desc" value={form.description} onChange={set('description')} maxLength={500} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="r-address">Address</Label>
              <Input id="r-address" value={form.address} onChange={set('address')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="r-phone">Phone</Label>
              <Input id="r-phone" value={form.phone} onChange={set('phone')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="r-opens">Opens at</Label>
              <Input id="r-opens" type="time" value={form.opensAt} onChange={set('opensAt')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="r-closes">Closes at</Label>
              <Input id="r-closes" type="time" value={form.closesAt} onChange={set('closesAt')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="r-min">Minimum order ($)</Label>
              <Input id="r-min" required type="number" min="0" step="0.01" value={form.minOrderAmount} onChange={set('minOrderAmount')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="r-fee">Delivery fee ($)</Label>
              <Input id="r-fee" required type="number" min="0" step="0.01" value={form.deliveryFee} onChange={set('deliveryFee')} />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Opening hours are shown to customers for information. Whether orders are accepted is controlled only by the switch above.
            </p>
            {error && <p className="text-sm text-destructive sm:col-span-2" role="alert">{error}</p>}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving} data-testid="save-settings">
                {saving ? 'Saving…' : 'Save settings'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
