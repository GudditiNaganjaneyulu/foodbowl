'use client';

import { PackageCheck, Truck } from 'lucide-react';
import { DashboardShell } from '@/components/layout/dashboard-shell';

const DELIVERY_NAV = [
  { href: '/delivery', label: 'My deliveries', icon: Truck },
  { href: '/delivery/history', label: 'Delivery history', icon: PackageCheck },
];

export default function DeliveryLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell title="Delivery" navItems={DELIVERY_NAV}>
      {children}
    </DashboardShell>
  );
}
