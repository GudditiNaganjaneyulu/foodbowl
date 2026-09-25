'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { FoodImage } from '@/components/menu/food-image';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ImageUploader } from '@/components/ui/image-uploader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toaster';
import { apiClient, ApiError } from '@/lib/api-client';

export interface AdminModifier {
  id: string;
  name: string;
  priceDelta: string;
}
export interface AdminGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  required: boolean;
  modifiers: AdminModifier[];
}
export interface AdminItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: string;
  imageUrl: string | null;
  isVeg: boolean;
  isAvailable: boolean;
  sortOrder: number;
  modifierGroups: AdminGroup[];
}

interface DraftGroup {
  name: string;
  minSelect: number;
  maxSelect: number;
  required: boolean;
  modifiers: { name: string; priceDelta: number }[];
}

/** Create or edit one menu item, including its customization option groups. */
export function ItemDialog({
  state,
  onClose,
  onSaved,
}: {
  state: { categoryId: string; item?: AdminItem } | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { toast } = useToast();
  const item = state?.item;
  const [form, setForm] = React.useState({ name: '', description: '', price: '', imageUrl: '', sortOrder: '0', isVeg: true, isAvailable: true });
  const [pendingGroups, setPendingGroups] = React.useState<DraftGroup[]>([]);
  const [groups, setGroups] = React.useState<AdminGroup[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!state) return;
    setError(null);
    setPendingGroups([]);
    setGroups(item?.modifierGroups ?? []);
    setForm({
      name: item?.name ?? '',
      description: item?.description ?? '',
      price: item ? Number(item.price).toString() : '',
      imageUrl: item?.imageUrl ?? '',
      sortOrder: String(item?.sortOrder ?? 0),
      isVeg: item?.isVeg ?? true,
      isAvailable: item?.isAvailable ?? true,
    });
    // Reset only when a different item (or "new") is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.categoryId, item?.id]);

  if (!state) return null;
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const price = Number(form.price);
    if (!Number.isFinite(price) || price <= 0) {
      setError('Enter a price greater than 0.');
      return;
    }
    setSaving(true);
    try {
      const base = {
        name: form.name.trim(),
        price,
        isVeg: form.isVeg,
        isAvailable: form.isAvailable,
        sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
      };
      if (item) {
        await apiClient.patch(`/api/v1/menu/items/${item.id}`, {
          ...base,
          description: form.description.trim() || null,
          imageUrl: form.imageUrl.trim() || null,
        });
      } else {
        await apiClient.post('/api/v1/menu/items', {
          ...base,
          categoryId: state!.categoryId,
          description: form.description.trim() || undefined,
          imageUrl: form.imageUrl.trim() || undefined,
          modifierGroups: pendingGroups,
        });
      }
      toast({ title: item ? 'Item saved' : 'Item added', variant: 'success' });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the item');
    } finally {
      setSaving(false);
    }
  }

  async function addGroup(group: DraftGroup) {
    if (!item) {
      setPendingGroups((prev) => [...prev, group]);
      return;
    }
    try {
      const created = await apiClient.post<AdminGroup>(`/api/v1/menu/items/${item.id}/modifier-groups`, group);
      setGroups((prev) => [...prev, created]);
      await onSaved();
    } catch (err) {
      toast({ title: "Couldn't add the option group", description: err instanceof ApiError ? err.message : undefined, variant: 'error' });
    }
  }

  async function removeGroup(index: number) {
    if (!item) {
      setPendingGroups((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    const group = groups[index]!;
    try {
      await apiClient.delete(`/api/v1/menu/modifier-groups/${group.id}`);
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
      await onSaved();
    } catch (err) {
      toast({ title: "Couldn't remove the option group", description: err instanceof ApiError ? err.message : undefined, variant: 'error' });
    }
  }

  const shownGroups: (DraftGroup | AdminGroup)[] = item ? groups : pendingGroups;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? `Edit ${item.name}` : 'Add menu item'}</DialogTitle>
          <DialogDescription>{item ? 'Changes go live immediately.' : 'It appears on the menu as soon as you save.'}</DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-name">Name</Label>
            <Input id="item-name" required maxLength={120} value={form.name} onChange={set('name')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-desc">Description</Label>
            <Textarea id="item-desc" maxLength={1000} value={form.description} onChange={set('description')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-price">Price ($)</Label>
              <Input id="item-price" required type="number" min="0.01" step="0.01" inputMode="decimal" value={form.price} onChange={set('price')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="item-sort">Sort order</Label>
              <Input id="item-sort" type="number" step="1" value={form.sortOrder} onChange={set('sortOrder')} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-image">Photo URL</Label>
            <div className="flex items-start gap-2">
              <Input id="item-image" placeholder="https://…  (or upload)" value={form.imageUrl} onChange={set('imageUrl')} />
              <ImageUploader bucket="menu-images" entityId={item?.id} onUploaded={(url) => setForm((f) => ({ ...f, imageUrl: url }))} label="Upload" />
            </div>
            {form.imageUrl && (
              <div className="flex items-center gap-3">
                <FoodImage src={form.imageUrl} alt="Preview" className="h-20 w-28 rounded-lg" />
                <Button type="button" variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, imageUrl: '' }))}>
                  Remove photo
                </Button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isVeg} onChange={(e) => setForm((f) => ({ ...f, isVeg: e.target.checked }))} /> Vegetarian
            </label>
            <label className="flex items-center gap-2">
              <Switch aria-label="Available" checked={form.isAvailable} onCheckedChange={(v) => setForm((f) => ({ ...f, isAvailable: v }))} /> Available to order
            </label>
          </div>

          <OptionGroups groups={shownGroups} onAdd={addGroup} onRemove={removeGroup} />

          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} data-testid="save-item">
              {saving ? 'Saving…' : item ? 'Save changes' : 'Add item'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OptionGroups({
  groups,
  onAdd,
  onRemove,
}: {
  groups: (DraftGroup | AdminGroup)[];
  onAdd: (group: DraftGroup) => void | Promise<void>;
  onRemove: (index: number) => void | Promise<void>;
}) {
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState('');
  const [required, setRequired] = React.useState(false);
  const [multi, setMulti] = React.useState(false);
  const [options, setOptions] = React.useState([{ name: '', priceDelta: '' }]);
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setAdding(false);
    setName('');
    setRequired(false);
    setMulti(false);
    setOptions([{ name: '', priceDelta: '' }]);
    setError(null);
  }

  async function submit() {
    const modifiers = options.filter((o) => o.name.trim()).map((o) => ({ name: o.name.trim(), priceDelta: Number(o.priceDelta) || 0 }));
    if (!name.trim()) return setError('Give the group a name, e.g. "Size".');
    if (modifiers.length === 0) return setError('Add at least one option.');
    await onAdd({
      name: name.trim(),
      required,
      minSelect: required ? 1 : 0,
      maxSelect: multi ? modifiers.length : 1,
      modifiers,
    });
    reset();
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border p-3" data-testid="option-groups">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Customization options</h4>
        {!adding && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(true)} data-testid="add-group">
            <Plus className="h-3.5 w-3.5" /> Add group
          </Button>
        )}
      </div>
      {groups.length === 0 && !adding && <p className="text-xs text-muted-foreground">Size, spice level, add-ons… Customers choose these before adding to cart.</p>}
      {groups.map((g, i) => (
        <div key={i} className="flex items-start justify-between gap-2 rounded bg-muted/50 p-2 text-sm">
          <div>
            <p className="font-medium">
              {g.name} <span className="text-xs font-normal text-muted-foreground">{g.required ? 'Required' : 'Optional'}{g.maxSelect > 1 ? ` · up to ${g.maxSelect}` : ''}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {g.modifiers.map((m) => `${m.name}${Number(m.priceDelta) > 0 ? ` (+$${Number(m.priceDelta).toFixed(2)})` : ''}`).join(', ')}
            </p>
          </div>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label={`Remove ${g.name}`} onClick={() => onRemove(i)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      {adding && (
        <div className="flex flex-col gap-2 rounded border border-dashed border-border p-2.5">
          <Input aria-label="Group name" placeholder="Group name (e.g. Size)" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Customer must choose
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> Allow several
            </label>
          </div>
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <Input aria-label={`Option ${i + 1} name`} placeholder="Option (e.g. Large)" value={o.name} onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Input aria-label={`Option ${i + 1} extra price`} className="w-28" type="number" min="0" step="0.01" placeholder="+ $0.00" value={o.priceDelta} onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? { ...x, priceDelta: e.target.value } : x)))} />
            </div>
          ))}
          <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => setOptions((prev) => [...prev, { name: '', priceDelta: '' }])}>
            <Plus className="h-3.5 w-3.5" /> Another option
          </Button>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={submit} data-testid="confirm-group">
              Add group
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
