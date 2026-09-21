import { Settings } from 'lucide-react';
import { ComingSoon } from '@/components/layout/coming-soon';

export default function AdminSettingsPage() {
  return (
    <ComingSoon
      icon={Settings}
      title="Restaurant settings"
      note="Hours, delivery fee, and open/closed toggle wire up to GET/PATCH /api/v1/restaurant in a follow-up pass."
    />
  );
}
