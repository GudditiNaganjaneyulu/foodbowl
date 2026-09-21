'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, Plus, ShieldAlert, Trash2, UserX, UserCheck } from 'lucide-react';
import { ALL_PERMISSIONS, ALL_ROLES, OWNER_ONLY_PERMISSIONS, ROLES } from '@foodbowl/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { apiClient, ApiError } from '@/lib/api-client';

interface AdminUserDTO {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  role: { key: string; name: string };
  userPermissions: { granted: boolean; permission: { key: string } }[];
}

const CREATABLE_ROLES = ALL_ROLES.filter((r) => r !== ROLES.CUSTOMER);

export default function AdminUsersPage() {
  const [users, setUsers] = React.useState<AdminUserDTO[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    apiClient
      .get<AdminUserDTO[]>('/api/v1/admin/users')
      .then(setUsers)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load users'));
  }, []);

  React.useEffect(refresh, [refresh]);

  async function toggleStatus(user: AdminUserDTO) {
    try {
      await apiClient.patch(`/api/v1/admin/users/${user.id}/status`, { isActive: !user.isActive });
      refresh();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Action failed');
    }
  }

  async function changeRole(user: AdminUserDTO, role: string) {
    try {
      await apiClient.patch(`/api/v1/admin/users/${user.id}/role`, { role });
      refresh();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Action failed');
    }
  }

  async function removeUser(user: AdminUserDTO) {
    if (!confirm(`Remove ${user.name}? If they have order history this will deactivate instead of deleting.`)) return;
    try {
      await apiClient.delete(`/api/v1/admin/users/${user.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.statusCode === 409) {
        await apiClient.patch(`/api/v1/admin/users/${user.id}/status`, { isActive: false });
      } else {
        alert(e instanceof ApiError ? e.message : 'Action failed');
        return;
      }
    }
    refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Users</h2>
          <p className="text-sm text-muted-foreground">
            Add, deactivate, and assign roles/permissions for staff, delivery partners, and owners.
          </p>
        </div>
        <AddUserDialog onCreated={refresh} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Name</th>
                <th className="p-4 font-medium">Role</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((user) => (
                <React.Fragment key={user.id}>
                  <tr className="border-b border-border last:border-0">
                    <td className="p-4">
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </td>
                    <td className="p-4">
                      <select
                        value={user.role.key}
                        onChange={(e) => changeRole(user, e.target.value)}
                        className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                      >
                        {ALL_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r.replace('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-4">
                      <Badge variant={user.isActive ? 'success' : 'outline'}>
                        {user.isActive ? 'Active' : 'Deactivated'}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-1.5">
                        {user.role.key === ROLES.STAFF && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setExpandedId(expandedId === user.id ? null : user.id)}
                          >
                            Permissions {expandedId === user.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => toggleStatus(user)}>
                          {user.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeUser(user)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === user.id && user.role.key === ROLES.STAFF && (
                    <tr className="border-b border-border bg-muted/30">
                      <td colSpan={4} className="p-4">
                        <StaffPermissionsEditor user={user} onSaved={refresh} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {users?.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">No users yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AddUserDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: '',
    email: '',
    role: ROLES.STAFF as string,
    temporaryPassword: '',
  });
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiClient.post('/api/v1/admin/users', form);
      setOpen(false);
      setForm({ name: '', email: '', role: ROLES.STAFF, temporaryPassword: '' });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> Add user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a user</DialogTitle>
          <DialogDescription>
            Creates a staff, delivery partner, or owner account. They'll change this password on first login.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {CREATABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="temporaryPassword">Temporary password</Label>
            <Input
              id="temporaryPassword"
              type="text"
              required
              minLength={8}
              value={form.temporaryPassword}
              onChange={(e) => setForm((f) => ({ ...f, temporaryPassword: e.target.value }))}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StaffPermissionsEditor({ user, onSaved }: { user: AdminUserDTO; onSaved: () => void }) {
  const grantedSet = new Set(user.userPermissions.filter((p) => p.granted).map((p) => p.permission.key));
  const [local, setLocal] = React.useState<Set<string>>(new Set(grantedSet));
  const [saving, setSaving] = React.useState(false);

  const grantable = ALL_PERMISSIONS.filter((p) => !(OWNER_ONLY_PERMISSIONS as string[]).includes(p));

  async function save() {
    setSaving(true);
    try {
      await apiClient.patch(`/api/v1/admin/users/${user.id}/permissions`, {
        grants: grantable.map((permission) => ({ permission, granted: local.has(permission) })),
      });
      onSaved();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldAlert className="h-3.5 w-3.5" />
        Overrides this staff member's baseline permissions. Owner-only permissions can't be granted here.
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {grantable.map((permission) => (
          <label key={permission} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={local.has(permission)}
              onChange={(e) =>
                setLocal((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(permission);
                  else next.delete(permission);
                  return next;
                })
              }
            />
            {permission}
          </label>
        ))}
      </div>
      <Button size="sm" onClick={save} disabled={saving} className="w-fit">
        {saving ? 'Saving…' : 'Save permissions'}
      </Button>
    </div>
  );
}
