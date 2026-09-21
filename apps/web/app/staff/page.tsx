import { ListOrdered } from 'lucide-react';
import { ComingSoon } from '@/components/layout/coming-soon';

export default function StaffQueuePage() {
  return (
    <ComingSoon
      icon={ListOrdered}
      title="Order queue"
      note="Shows orders you're permitted to act on, filtered to actionable states. Lands in BUILD_PROMPT.md milestone 6."
    />
  );
}
