import type { Restaurant } from '@prisma/client';
import type { RestaurantDTO, UpdateRestaurantInput } from '@foodbowl/shared';
import { prisma } from '../../db/prisma';
import { writeAudit } from '../../lib/audit';
import { dec, fmt } from '../../lib/money';

export function toRestaurantDTO(r: Restaurant): RestaurantDTO {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    logoUrl: r.logoUrl,
    address: r.address,
    phone: r.phone,
    isOpen: r.isOpen,
    opensAt: r.opensAt,
    closesAt: r.closesAt,
    minOrderAmount: fmt(r.minOrderAmount),
    deliveryFee: fmt(r.deliveryFee),
  };
}

// v1 is single-restaurant (BUILD_PROMPT.md §15): the table has one row.
export async function getRestaurant() {
  return prisma.restaurant.findFirstOrThrow();
}

export async function updateRestaurant(actorUserId: string, input: UpdateRestaurantInput) {
  const current = await getRestaurant();
  const { minOrderAmount, deliveryFee, ...rest } = input;
  const updated = await prisma.restaurant.update({
    where: { id: current.id },
    data: {
      ...rest,
      ...(minOrderAmount !== undefined && { minOrderAmount: dec(minOrderAmount) }),
      ...(deliveryFee !== undefined && { deliveryFee: dec(deliveryFee) }),
    },
  });
  await writeAudit(actorUserId, 'restaurant.update', 'Restaurant', current.id, input);
  return updated;
}
