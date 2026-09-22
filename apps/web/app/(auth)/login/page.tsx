'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { dashboardHomeFor } from '@/lib/dashboard-routes';

const DEV_DEFAULT_PASSWORD = 'Password123!';
const DEV_LOGINS = [
  { label: 'Owner', email: 'owner@foodbowl.local' },
  { label: 'Staff', email: 'staff.orders@foodbowl.local' },
  { label: 'Delivery', email: 'delivery1@foodbowl.local' },
  { label: 'Customer', email: 'customer1@foodbowl.local' },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const loggedInUser = await login(email, password);
      router.push(dashboardHomeFor(loggedInUser.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>Customers, staff, delivery partners, and owners all sign in here.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting} className="mt-2">
            {submitting ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New customer?{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>

        {process.env.NODE_ENV !== 'production' && (
          <div className="mt-6 rounded-md border border-dashed border-border p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Dev only — seeded demo accounts (password: <code className="rounded bg-muted px-1">{DEV_DEFAULT_PASSWORD}</code>).
              Change these from Profile → Change password once you've logged in.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {DEV_LOGINS.map((account) => (
                <Button
                  key={account.email}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(DEV_DEFAULT_PASSWORD);
                  }}
                >
                  {account.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
