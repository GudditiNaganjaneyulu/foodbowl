'use client';

import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

/**
 * Shows a friendly message instead of a screen full of 403s when a staff
 * member without the permission opens a page directly. UX only — the API
 * enforces the same permission on every request.
 */
export function RequirePermission({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { hasPermission, isLoading } = useAuth();
  if (isLoading) return null;
  if (!hasPermission(permission)) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-24 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8" />
        <h2 className="font-medium text-foreground">You don't have access to this</h2>
        <p className="max-w-sm text-sm">
          This needs the <code className="rounded bg-muted px-1">{permission}</code> permission. Ask the restaurant owner to grant it from the Users screen.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
