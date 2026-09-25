'use client';

import * as React from 'react';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import type { AddressDTO } from '@foodbowl/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toaster';
import { apiClient, ApiError } from '@/lib/api-client';
import { addressLine } from '@/lib/format';
import { AddressForm } from './address-form';

/** Manage saved delivery addresses: add, edit, make default, delete. */
export function AddressBook({ onLoaded }: { onLoaded?: (addresses: AddressDTO[]) => void }) {
  const { toast } = useToast();
  const [addresses, setAddresses] = React.useState<AddressDTO[] | null>(null);
  const [editing, setEditing] = React.useState<AddressDTO | 'new' | null>(null);

  const load = React.useCallback(async () => {
    const list = await apiClient.get<AddressDTO[]>('/api/v1/users/me/addresses').catch(() => []);
    setAddresses(list);
    onLoaded?.(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);

  async function makeDefault(a: AddressDTO) {
    try {
      await apiClient.patch(`/api/v1/users/me/addresses/${a.id}`, { isDefault: true });
      await load();
    } catch (err) {
      toast({ title: 'Could not update the address', description: err instanceof ApiError ? err.message : undefined, variant: 'error' });
    }
  }

  async function remove(a: AddressDTO) {
    if (!confirm(`Delete "${a.label}"?`)) return;
    try {
      await apiClient.delete(`/api/v1/users/me/addresses/${a.id}`);
      await load();
    } catch (err) {
      toast({ title: "Can't delete this address", description: err instanceof ApiError ? err.message : undefined, variant: 'error' });
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Saved addresses</CardTitle>
          <CardDescription>Where we deliver. Pick one at checkout.</CardDescription>
        </div>
        {editing === null && (
          <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {addresses === null && <p className="text-sm text-muted-foreground">Loading…</p>}
        {addresses?.length === 0 && editing === null && (
          <p className="text-sm text-muted-foreground">No saved addresses yet.</p>
        )}

        {addresses?.map((a) =>
          editing !== 'new' && editing?.id === a.id ? (
            <div key={a.id} className="rounded-md border border-border p-3">
              <AddressForm
                address={a}
                submitLabel="Save changes"
                onCancel={() => setEditing(null)}
                onSaved={() => {
                  setEditing(null);
                  void load();
                }}
              />
            </div>
          ) : (
            <div key={a.id} className="flex items-start gap-3 rounded-md border border-border p-3 text-sm" data-testid="saved-address">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {a.label} {a.isDefault && <Badge variant="secondary" className="ml-1">Default</Badge>}
                </p>
                <p className="text-muted-foreground">{addressLine(a)}</p>
                {!a.isDefault && (
                  <button type="button" onClick={() => makeDefault(a)} className="mt-1 text-xs font-medium text-primary hover:underline">
                    Make default
                  </button>
                )}
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(a)} aria-label={`Edit ${a.label}`}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(a)} aria-label={`Delete ${a.label}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ),
        )}

        {editing === 'new' && (
          <div className="rounded-md border border-dashed border-border p-3">
            <AddressForm
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                void load();
              }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
