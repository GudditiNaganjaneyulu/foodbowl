import type { Address } from '@prisma/client';
import { TERMINAL_STATUSES, type AddressDTO, type AddressInput, type UpdateAddressInput } from '@foodbowl/shared';
import { prisma } from '../../db/prisma';
import { HttpError } from '../../lib/http-error';

export function toAddressDTO(a: Address): AddressDTO {
  return {
    id: a.id,
    label: a.label,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    state: a.state,
    postalCode: a.postalCode,
    lat: a.lat,
    lng: a.lng,
    isDefault: a.isDefault,
  };
}

export async function listAddresses(userId: string): Promise<AddressDTO[]> {
  const rows = await prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  return rows.map(toAddressDTO);
}

async function owned(userId: string, id: string) {
  const address = await prisma.address.findFirst({ where: { id, userId } });
  if (!address) throw new HttpError('Address not found', 404);
  return address;
}

export async function createAddress(userId: string, input: AddressInput): Promise<AddressDTO> {
  const existing = await prisma.address.count({ where: { userId } });
  const makeDefault = input.isDefault === true || existing === 0;
  const created = await prisma.$transaction(async (tx) => {
    if (makeDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.address.create({ data: { ...input, userId, isDefault: makeDefault } });
  });
  return toAddressDTO(created);
}

export async function updateAddress(userId: string, id: string, input: UpdateAddressInput): Promise<AddressDTO> {
  await owned(userId, id);

  // An address attached to a live order is what the rider navigates to —
  // don't let it change underneath them. (Flipping isDefault is harmless.)
  const { isDefault, ...details } = input;
  if (Object.keys(details).length > 0) {
    const live = await prisma.order.count({
      where: { addressId: id, status: { notIn: TERMINAL_STATUSES } },
    });
    if (live > 0) {
      throw new HttpError('This address is on an active order and cannot be edited until it completes', 409);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (isDefault === true) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.address.update({ where: { id }, data: { ...details, ...(isDefault !== undefined && { isDefault }) } });
  });
  return toAddressDTO(updated);
}

export async function deleteAddress(userId: string, id: string): Promise<void> {
  const address = await owned(userId, id);
  const used = await prisma.order.count({ where: { addressId: id } });
  if (used > 0) throw new HttpError('This address is part of your order history and cannot be deleted', 409);

  await prisma.address.delete({ where: { id } });
  if (address.isDefault) {
    const next = await prisma.address.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
    if (next) await prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
  }
}
