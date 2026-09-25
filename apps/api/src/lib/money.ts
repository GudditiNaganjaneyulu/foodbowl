import { Prisma } from '@prisma/client';

export type Money = Prisma.Decimal;

export const dec = (value: Prisma.Decimal.Value): Money => new Prisma.Decimal(value);
export const ZERO = dec(0);

/** Two-place decimal string, the wire format for every money field. */
export const fmt = (value: Money): string => value.toFixed(2);
