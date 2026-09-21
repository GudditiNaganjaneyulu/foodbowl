'use client';

import * as React from 'react';
import Link from 'next/link';
import { Menu, ShoppingCart, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';
import { useCart } from '@/lib/cart-context';
import { dashboardHomeFor } from '@/lib/dashboard-routes';
import { AccountMenu } from './account-menu';

const NAV_LINKS = [
  { href: '/', label: 'Menu' },
  { href: '/orders', label: 'My orders', requiresAuth: true },
];

export function StorefrontHeader() {
  const { user } = useAuth();
  const { itemCount } = useCart();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const links = NAV_LINKS.filter((l) => !l.requiresAuth || user);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-16 items-center justify-between gap-4">
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
          <ThemeToggle />

          <Button variant="ghost" size="icon" className="relative" asChild>
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

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>FoodBowl</SheetTitle>
              </SheetHeader>
              <nav className="mt-6 flex flex-col gap-4 text-sm font-medium">
                {links.map((link) => (
                  <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)}>
                    {link.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-8 flex flex-col gap-2">
                {user ? (
                  <>
                    <Link href="/profile" onClick={() => setMobileOpen(false)} className="text-sm font-medium">
                      Profile
                    </Link>
                    {user.role !== 'customer' && (
                      <Link
                        href={dashboardHomeFor(user.role)}
                        onClick={() => setMobileOpen(false)}
                        className="text-sm font-medium text-primary"
                      >
                        Go to dashboard
                      </Link>
                    )}
                  </>
                ) : (
                  <>
                    <Button asChild onClick={() => setMobileOpen(false)}>
                      <Link href="/login">Log in</Link>
                    </Button>
                    <Button variant="outline" asChild onClick={() => setMobileOpen(false)}>
                      <Link href="/register">Sign up</Link>
                    </Button>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
