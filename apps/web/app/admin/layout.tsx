'use client';

import { LayoutDashboard, ListOrdered, UtensilsCrossed, Users, Settings, Truck } from 'lucide-react';
import { ROLES } from '@foodbowl/shared';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { RequireRole } from '@/components/layout/require-role';

const ADMIN_NAV = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/orders', label: 'Orders', icon: ListOrdered },
  { href: '/admin/menu', label: 'Menu', icon: UtensilsCrossed },
  { href: '/admin/delivery', label: 'Delivery', icon: Truck },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/settings', label: 'Restaurant settings', icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role={ROLES.RESTAURANT_OWNER}>
      <DashboardShell title="Owner dashboard" navItems={ADMIN_NAV}>
        {children}
      </DashboardShell>
    </RequireRole>
  );
}
