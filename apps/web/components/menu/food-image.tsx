'use client';

import * as React from 'react';
import { UtensilsCrossed } from 'lucide-react';
import { assetUrl } from '@/lib/asset-url';
import { cn } from '@/lib/utils';

/**
 * A dish photo that never breaks the layout. Uses a plain <img> (not
 * next/image) on purpose: photos can come from anywhere — bundled files, the
 * built-in upload storage, Supabase, or a URL an owner pasted — and
 * next/image throws for any host not pre-listed in next.config. If there is no
 * photo, or it fails to load, a soft placeholder of the same size shows instead.
 */
export function FoodImage({
  src,
  alt,
  className,
  placeholder = true,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  /** Render a placeholder tile when there is no photo (otherwise nothing). */
  placeholder?: boolean;
}) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);
  const resolved = assetUrl(src);

  if (!resolved || failed) {
    if (!placeholder) return null;
    return (
      <div
        aria-hidden
        className={cn('flex items-center justify-center bg-gradient-to-br from-accent to-muted text-muted-foreground/60', className)}
      >
        <UtensilsCrossed className="h-1/4 w-1/4 min-h-5 min-w-5" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolved}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn('bg-muted object-cover', className)}
    />
  );
}
