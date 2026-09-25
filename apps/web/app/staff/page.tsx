'use client';

import { PERMISSIONS } from '@foodbowl/shared';
import { RequirePermission } from '@/components/layout/require-permission';
import { OrderQueue } from '@/components/orders/order-queue';

export default function StaffQueuePage() {
  return (
    <RequirePermission permission={PERMISSIONS.ORDERS_VIEW}>
      <OrderQueue />
    </RequirePermission>
  );
}
