'use client';

import { PERMISSIONS } from '@foodbowl/shared';
import { RequirePermission } from '@/components/layout/require-permission';
import { StaffInbox } from '@/components/support/staff-inbox';

export default function AdminSupportPage() {
  return (
    <RequirePermission permission={PERMISSIONS.SUPPORT_MANAGE}>
      <StaffInbox ordersHref="/admin/orders" />
    </RequirePermission>
  );
}
