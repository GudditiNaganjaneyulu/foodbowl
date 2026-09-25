import { z } from 'zod';

export const SUPPORT_CATEGORIES = ['ORDER', 'DELIVERY', 'PAYMENT', 'MENU', 'ACCOUNT', 'OTHER'] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  ORDER: 'An order',
  DELIVERY: 'Delivery',
  PAYMENT: 'Payment / cash',
  MENU: 'Menu or food',
  ACCOUNT: 'My account',
  OTHER: 'Something else',
};

/** OPEN = waiting on the restaurant, PENDING = waiting on the customer, RESOLVED = done. */
export const SUPPORT_STATUSES = ['OPEN', 'PENDING', 'RESOLVED'] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  OPEN: 'Open',
  PENDING: 'Waiting for customer',
  RESOLVED: 'Resolved',
};

export const MAX_MESSAGE_LENGTH = 2000;

export const createTicketSchema = z.object({
  subject: z.string().trim().min(3, 'Give your request a short title').max(120),
  category: z.enum(SUPPORT_CATEGORIES).default('OTHER'),
  message: z.string().trim().min(1, 'Tell us what happened').max(MAX_MESSAGE_LENGTH),
  /** Optional: the order this is about. Must be one of your own. */
  orderId: z.string().optional(),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const postMessageSchema = z.object({
  body: z.string().trim().min(1, 'Write a message').max(MAX_MESSAGE_LENGTH),
  /** Staff only: a note the customer never sees. */
  internal: z.boolean().optional(),
});
export type PostMessageInput = z.infer<typeof postMessageSchema>;

export const assignTicketSchema = z.object({
  /** A colleague's user id, or null to leave it unassigned. */
  assigneeId: z.string().nullable(),
});
export type AssignTicketInput = z.infer<typeof assignTicketSchema>;

export const updateTicketStatusSchema = z.object({ status: z.enum(SUPPORT_STATUSES) });
export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;
