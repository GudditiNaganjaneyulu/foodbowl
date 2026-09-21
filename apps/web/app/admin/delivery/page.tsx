import { Truck } from 'lucide-react';
import { ComingSoon } from '@/components/layout/coming-soon';

export default function AdminDeliveryPage() {
  return (
    <ComingSoon
      icon={Truck}
      title="Delivery partner management"
      note="Assignment, acceptance, and delivery workflow land in BUILD_PROMPT.md milestone 8. Delivery partner accounts can already be created from the Users screen."
    />
  );
}
