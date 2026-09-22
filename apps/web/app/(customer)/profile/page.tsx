'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, LogOut, UserCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import { dashboardHomeFor } from '@/lib/dashboard-routes';

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function ProfilePage() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = React.useState(false);

  if (isLoading) return null;

  if (!user) {
    return (
      <div className="container flex flex-col items-center gap-3 py-24 text-center text-muted-foreground">
        <UserCircle2 className="h-10 w-10" />
        <p>Log in to view your profile, past orders, and account settings.</p>
        <div className="mt-2 flex gap-2">
          <Button asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/register">Sign up</Link>
          </Button>
        </div>
      </div>
    );
  }

  async function onLogout() {
    setLoggingOut(true);
    try {
      await logout();
      router.push('/');
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="container flex max-w-lg flex-col gap-6 py-8">
      <Card>
        <CardHeader className="flex-row items-center gap-4 space-y-0">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-lg">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle>{user.name}</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Role</span>
            <Badge variant="secondary">{user.role.replace('_', ' ')}</Badge>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          {user.role !== 'customer' && (
            <Button variant="outline" className="w-full" asChild>
              <Link href={dashboardHomeFor(user.role)}>
                <LayoutDashboard className="h-4 w-4" /> Go to {user.role.replace('_', ' ')} dashboard
              </Link>
            </Button>
          )}
          <Button
            variant="outline"
            className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onLogout}
            disabled={loggingOut}
          >
            <LogOut className="h-4 w-4" /> {loggingOut ? 'Logging out…' : 'Log out'}
          </Button>
        </CardFooter>
      </Card>

      <ChangePasswordCard />

      <p className="text-center text-xs text-muted-foreground">
        Saved addresses and other profile editing land alongside the Orders module.
      </p>
    </div>
  );
}

function ChangePasswordCard() {
  const [form, setForm] = React.useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (form.newPassword !== form.confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.patch('/api/v1/users/me/password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setSuccess(true);
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>
          If you're using a default/temporary password from a seeded account or an invite, change it here.
          You'll stay signed in on this device; other sessions are signed out.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              type="password"
              required
              value={form.currentPassword}
              onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              type="password"
              required
              minLength={8}
              value={form.newPassword}
              onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              value={form.confirmPassword}
              onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-success">Password changed successfully.</p>}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Changing…' : 'Change password'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
