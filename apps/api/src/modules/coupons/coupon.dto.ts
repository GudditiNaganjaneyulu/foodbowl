import type { Prisma } from '@prisma/client';
import type { CouponDTO } from '@foodbowl/shared';
import { fmt } from '../../lib/money';

export type CouponRow = {
  code: string;
  discountPercent: Prisma.Decimal;
  reason: string | null;
  status: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

export function toCouponDTO(c: CouponRow): CouponDTO {
  return {
    code: c.code,
    discountPercent: fmt(c.discountPercent),
    reason: c.reason,
    status: c.status as CouponDTO['status'],
    expiresAt: c.expiresAt.toISOString(),
    usedAt: c.usedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}
