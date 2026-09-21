import { Truck } from 'lucide-react';
import { ComingSoon } from '@/components/layout/coming-soon';

export default function DeliveryQueuePage() {
  return (
    <ComingSoon
      icon={Truck}
      title="My deliveries"
      note="Offered/active deliveries with accept, pickup, and delivered-with-COD-confirmation actions. Lands in BUILD_PROMPT.md milestone 8."
    />
  );
}
