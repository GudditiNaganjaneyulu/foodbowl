'use client';

import * as React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

/**
 * Shows a friendly message instead of a screen full of 403s (or a blank page)
 * when someone opens a page they lack the permission for. UX only — the API
 * enforces the same permission on every request.
 *
 * The permissions the browser holds are a snapshot from sign-in, so before
 * concluding "no access" it re-reads them from the server once: if the owner
 * granted the permission (or a release introduced it) after this tab loaded,
 * the page then just works instead of needing a reload.
 */
export function RequirePermission({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { hasPermission, isLoading, refreshUser } = useAuth();
  const allowed = hasPermission(permission);
  const [rechecked, setRechecked] = React.useState(false);

  React.useEffect(() => {
    if (isLoading || allowed || rechecked) return;
    refreshUser()
      .catch(() => undefined)
      .finally(() => setRechecked(true));
  }, [isLoading, allowed, rechecked, refreshUser]);

  if (isLoading) return null;
  if (allowed) return <>{children}</>;
  if (!rechecked) return <div className="py-24 text-center text-sm text-muted-foreground">Checking your access…</div>;

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-24 text-center text-muted-foreground" data-testid="no-access">
      <ShieldAlert className="h-8 w-8" />
      <h2 className="font-medium text-foreground">You don't have access to this</h2>
      <p className="max-w-sm text-sm">
        This needs the <code className="rounded bg-muted px-1">{permission}</code> permission. Ask the restaurant owner to grant it from the Users screen.
      </p>
    </div>
  );
}
