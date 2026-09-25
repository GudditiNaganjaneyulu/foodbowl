'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { AccountMenu } from './account-menu';
import { NotificationBell } from '@/components/notifications/notification-bell';

export interface DashboardNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface DashboardShellProps {
  title: string;
  navItems: DashboardNavItem[];
  children: React.ReactNode;
}

function NavList({ navItems, onNavigate }: { navItems: DashboardNavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Shared sidebar-shell chrome for the (admin), (staff) and (delivery) route
 * groups — each just passes its own nav item list. Desktop: fixed sidebar.
 * Mobile: sidebar content moves into a Sheet behind a topbar hamburger, same
 * pattern as the storefront's mobile nav for consistency.
 */
export function DashboardShell({ title, navItems, children }: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card md:flex md:flex-col">
        <div className="flex h-16 items-center gap-2 border-b border-border px-5 font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <UtensilsCrossed className="h-4.5 w-4.5" />
          </span>
          FoodBowl
        </div>
        <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
          <NavList navItems={navItems} />
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72">
                <SheetHeader>
                  <SheetTitle>FoodBowl</SheetTitle>
                </SheetHeader>
                <div className="mt-6">
                  <NavList navItems={navItems} onNavigate={() => setMobileOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
            <h1 className="text-lg font-semibold">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <ThemeToggle />
            <AccountMenu />
          </div>
        </header>

        <main className="flex-1 bg-muted/30 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
