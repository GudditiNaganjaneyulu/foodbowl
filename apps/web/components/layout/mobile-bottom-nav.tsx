'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ShoppingCart, ClipboardList, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useCart } from '@/lib/cart-context';
import { useAuth } from '@/lib/auth-context';

const BASE_TABS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/orders', label: 'Orders', icon: ClipboardList },
  { href: '/cart', label: 'Cart', icon: ShoppingCart },
] as const;

/**
 * Fixed bottom tab bar — the primary navigation pattern on Swiggy/Zomato's
 * mobile apps, replacing a hamburger menu for the handful of top-level
 * customer destinations. Desktop keeps the header nav instead (this is
 * `md:hidden`).
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const { itemCount } = useCart();
  const { user } = useAuth();

  // Logged out: the 4th tab goes straight to login rather than a dead-end
  // "please log in" profile page.
  const tabs = [
    ...BASE_TABS,
    user
      ? { href: '/profile', label: 'Account', icon: User }
      : { href: '/login', label: 'Log in', icon: User },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-safe md:hidden">
      <div className="grid grid-cols-4">
        {tabs.map((tab) => {
          const active = tab.href === '/' ? pathname === '/' : pathname?.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <span className="relative">
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                {tab.href === '/cart' && itemCount > 0 && (
                  <Badge
                    variant="default"
                    className="absolute -right-2 -top-1.5 h-4 min-w-4 justify-center px-1 text-[9px] leading-none"
                  >
                    {itemCount}
                  </Badge>
                )}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
