'use client';

import { PackageCheck, Truck } from 'lucide-react';
import { ROLES } from '@foodbowl/shared';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { RequireRole } from '@/components/layout/require-role';

const DELIVERY_NAV = [
  { href: '/delivery', label: 'My deliveries', icon: Truck },
  { href: '/delivery/history', label: 'Delivery history', icon: PackageCheck },
];

export default function DeliveryLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role={ROLES.DELIVERY_PARTNER}>
      <DashboardShell title="Delivery" navItems={DELIVERY_NAV}>
        {children}
      </DashboardShell>
    </RequireRole>
  );
}
