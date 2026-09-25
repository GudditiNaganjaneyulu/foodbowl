'use client';

import Link from 'next/link';
import { ShoppingCart, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';
import { useCart } from '@/lib/cart-context';
import { AccountMenu } from './account-menu';
import { NotificationBell } from '@/components/notifications/notification-bell';

const NAV_LINKS = [
  { href: '/', label: 'Menu' },
  { href: '/orders', label: 'My orders', requiresAuth: true },
];

/**
 * Minimal top bar — logo + theme toggle everywhere, cart icon and full nav
 * links on desktop only. On mobile, primary navigation (Home/Orders/Cart/
 * Account) lives in the fixed bottom tab bar instead (see
 * components/layout/mobile-bottom-nav.tsx), matching how Swiggy/Zomato keep
 * their top bar close to empty and put navigation within thumb reach at the
 * bottom — so there's deliberately no hamburger menu here.
 */
export function StorefrontHeader() {
  const { user } = useAuth();
  const { itemCount } = useCart();

  const links = NAV_LINKS.filter((l) => !l.requiresAuth || user);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-14 items-center justify-between gap-4 md:h-16">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg shrink-0">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <UtensilsCrossed className="h-4.5 w-4.5" />
          </span>
          FoodBowl
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-muted-foreground transition-colors hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <NotificationBell />
          <ThemeToggle />

          <Button variant="ghost" size="icon" className="relative hidden md:inline-flex" asChild>
            <Link href="/cart" aria-label="Cart">
              <ShoppingCart className="h-[1.15rem] w-[1.15rem]" />
              {itemCount > 0 && (
                <Badge
                  variant="default"
                  className="absolute -right-1 -top-1 h-4.5 min-w-4.5 justify-center px-1 text-[10px] leading-none"
                >
                  {itemCount}
                </Badge>
              )}
            </Link>
          </Button>

          <div className="hidden md:block">
            {user ? (
              <AccountMenu />
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/login">Log in</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/register">Sign up</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
