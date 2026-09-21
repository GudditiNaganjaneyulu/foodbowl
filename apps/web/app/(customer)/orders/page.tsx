import { ClipboardList } from 'lucide-react';

export default function OrderHistoryPage() {
  return (
    <div className="container flex flex-col items-center gap-3 py-24 text-center text-muted-foreground">
      <ClipboardList className="h-10 w-10" />
      <h1 className="text-lg font-semibold text-foreground">Order history</h1>
      <p className="max-w-sm text-sm">
        This screen will list your past and live orders with real-time status tracking, once the Orders module
        (BUILD_PROMPT.md milestone 6) is wired up.
      </p>
    </div>
  );
}
