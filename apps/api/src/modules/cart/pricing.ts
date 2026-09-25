import type { Prisma } from '@prisma/client';
import { MAX_LINE_QUANTITY, type SelectedModifierInput } from '@foodbowl/shared';
import { HttpError } from '../../lib/http-error';
import { ZERO, type Money } from '../../lib/money';

export type MenuItemWithModifiers = Prisma.MenuItemGetPayload<{
  include: { modifierGroups: { include: { modifiers: true } } };
}>;

export interface ResolvedModifier {
  modifierGroupId: string;
  modifierId: string;
  name: string;
  priceDelta: Money;
}

/** Deterministic order + no duplicates, so equal selections compare equal. */
export function normalizeSelection(selected: SelectedModifierInput[]): SelectedModifierInput[] {
  const seen = new Set<string>();
  const out: SelectedModifierInput[] = [];
  for (const s of selected) {
    if (seen.has(s.modifierId)) continue;
    seen.add(s.modifierId);
    out.push({ modifierGroupId: s.modifierGroupId, modifierId: s.modifierId });
  }
  return out.sort((a, b) => a.modifierId.localeCompare(b.modifierId));
}

/**
 * Same item + same modifier set + same instructions ⇒ same cart line (see
 * cart.service addItem). Instructions count: two burgers where one says
 * "no onions" are different orders and must not collapse into "2 burgers".
 */
export function selectionSignature(menuItemId: string, selected: SelectedModifierInput[], note?: string | null): string {
  const mods = normalizeSelection(selected).map((s) => s.modifierId).join(',');
  return `${menuItemId}|${mods}|${(note ?? '').trim().toLowerCase()}`;
}

/**
 * Checks a customer's modifier selection against the item's real modifier
 * groups and returns the priced result. Throws a 400 HttpError describing the
 * first problem. Names and price deltas always come from the database —
 * the client only ever supplies ids.
 */
export function resolveSelection(
  item: MenuItemWithModifiers,
  selected: SelectedModifierInput[],
): ResolvedModifier[] {
  const normalized = normalizeSelection(selected);
  if (normalized.length !== selected.length) {
    throw new HttpError('Duplicate modifier selected', 400);
  }

  const groups = new Map(item.modifierGroups.map((g) => [g.id, g]));
  const countByGroup = new Map<string, number>();
  const resolved: ResolvedModifier[] = [];

  for (const sel of normalized) {
    const group = groups.get(sel.modifierGroupId);
    const modifier = group?.modifiers.find((m) => m.id === sel.modifierId);
    if (!group || !modifier) {
      throw new HttpError(`Invalid option selected for "${item.name}"`, 400);
    }
    countByGroup.set(group.id, (countByGroup.get(group.id) ?? 0) + 1);
    resolved.push({
      modifierGroupId: group.id,
      modifierId: modifier.id,
      name: modifier.name,
      priceDelta: modifier.priceDelta,
    });
  }

  for (const group of item.modifierGroups) {
    const count = countByGroup.get(group.id) ?? 0;
    const min = group.required ? Math.max(group.minSelect, 1) : group.minSelect;
    if (count < min) {
      throw new HttpError(`Choose ${min === 1 ? 'an option' : `at least ${min} options`} for "${group.name}"`, 400);
    }
    if (count > group.maxSelect) {
      throw new HttpError(`Choose at most ${group.maxSelect} for "${group.name}"`, 400);
    }
  }
  return resolved;
}

export function unitPrice(basePrice: Money, modifiers: ResolvedModifier[]): Money {
  return modifiers.reduce((sum, m) => sum.plus(m.priceDelta), basePrice);
}

export function lineTotal(unit: Money, quantity: number): Money {
  return unit.times(quantity);
}

export function sumMoney(values: Money[]): Money {
  return values.reduce((sum, v) => sum.plus(v), ZERO);
}

export function clampQuantity(quantity: number): number {
  return Math.min(quantity, MAX_LINE_QUANTITY);
}
