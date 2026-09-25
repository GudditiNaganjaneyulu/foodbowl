'use client';

import * as React from 'react';
import type { AddressDTO } from '@foodbowl/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient, ApiError } from '@/lib/api-client';

interface AddressFormProps {
  /** Present when editing an existing address. */
  address?: AddressDTO;
  onSaved: (address: AddressDTO) => void;
  onCancel?: () => void;
  submitLabel?: string;
}

const EMPTY = { label: 'Home', line1: '', line2: '', city: '', state: '', postalCode: '' };

export function AddressForm({ address, onSaved, onCancel, submitLabel = 'Save address' }: AddressFormProps) {
  const [form, setForm] = React.useState(
    address ? { label: address.label, line1: address.line1, line2: address.line2 ?? '', city: address.city, state: address.state, postalCode: address.postalCode } : EMPTY,
  );
  const [makeDefault, setMakeDefault] = React.useState(address?.isDefault ?? false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body = { ...form, line2: form.line2.trim() || undefined, isDefault: makeDefault || undefined };
      const saved = address
        ? await apiClient.patch<AddressDTO>(`/api/v1/users/me/addresses/${address.id}`, { ...form, line2: form.line2.trim() || undefined, isDefault: makeDefault })
        : await apiClient.post<AddressDTO>('/api/v1/users/me/addresses', body);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the address');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
      <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
        <Label htmlFor="addr-label">Label</Label>
        <Input id="addr-label" required maxLength={60} value={form.label} onChange={set('label')} placeholder="Home, Work…" />
      </div>
      <div className="col-span-2 flex flex-col gap-1.5">
        <Label htmlFor="addr-line1">Address</Label>
        <Input id="addr-line1" required value={form.line1} onChange={set('line1')} placeholder="Street and number" />
      </div>
      <div className="col-span-2 flex flex-col gap-1.5">
        <Label htmlFor="addr-line2">Apartment, landmark (optional)</Label>
        <Input id="addr-line2" value={form.line2} onChange={set('line2')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="addr-city">City</Label>
        <Input id="addr-city" required value={form.city} onChange={set('city')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="addr-state">State</Label>
        <Input id="addr-state" required value={form.state} onChange={set('state')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="addr-postal">Postal code</Label>
        <Input id="addr-postal" required value={form.postalCode} onChange={set('postalCode')} />
      </div>
      <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-1 sm:self-end sm:pb-2">
        <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
        Make this my default address
      </label>
      {error && <p className="col-span-2 text-sm text-destructive">{error}</p>}
      <div className="col-span-2 flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
