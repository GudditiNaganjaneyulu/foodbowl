import type { SupportStatus } from '@foodbowl/shared';
import { Badge } from '@/components/ui/badge';
import { SUPPORT_STATUS_VARIANT, supportStatusLabel } from '@/lib/support';

export function SupportStatusBadge({ status, viewer, className }: { status: SupportStatus; viewer: 'customer' | 'staff'; className?: string }) {
  return (
    <Badge variant={SUPPORT_STATUS_VARIANT[status]} className={className}>
      {supportStatusLabel(status, viewer)}
    </Badge>
  );
}
