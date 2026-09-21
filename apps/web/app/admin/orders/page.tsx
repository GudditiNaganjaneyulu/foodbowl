import { ListOrdered } from 'lucide-react';
import { ComingSoon } from '@/components/layout/coming-soon';

export default function AdminOrdersPage() {
  return (
    <ComingSoon
      icon={ListOrdered}
      title="Live order queue"
      note="Kanban-style order queue with status transitions lands in BUILD_PROMPT.md milestone 6 (Order lifecycle + Socket.IO)."
    />
  );
}
