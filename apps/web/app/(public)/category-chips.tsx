'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Sticky horizontal chip strip that jumps to a category's section on tap and
 * highlights whichever section is currently in view — the pattern
 * Swiggy/Zomato use instead of tabbed show/hide (the whole menu stays one
 * continuous scroll, chips are just quick navigation into it).
 */
export function CategoryChips({ categories }: { categories: { id: string; name: string }[] }) {
  const [activeId, setActiveId] = React.useState(categories[0]?.id);

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible) setActiveId(visible.target.id.replace('category-', ''));
      },
      { rootMargin: '-120px 0px -70% 0px', threshold: 0 },
    );
    for (const cat of categories) {
      const el = document.getElementById(`category-${cat.id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [categories]);

  function jumpTo(id: string) {
    document.getElementById(`category-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="sticky top-14 z-20 -mx-4 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:top-16">
      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => jumpTo(cat.id)}
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
