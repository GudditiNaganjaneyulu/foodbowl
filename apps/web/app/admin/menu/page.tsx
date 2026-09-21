import { UtensilsCrossed } from 'lucide-react';
import { ComingSoon } from '@/components/layout/coming-soon';

export default function AdminMenuPage() {
  return (
    <ComingSoon
      icon={UtensilsCrossed}
      title="Menu management"
      note="Category/item CRUD with Supabase image upload lands in BUILD_PROMPT.md milestone 4 (Menu module). The read API already works — see the public menu page."
    />
  );
}
