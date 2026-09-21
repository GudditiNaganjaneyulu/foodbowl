import { Truck } from 'lucide-react';
import { ComingSoon } from '@/components/layout/coming-soon';

export default function StaffDeliveryPage() {
  return (
    <ComingSoon
      icon={Truck}
      title="Delivery assignment"
      note="Visible only to staff granted delivery.assign. Lands in BUILD_PROMPT.md milestone 8."
    />
  );
}
