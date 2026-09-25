'use client';

import * as React from 'react';
import { jumpToCategory, useActiveCategory } from '@/lib/use-active-category';
import { cn } from '@/lib/utils';

interface Category {
  id: string;
  name: string;
  count?: number;
}

/**
 * Phones: a sticky horizontal chip strip that jumps to a category on tap and
 * highlights the one in view (the whole menu stays one continuous scroll; the
 * chips are just quick navigation). The active chip scrolls itself into view.
 */
export function CategoryChips({ categories }: { categories: Category[] }) {
  const activeId = useActiveCategory(categories.map((c) => c.id));
  const strip = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const chip = strip.current?.querySelector<HTMLElement>('[data-active="true"]');
    chip?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [activeId]);

  return (
    <div className="sticky top-14 z-20 -mx-4 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <div ref={strip} className="flex gap-2 overflow-x-auto scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            data-active={activeId === cat.id}
            onClick={() => jumpToCategory(cat.id)}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              activeId === cat.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:text-foreground',
            )}
          >
            {cat.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Tablets and desktops: a sticky category list beside the menu, with item counts. */
export function CategorySidebar({ categories }: { categories: Category[] }) {
  const activeId = useActiveCategory(categories.map((c) => c.id));
  return (
    <nav aria-label="Menu categories" className="sticky top-24 hidden self-start md:block">
      <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Menu</p>
      <ul className="flex flex-col gap-0.5">
        {categories.map((cat) => (
          <li key={cat.id}>
            <button
              type="button"
              onClick={() => jumpToCategory(cat.id)}
              className={cn(
                'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
                activeId === cat.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <span className="truncate">{cat.name}</span>
              {cat.count !== undefined && <span className="ml-2 text-xs opacity-70">{cat.count}</span>}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
