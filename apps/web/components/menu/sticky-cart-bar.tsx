'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, ShoppingBag } from 'lucide-react';
import { useCart } from '@/lib/cart-context';

/**
 * The persistent bottom "N items · $total → View cart" bar that appears the
 * moment something's added — the single most recognizable piece of
 * Swiggy/Zomato's UX. Sits above the mobile bottom nav; hidden on desktop,
 * where the header's cart icon badge is enough, and hidden on /cart itself
 * (no point telling you to view the cart you're already looking at).
 */
export function StickyCartBar() {
  const { itemCount, subtotal } = useCart();
  const pathname = usePathname();

  if (itemCount === 0 || pathname?.startsWith('/cart')) return null;

  return (
    <div className="fixed inset-x-0 bottom-16 z-30 px-3 pb-2 md:hidden">
      <Link
        href="/cart"
        className="flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-primary-foreground shadow-lg"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <ShoppingBag className="h-4 w-4" />
          {itemCount} {itemCount === 1 ? 'item' : 'items'} · ${subtotal.toFixed(2)}
        </span>
        <span className="flex items-center gap-1 text-sm font-semibold">
          View cart <ChevronRight className="h-4 w-4" />
        </span>
      </Link>
    </div>
  );
}
