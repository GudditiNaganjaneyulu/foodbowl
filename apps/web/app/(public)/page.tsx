'use client';

import { Clock, MapPin, ServerCrash } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MenuItemCard } from '@/components/menu/menu-item-card';
import { useMenu } from './use-menu';

export default function LandingPage() {
  const { categories, error, isLoading } = useMenu();

  return (
    <div>
      <section className="border-b border-border bg-gradient-to-b from-accent/60 to-background">
        <div className="container flex flex-col gap-4 py-10 md:py-14">
          <Badge variant="secondary" className="w-fit">
            Open now · 10:00 AM – 10:30 PM
          </Badge>
          <h1 className="max-w-2xl text-3xl font-bold tracking-tight md:text-5xl">
            FoodBowl Kitchen
          </h1>
          <p className="max-w-xl text-muted-foreground md:text-lg">
            Home-style comfort food, made fresh to order and delivered straight to your door.
          </p>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" /> 221B Curry Lane, Flavor Town
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> ~30–40 min delivery
            </span>
          </div>
        </div>
      </section>

      <section className="container py-8 md:py-10">
        {error && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center text-muted-foreground">
            <ServerCrash className="h-8 w-8" />
            <p className="max-w-sm text-sm">{error}</p>
          </div>
        )}

        {isLoading && !error && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        )}

        {categories && categories.length > 0 && (
          <Tabs defaultValue={categories[0]!.id}>
            <TabsList>
              {categories.map((cat) => (
                <TabsTrigger key={cat.id} value={cat.id}>
                  {cat.name}
                </TabsTrigger>
              ))}
            </TabsList>
            {categories.map((cat) => (
              <TabsContent key={cat.id} value={cat.id}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {cat.menuItems.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={{
                        id: item.id,
                        name: item.name,
                        description: item.description,
                        price: Number(item.price),
                        isVeg: item.isVeg,
                      }}
                    />
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}

        {categories && categories.length === 0 && (
          <p className="py-16 text-center text-muted-foreground">
            No menu items yet — run <code className="rounded bg-muted px-1.5 py-0.5">pnpm db:seed</code> to load
            demo data.
          </p>
        )}
      </section>
    </div>
  );
}
