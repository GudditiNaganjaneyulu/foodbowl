import { PackageCheck } from 'lucide-react';
import { ComingSoon } from '@/components/layout/coming-soon';

export default function DeliveryHistoryPage() {
  return (
    <ComingSoon
      icon={PackageCheck}
      title="Delivery history"
      note="Completed deliveries with COD-collected status. Lands alongside the delivery workflow in milestone 8."
    />
  );
}
