'use client';

import { LayoutDashboard, LifeBuoy, ListOrdered, UtensilsCrossed, Users, Settings, Truck } from 'lucide-react';
import { ROLES } from '@foodbowl/shared';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { RequireRole } from '@/components/layout/require-role';
import { useSupportSummary } from '@/lib/use-support';

const ADMIN_NAV = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/orders', label: 'Orders', icon: ListOrdered },
  { href: '/admin/menu', label: 'Menu', icon: UtensilsCrossed },
  { href: '/admin/delivery', label: 'Delivery', icon: Truck },
  { href: '/admin/support', label: 'Support', icon: LifeBuoy },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/settings', label: 'Restaurant settings', icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const support = useSupportSummary();
  const navItems = ADMIN_NAV.map((item) => (item.href === '/admin/support' ? { ...item, badge: support?.unread } : item));
  return (
    <RequireRole role={ROLES.RESTAURANT_OWNER}>
      <DashboardShell title="Owner dashboard" navItems={navItems}>
        {children}
      </DashboardShell>
    </RequireRole>
  );
}
