'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

/**
 * Client-side guard for the (admin)/(staff)/(delivery) route groups. Without
 * this, nothing stopped a logged-out visitor (or a customer, or the wrong
 * staff member) from loading the dashboard shell directly, and logging out
 * while sitting on one of these pages left you looking at a dashboard for an
 * account that no longer exists in the session — the API calls would 401,
 * but nothing would actually move you off the page.
 *
 * This is UX, not the security boundary — every route this protects is
 * already independently enforced server-side (requireAuth/requirePermission
 * in the API). A determined user bypassing this client check gets nothing
 * beyond an empty shell full of 401s.
 */
export function RequireRole({ role, children }: { role: string; children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== role) {
      router.replace('/');
    }
  }, [isLoading, user, role, router]);

  if (isLoading || !user || user.role !== role) {
    return <div className="min-h-screen" />;
  }

  return <>{children}</>;
}
