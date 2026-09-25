import type { Prisma } from '@prisma/client';
import {
  selectedModifierInputSchema,
  type AddCartItemInput,
  type CartDTO,
  type CartItemDTO,
  type SelectedModifierInput,
  type UpdateCartItemInput,
} from '@foodbowl/shared';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { HttpError } from '../../lib/http-error';
import { fmt } from '../../lib/money';
import {
  clampQuantity,
  lineTotal,
  normalizeSelection,
  resolveSelection,
  selectionSignature,
  sumMoney,
  unitPrice,
  type ResolvedModifier,
} from './pricing';

export const cartInclude = {
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      menuItem: {
        include: { category: true, modifierGroups: { include: { modifiers: true } } },
      },
    },
  },
} satisfies Prisma.CartInclude;

export type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;
export type CartLine = CartWithItems['items'][number];

const storedSelectionSchema = z.array(selectedModifierInputSchema);

export function readSelection(line: { selectedModifiers: Prisma.JsonValue }): SelectedModifierInput[] {
  const parsed = storedSelectionSchema.safeParse(line.selectedModifiers);
  return parsed.success ? parsed.data : [];
}

export interface PricedCartLine {
  line: CartLine;
  modifiers: ResolvedModifier[];
  unit: ReturnType<typeof unitPrice>;
  total: ReturnType<typeof lineTotal>;
  available: boolean;
}

/**
 * Prices a cart line at CURRENT menu prices. Never throws: an item that has
 * since been hidden, disabled, or whose chosen options no longer exist is
 * reported as unavailable so the customer can remove it, instead of the whole
 * cart failing to load.
 */
export function priceCartLine(line: CartLine): PricedCartLine {
  const item = line.menuItem;
  let modifiers: ResolvedModifier[] = [];
  let valid = true;
  try {
    modifiers = resolveSelection(item, readSelection(line));
  } catch {
    valid = false;
  }
  const unit = unitPrice(item.price, modifiers);
  return {
    line,
    modifiers,
    unit,
    total: lineTotal(unit, line.quantity),
    available: valid && item.isAvailable && item.category.isActive,
  };
}

export function toCartDTO(cart: CartWithItems): CartDTO {
  const priced = cart.items.map(priceCartLine);
  const items: CartItemDTO[] = priced.map((p) => ({
    id: p.line.id,
    menuItemId: p.line.menuItemId,
    name: p.line.menuItem.name,
    isVeg: p.line.menuItem.isVeg,
    imageUrl: p.line.menuItem.imageUrl,
    quantity: p.line.quantity,
    note: p.line.note,
    modifiers: p.modifiers.map((m) => ({
      modifierGroupId: m.modifierGroupId,
      modifierId: m.modifierId,
      name: m.name,
      priceDelta: fmt(m.priceDelta),
    })),
    unitPrice: fmt(p.unit),
    lineTotal: fmt(p.total),
    available: p.available,
  }));
  const availableLines = priced.filter((p) => p.available);
  return {
    items,
    itemCount: availableLines.reduce((n, p) => n + p.line.quantity, 0),
    subtotal: fmt(sumMoney(availableLines.map((p) => p.total))),
  };
}

export async function getOrCreateCart(userId: string): Promise<CartWithItems> {
  return prisma.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
    include: cartInclude,
  });
}

export async function getCart(userId: string): Promise<CartDTO> {
  return toCartDTO(await getOrCreateCart(userId));
}

export async function addItem(userId: string, input: AddCartItemInput): Promise<CartDTO> {
  const item = await prisma.menuItem.findUnique({
    where: { id: input.menuItemId },
    include: { category: true, modifierGroups: { include: { modifiers: true } } },
  });
  if (!item || !item.isAvailable || !item.category.isActive) {
    throw new HttpError('This item is not available', 404);
  }
  resolveSelection(item, input.selectedModifiers); // throws a descriptive 400 if invalid

  const cart = await getOrCreateCart(userId);
  const note = input.note?.trim() || undefined;
  const signature = selectionSignature(item.id, input.selectedModifiers, note);
  const existing = cart.items.find((l) => selectionSignature(l.menuItemId, readSelection(l), l.note) === signature);

  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: clampQuantity(existing.quantity + input.quantity) },
    });
  } else {
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        menuItemId: item.id,
        quantity: input.quantity,
        selectedModifiers: normalizeSelection(input.selectedModifiers) as unknown as Prisma.InputJsonValue,
        note,
      },
    });
  }
  return getCart(userId);
}

async function ownedLine(userId: string, lineId: string) {
  const line = await prisma.cartItem.findFirst({ where: { id: lineId, cart: { userId } } });
  if (!line) throw new HttpError('Cart item not found', 404);
  return line;
}

export async function updateItem(userId: string, lineId: string, input: UpdateCartItemInput): Promise<CartDTO> {
  await ownedLine(userId, lineId);
  await prisma.cartItem.update({
    where: { id: lineId },
    data: {
      ...(input.quantity !== undefined && { quantity: input.quantity }),
      ...(input.note !== undefined && { note: input.note?.trim() || null }),
    },
  });
  return getCart(userId);
}

export async function removeItem(userId: string, lineId: string): Promise<CartDTO> {
  await ownedLine(userId, lineId);
  await prisma.cartItem.delete({ where: { id: lineId } });
  return getCart(userId);
}

export async function clearCart(userId: string): Promise<CartDTO> {
  await prisma.cartItem.deleteMany({ where: { cart: { userId } } });
  return getCart(userId);
}
