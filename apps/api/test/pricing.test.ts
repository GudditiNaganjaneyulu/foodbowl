import { describe, expect, it } from 'vitest';
import { resolveSelection, selectionSignature, unitPrice, normalizeSelection, type MenuItemWithModifiers } from '../src/modules/cart/pricing';
import { dec } from '../src/lib/money';
import { HttpError } from '../src/lib/http-error';

const mod = (id: string, groupId: string, name: string, delta: string) => ({
  id,
  modifierGroupId: groupId,
  name,
  priceDelta: dec(delta),
});

const item = {
  id: 'item1',
  name: 'Butter Chicken',
  price: dec('12.99'),
  modifierGroups: [
    {
      id: 'g-spice', menuItemId: 'item1', name: 'Spice Level', minSelect: 1, maxSelect: 1, required: true,
      modifiers: [mod('m-mild', 'g-spice', 'Mild', '0'), mod('m-hot', 'g-spice', 'Hot', '0')],
    },
    {
      id: 'g-addons', menuItemId: 'item1', name: 'Add-ons', minSelect: 0, maxSelect: 2, required: false,
      modifiers: [
        mod('m-chicken', 'g-addons', 'Extra Chicken', '2.50'),
        mod('m-gravy', 'g-addons', 'Extra Gravy', '1.50'),
        mod('m-naan', 'g-addons', 'Naan', '2.99'),
      ],
    },
  ],
} as unknown as MenuItemWithModifiers;

const sel = (groupId: string, modifierId: string) => ({ modifierGroupId: groupId, modifierId });
const failsWith = (fn: () => unknown, status: number, text?: RegExp) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(HttpError);
    expect((e as HttpError).statusCode).toBe(status);
    if (text) expect((e as HttpError).message).toMatch(text);
    return;
  }
  throw new Error('expected a HttpError');
};

describe('resolveSelection', () => {
  it('resolves names and price deltas from the item, not the client', () => {
    const resolved = resolveSelection(item, [sel('g-spice', 'm-hot'), sel('g-addons', 'm-chicken')]);
    expect(resolved.map((m) => m.name).sort()).toEqual(['Extra Chicken', 'Hot']);
    expect(unitPrice(item.price, resolved).toFixed(2)).toBe('15.49');
  });

  it('requires a choice in a required group', () => {
    failsWith(() => resolveSelection(item, []), 400, /Spice Level/);
    failsWith(() => resolveSelection(item, [sel('g-addons', 'm-gravy')]), 400, /Spice Level/);
  });

  it('enforces maxSelect', () => {
    failsWith(
      () => resolveSelection(item, [sel('g-spice', 'm-mild'), sel('g-addons', 'm-chicken'), sel('g-addons', 'm-gravy'), sel('g-addons', 'm-naan')]),
      400,
      /at most 2/,
    );
    failsWith(() => resolveSelection(item, [sel('g-spice', 'm-mild'), sel('g-spice', 'm-hot')]), 400, /at most 1/);
  });

  it('rejects modifiers from another group/item and duplicates', () => {
    failsWith(() => resolveSelection(item, [sel('g-spice', 'nope')]), 400, /Invalid option/);
    failsWith(() => resolveSelection(item, [sel('g-addons', 'm-mild')]), 400, /Invalid option/);
    failsWith(() => resolveSelection(item, [sel('g-spice', 'm-mild'), sel('g-spice', 'm-mild')]), 400, /Duplicate/);
  });

  it('allows an item with no modifier groups and an empty selection', () => {
    const plain = { ...item, modifierGroups: [] } as unknown as MenuItemWithModifiers;
    expect(resolveSelection(plain, [])).toEqual([]);
  });
});

describe('selectionSignature', () => {
  it('ignores selection order so the same choices merge into one cart line', () => {
    const a = selectionSignature('i', [sel('g1', 'b'), sel('g2', 'a')]);
    const b = selectionSignature('i', [sel('g2', 'a'), sel('g1', 'b')]);
    expect(a).toBe(b);
  });

  it('differs when the choices differ', () => {
    expect(selectionSignature('i', [sel('g', 'a')])).not.toBe(selectionSignature('i', [sel('g', 'b')]));
    expect(selectionSignature('i', [])).not.toBe(selectionSignature('other', []));
  });

  it('keeps lines with different special instructions apart, ignoring case and spacing', () => {
    const plain = selectionSignature('i', [sel('g', 'a')]);
    const noOnions = selectionSignature('i', [sel('g', 'a')], 'No onions');
    expect(noOnions).not.toBe(plain);
    expect(selectionSignature('i', [sel('g', 'a')], '  no ONIONS ')).toBe(noOnions);
    expect(selectionSignature('i', [sel('g', 'a')], '   ')).toBe(plain);
    expect(selectionSignature('i', [sel('g', 'a')], null)).toBe(plain);
  });

  it('normalizeSelection de-duplicates', () => {
    expect(normalizeSelection([sel('g', 'a'), sel('g', 'a')])).toHaveLength(1);
  });
});
