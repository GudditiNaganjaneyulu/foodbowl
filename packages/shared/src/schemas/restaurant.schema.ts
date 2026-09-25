import { z } from 'zod';

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM');

export const updateRestaurantSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).nullable(),
    address: z.string().max(200).nullable(),
    phone: z.string().max(30).nullable(),
    isOpen: z.boolean(),
    opensAt: timeOfDay.nullable(),
    closesAt: timeOfDay.nullable(),
    minOrderAmount: z.number().min(0).max(100000),
    deliveryFee: z.number().min(0).max(100000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>;
