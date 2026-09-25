import type { SupportStatus } from '@foodbowl/shared';
import type { BadgeProps } from '@/components/ui/badge';

type Viewer = 'customer' | 'staff';

export function supportStatusLabel(status: SupportStatus, viewer: Viewer): string {
  if (viewer === 'customer') {
    return status === 'OPEN' ? 'Waiting for the restaurant' : status === 'PENDING' ? 'Waiting for your reply' : 'Resolved';
  }
  return status === 'OPEN' ? 'Needs reply' : status === 'PENDING' ? 'Waiting for customer' : 'Resolved';
}

export const SUPPORT_STATUS_VARIANT: Record<SupportStatus, NonNullable<BadgeProps['variant']>> = {
  OPEN: 'warning',
  PENDING: 'secondary',
  RESOLVED: 'success',
};

export const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
