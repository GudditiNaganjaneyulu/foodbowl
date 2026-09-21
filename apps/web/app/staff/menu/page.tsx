import { UtensilsCrossed } from 'lucide-react';
import { ComingSoon } from '@/components/layout/coming-soon';

export default function StaffMenuPage() {
  return (
    <ComingSoon
      icon={UtensilsCrossed}
      title="Menu management"
      note="Visible only to staff granted menu.manage. Lands in BUILD_PROMPT.md milestone 4."
    />
  );
}
