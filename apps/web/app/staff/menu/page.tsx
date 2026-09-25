'use client';

import { PERMISSIONS } from '@foodbowl/shared';
import { RequirePermission } from '@/components/layout/require-permission';
import { MenuManager } from '@/components/menu-admin/menu-manager';

export default function StaffMenuPage() {
  return (
    <RequirePermission permission={PERMISSIONS.MENU_MANAGE}>
      <MenuManager />
    </RequirePermission>
  );
}
