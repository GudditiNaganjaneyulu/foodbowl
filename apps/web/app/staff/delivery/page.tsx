'use client';

import { PERMISSIONS } from '@foodbowl/shared';
import { DispatchBoard } from '@/components/delivery/dispatch-board';
import { RequirePermission } from '@/components/layout/require-permission';

export default function StaffDeliveryPage() {
  return (
    <RequirePermission permission={PERMISSIONS.DELIVERY_ASSIGN}>
      <DispatchBoard />
    </RequirePermission>
  );
}
