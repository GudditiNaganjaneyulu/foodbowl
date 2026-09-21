import { z } from 'zod';
import { ALL_ROLES } from '../constants/roles';
import { ALL_PERMISSIONS } from '../constants/permissions';

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  phone: z.string().min(7).max(20).optional(),
  role: z.enum(ALL_ROLES as [string, ...string[]]).refine((r) => r !== 'customer', {
    message: 'Customers self-register; use this to create staff/delivery/owner accounts only',
  }),
  temporaryPassword: z.string().min(8),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserRoleSchema = z.object({
  role: z.enum(ALL_ROLES as [string, ...string[]]),
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

export const updateUserPermissionsSchema = z.object({
  grants: z
    .array(
      z.object({
        permission: z.enum(ALL_PERMISSIONS as [string, ...string[]]),
        granted: z.boolean(),
      }),
    )
    .min(1),
});
export type UpdateUserPermissionsInput = z.infer<typeof updateUserPermissionsSchema>;

export const addressSchema = z.object({
  label: z.string().min(1).max(60),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  lat: z.number().optional(),
  lng: z.number().optional(),
  isDefault: z.boolean().optional(),
});
export type AddressInput = z.infer<typeof addressSchema>;
