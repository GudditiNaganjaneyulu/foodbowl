'use client';

import { ListOrdered, Truck, UtensilsCrossed } from 'lucide-react';
import { PERMISSIONS } from '@foodbowl/shared';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { usePermissions } from '@/lib/auth-context';

/**
 * Nav visibility mirrors the staff member's granted permissions (see
 * BUILD_PROMPT.md §3.4) — this is UX only, the corresponding API routes
 * re-check the same permissions server-side regardless of what's shown here.
 */
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const { hasPermission } = usePermissions();

  const navItems = [
    { href: '/staff', label: 'Order queue', icon: ListOrdered, permission: PERMISSIONS.ORDERS_VIEW },
    { href: '/staff/menu', label: 'Menu', icon: UtensilsCrossed, permission: PERMISSIONS.MENU_MANAGE },
    { href: '/staff/delivery', label: 'Delivery assignment', icon: Truck, permission: PERMISSIONS.DELIVERY_ASSIGN },
  ].filter((item) => hasPermission(item.permission));

  return (
    <DashboardShell title="Staff console" navItems={navItems}>
      {children}
    </DashboardShell>
  );
}
