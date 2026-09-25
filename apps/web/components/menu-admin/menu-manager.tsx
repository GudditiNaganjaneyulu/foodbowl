'use client';

import * as React from 'react';
import { EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { FoodImage } from '@/components/menu/food-image';
import { VegIndicator } from '@/components/menu/veg-indicator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toaster';
import { apiClient, ApiError } from '@/lib/api-client';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ItemDialog, type AdminItem } from './item-dialog';

export interface AdminCategory {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  menuItems: AdminItem[];
}

/** Owner/staff menu editor: categories, items, availability, options and photos. */
export function MenuManager() {
  const { toast } = useToast();
  const [categories, setCategories] = React.useState<AdminCategory[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [newCategory, setNewCategory] = React.useState('');
  const [renaming, setRenaming] = React.useState<{ id: string; name: string } | null>(null);
  const [dialog, setDialog] = React.useState<{ categoryId: string; item?: AdminItem } | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await apiClient.get<{ categories: AdminCategory[] }>('/api/v1/menu/admin');
      setCategories(res.categories);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the menu');
    }
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);

  const fail = (title: string) => (err: unknown) =>
    toast({ title, description: err instanceof ApiError ? err.message : undefined, variant: 'error' });

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = newCategory.trim();
    if (!name) return;
    try {
      await apiClient.post('/api/v1/menu/categories', { name, sortOrder: (categories?.length ?? 0) });
      setNewCategory('');
      await load();
    } catch (err) {
      fail("Couldn't add the category")(err);
    }
  }

  async function patchCategory(id: string, body: object, success?: string) {
    try {
      await apiClient.patch(`/api/v1/menu/categories/${id}`, body);
      if (success) toast({ title: success, variant: 'success' });
      await load();
    } catch (err) {
      fail("Couldn't update the category")(err);
    }
  }

  async function setAvailable(item: AdminItem, isAvailable: boolean) {
    setCategories((prev) => prev && prev.map((c) => ({ ...c, menuItems: c.menuItems.map((i) => (i.id === item.id ? { ...i, isAvailable } : i)) })));
    try {
      await apiClient.patch(`/api/v1/menu/items/${item.id}`, { isAvailable });
    } catch (err) {
      fail("Couldn't change availability")(err);
      await load();
    }
  }

  async function removeItem(item: AdminItem) {
    if (!confirm(`Delete "${item.name}"? This can't be undone.`)) return;
    try {
      await apiClient.delete(`/api/v1/menu/items/${item.id}`);
      toast({ title: `Deleted ${item.name}` });
      await load();
    } catch (err) {
      fail("Can't delete this item")(err);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Menu</h2>
          <p className="text-sm text-muted-foreground">Changes go live for customers immediately.</p>
        </div>
        <form onSubmit={addCategory} className="flex gap-2">
          <Input aria-label="New category name" placeholder="New category…" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} maxLength={80} className="w-48" />
          <Button type="submit" variant="outline" disabled={!newCategory.trim()}>
            <Plus className="h-4 w-4" /> Add category
          </Button>
        </form>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!categories && !error && <Skeleton className="h-48 w-full" />}

      {categories?.map((category) => (
        <Card key={category.id} className={cn(!category.isActive && 'opacity-70')} data-testid="menu-category" data-category={category.name}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <div className="flex min-w-0 items-center gap-2">
              {renaming?.id === category.id ? (
                <form
                  className="flex gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (renaming.name.trim()) await patchCategory(category.id, { name: renaming.name.trim() });
                    setRenaming(null);
                  }}
                >
                  <Input autoFocus aria-label="Category name" value={renaming.name} onChange={(e) => setRenaming({ id: category.id, name: e.target.value })} className="h-8 w-48" />
                  <Button type="submit" size="sm">Save</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
                </form>
              ) : (
                <>
                  <h3 className="truncate text-base font-semibold">{category.name}</h3>
                  <span className="text-sm text-muted-foreground">({category.menuItems.length})</span>
                  {!category.isActive && (
                    <Badge variant="outline" className="gap-1">
                      <EyeOff className="h-3 w-3" /> Hidden
                    </Badge>
                  )}
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Rename ${category.name}`} onClick={() => setRenaming({ id: category.id, name: category.name })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Visible
                <Switch aria-label={`Show ${category.name} to customers`} checked={category.isActive} onCheckedChange={(v) => patchCategory(category.id, { isActive: v })} />
              </label>
              <Button size="sm" onClick={() => setDialog({ categoryId: category.id })} data-testid="add-item">
                <Plus className="h-3.5 w-3.5" /> Add item
              </Button>
            </div>
          </div>
          <CardContent className="divide-y divide-border p-0">
            {category.menuItems.length === 0 && <p className="p-4 text-sm text-muted-foreground">No items yet.</p>}
            {category.menuItems.map((item) => (
              <div key={item.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 p-4', !item.isAvailable && 'bg-muted/40')} data-testid="menu-item" data-item={item.name}>
                <FoodImage src={item.imageUrl} alt={item.name} className="h-12 w-12 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 basis-40">
                  <VegIndicator isVeg={item.isVeg} className="mb-1" />
                  <p className={cn('line-clamp-2 font-medium leading-snug', !item.isAvailable && 'text-muted-foreground')}>{item.name}</p>
                  {item.modifierGroups.length > 0 && (
                    <p className="text-xs text-primary">{item.modifierGroups.length} option group{item.modifierGroups.length === 1 ? '' : 's'}</p>
                  )}
                  {item.description && <p className="line-clamp-1 text-xs text-muted-foreground">{item.description}</p>}
                </div>
                {/* Phones: this row wraps under the name (full width, spread out). Wider screens: it sits inline. */}
                <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end sm:gap-3">
                  <span className="text-sm font-semibold tabular-nums sm:w-16 sm:text-right">{money(item.price)}</span>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{item.isAvailable ? 'Available' : 'Sold out'}</span>
                    <Switch aria-label={`${item.name} available`} checked={item.isAvailable} onCheckedChange={(v) => setAvailable(item, v)} />
                  </label>
                  <div className="flex items-center">
                    <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={`Edit ${item.name}`} onClick={() => setDialog({ categoryId: category.id, item })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" aria-label={`Delete ${item.name}`} onClick={() => removeItem(item)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <ItemDialog
        state={dialog}
        onClose={() => setDialog(null)}
        onSaved={async () => {
          await load();
        }}
      />
    </div>
  );
}
