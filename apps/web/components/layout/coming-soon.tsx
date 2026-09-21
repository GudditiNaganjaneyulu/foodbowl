import type { LucideIcon } from 'lucide-react';

export function ComingSoon({ icon: Icon, title, note }: { icon: LucideIcon; title: string; note: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-24 text-center text-muted-foreground">
      <Icon className="h-8 w-8" />
      <h2 className="font-medium text-foreground">{title}</h2>
      <p className="max-w-sm text-sm">{note}</p>
    </div>
  );
}
