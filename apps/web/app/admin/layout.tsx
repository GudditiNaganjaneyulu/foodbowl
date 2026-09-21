'use client';

import { LayoutDashboard, ListOrdered, UtensilsCrossed, Users, Settings, Truck } from 'lucide-react';
import { DashboardShell } from '@/components/layout/dashboard-shell';

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
    <DashboardShell title="Owner dashboard" navItems={ADMIN_NAV}>
      {children}
    </DashboardShell>
  );
}
