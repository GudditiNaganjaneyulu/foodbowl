import type { Prisma } from '@prisma/client';
import { fmt } from '../../lib/money';

/**
 * Prisma serializes Decimal columns as their shortest form ("4.5", "12"),
 * while cart/order responses use two places ("4.50"). Menu endpoints are
 * normalized here so money looks the same everywhere in the API.
 */
type WithMoney<T> = T extends { price: Prisma.Decimal }
  ? Omit<T, 'price'> & { price: string }
  : T extends { priceDelta: Prisma.Decimal }
    ? Omit<T, 'priceDelta'> & { priceDelta: string }
    : T;

export function moneyStrings<T>(node: T): unknown {
  if (Array.isArray(node)) return node.map(moneyStrings);
  if (node && typeof node === 'object' && !(node instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const isMoney = (key === 'price' || key === 'priceDelta') && isDecimal(value);
      out[key] = isMoney ? fmt(value as Prisma.Decimal) : moneyStrings(value);
    }
    return out;
  }
  return node;
}

const isDecimal = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && typeof (v as { toFixed?: unknown }).toFixed === 'function';

export type { WithMoney };
