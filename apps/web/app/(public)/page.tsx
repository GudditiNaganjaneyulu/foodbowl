'use client';

import * as React from 'react';
import { Clock, MapPin, Search, ServerCrash, X } from 'lucide-react';
import type { RestaurantDTO } from '@foodbowl/shared';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MenuItemRow } from '@/components/menu/menu-item-row';
import { VegIndicator } from '@/components/menu/veg-indicator';
import { ItemDetailSheet } from '@/components/menu/item-detail-sheet';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useMenu, type MenuItemDTO } from './use-menu';
import { CategoryChips, CategorySidebar } from './category-chips';

/** "22:30" → "10:30 PM" */
function formatClock(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function LandingPage() {
  const { categories, error, isLoading } = useMenu();
  const [search, setSearch] = React.useState('');
  const [vegOnly, setVegOnly] = React.useState(false);
  const [detailItem, setDetailItem] = React.useState<MenuItemDTO | null>(null);
  const [restaurant, setRestaurant] = React.useState<RestaurantDTO | null>(null);

  React.useEffect(() => {
    apiClient.get<RestaurantDTO>('/api/v1/restaurant').then(setRestaurant).catch(() => undefined);
  }, []);

  const filteredCategories = React.useMemo(() => {
    if (!categories) return null;
    const query = search.trim().toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        menuItems: cat.menuItems.filter(
          (item) =>
            (!query || item.name.toLowerCase().includes(query)) && (!vegOnly || item.isVeg),
        ),
      }))
      .filter((cat) => cat.menuItems.length > 0);
  }, [categories, search, vegOnly]);

  return (
    <div>
      {/* Restaurant banner — the "who/what/when" block every Swiggy/Zomato
          restaurant page opens with. */}
      <section className="border-b border-border bg-gradient-to-b from-accent/60 to-background">
        <div className="container flex flex-col gap-3 py-6 md:py-10">
          <div className="flex flex-wrap items-center gap-2">
            {restaurant && (
              <Badge variant={restaurant.isOpen ? 'success' : 'destructive'} className="gap-1" data-testid="open-badge">
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" /> {restaurant.isOpen ? 'Open now' : 'Closed — not taking orders'}
              </Badge>
            )}
            {restaurant?.opensAt && restaurant.closesAt && (
              <span className="text-xs text-muted-foreground">
                {formatClock(restaurant.opensAt)} – {formatClock(restaurant.closesAt)}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-4xl">{restaurant?.name ?? 'FoodBowl Kitchen'}</h1>
          {restaurant?.description && <p className="max-w-xl text-sm text-muted-foreground md:text-base">{restaurant.description}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground md:text-sm">
            {restaurant?.address && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> {restaurant.address}
              </span>
            )}
            {restaurant && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Delivery ${Number(restaurant.deliveryFee).toFixed(2)}
                {Number(restaurant.minOrderAmount) > 0 && ` · min order $${Number(restaurant.minOrderAmount).toFixed(2)}`}
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="container py-4">
        {/* Search + veg filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for dishes"
              className="pl-9 pr-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            aria-pressed={vegOnly}
            onClick={() => setVegOnly((v) => !v)}
            className={cn('gap-1.5 shrink-0', vegOnly && 'border-success bg-success/10 text-success')}
          >
            <VegIndicator isVeg />
            Veg only
          </Button>
        </div>
      </div>

      {error && (
        <div className="container flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center text-muted-foreground">
          <ServerCrash className="h-8 w-8" />
          <p className="max-w-sm text-sm">{error}</p>
        </div>
      )}

      {isLoading && !error && (
        <div className="container flex flex-col gap-3 py-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      )}

      {filteredCategories && filteredCategories.length > 0 && (
        <div className="container md:grid md:grid-cols-[12rem_minmax(0,1fr)] md:gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] md:pt-4">
          <CategorySidebar categories={filteredCategories.map((c) => ({ id: c.id, name: c.name, count: c.menuItems.length }))} />
          <div className="min-w-0">
            <CategoryChips categories={filteredCategories.map((c) => ({ id: c.id, name: c.name }))} />

            <div className="flex flex-col gap-8 py-2 md:gap-10">
              {filteredCategories.map((cat) => (
                <section key={cat.id} id={`category-${cat.id}`} className="scroll-mt-32">
                  <h2 className="mb-1 text-lg font-semibold md:mb-4 md:text-xl">
                    {cat.name} <span className="text-sm font-normal text-muted-foreground">({cat.menuItems.length})</span>
                  </h2>
                  <div className="md:grid md:grid-cols-2 md:gap-5 xl:grid-cols-3">
                    {cat.menuItems.map((item) => (
                      <MenuItemRow
                        key={item.id}
                        onOpenDetail={() => setDetailItem(item)}
                        item={{
                          id: item.id,
                          name: item.name,
                          description: item.description,
                          price: Number(item.price),
                          isVeg: item.isVeg,
                          imageUrl: item.imageUrl,
                          hasModifiers: item.modifierGroups.length > 0,
                        }}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      {categories && filteredCategories && filteredCategories.length === 0 && (
        <p className="container py-16 text-center text-muted-foreground">
          {categories.length === 0 ? (
            <>
              No menu items yet — run <code className="rounded bg-muted px-1.5 py-0.5">pnpm db:seed</code> to load
              demo data.
            </>
          ) : (
            'No dishes match your search.'
          )}
        </p>
      )}

      <ItemDetailSheet item={detailItem} open={detailItem !== null} onOpenChange={(open) => !open && setDetailItem(null)} />
    </div>
  );
}
