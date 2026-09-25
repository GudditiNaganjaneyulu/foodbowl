'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toaster';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

export interface MeDTO {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  permissions: string[];
}

/** Edit your name and phone number. Email and role are shown but can't be changed here. */
export function ProfileDetails({ me, onSaved }: { me: MeDTO; onSaved: (me: MeDTO) => void }) {
  const { toast } = useToast();
  const { refreshUser } = useAuth();
  const [name, setName] = React.useState(me.name);
  const [phone, setPhone] = React.useState(me.phone ?? '');
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setName(me.name);
    setPhone(me.phone ?? '');
  }, [me.name, me.phone]);

  const dirty = name.trim() !== me.name || phone.trim() !== (me.phone ?? '');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const updated = await apiClient.patch<MeDTO>('/api/v1/users/me', { name: name.trim(), phone: phone.trim() || null });
      onSaved(updated);
      await refreshUser();
      toast({ title: 'Profile updated', variant: 'success' });
    } catch (err) {
      setError(err instanceof ApiError ? (typeof err.details === 'object' ? 'Please check your name and phone number.' : err.message) : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your details</CardTitle>
        <CardDescription>We use your phone number so the delivery partner can reach you.</CardDescription>
      </CardHeader>
      <form onSubmit={save}>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-name">Name</Label>
            <Input id="profile-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-phone">Phone number</Label>
            <Input id="profile-phone" type="tel" inputMode="tel" minLength={7} maxLength={20} placeholder="+1 555 010 0200" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={me.email} disabled />
            <p className="text-xs text-muted-foreground">Your email is your login and can't be changed here.</p>
          </div>
          {error && <p className="text-sm text-destructive sm:col-span-2" role="alert">{error}</p>}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={saving || !dirty || !name.trim()} data-testid="save-profile">
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
