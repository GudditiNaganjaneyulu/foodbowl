'use client';

import * as React from 'react';

/** Which category section (`#category-<id>`) is currently under the sticky header. */
export function useActiveCategory(ids: string[]) {
  const key = ids.join('|');
  const [activeId, setActiveId] = React.useState<string | undefined>(ids[0]);

  React.useEffect(() => {
    if (ids.length === 0) return;
    setActiveId((current) => (current && ids.includes(current) ? current : ids[0]));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible) setActiveId(visible.target.id.replace('category-', ''));
      },
      { rootMargin: '-120px 0px -70% 0px', threshold: 0 },
    );
    for (const id of ids) {
      const el = document.getElementById(`category-${id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // `key` is the stable identity of `ids`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return activeId;
}

export function jumpToCategory(id: string) {
  document.getElementById(`category-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
