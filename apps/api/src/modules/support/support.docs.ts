import type { FastifySchema } from 'fastify';
import { PERMISSIONS, assignTicketSchema, createTicketSchema, postMessageSchema, updateTicketStatusSchema } from '@foodbowl/shared';
import { bearerAuth, errorResponses, fromZod, idParam, protectedErrors, ref, requiresPermission } from '../../lib/openapi';

const gate = requiresPermission(PERMISSIONS.SUPPORT_MANAGE);
const unauthorized = { 401: 'Missing, invalid or expired access token.' } as const;
const ticket = (description: string) => ({ description, ...ref('SupportTicket') });
const notFound = { 404: 'No such conversation, or it is not yours.' } as const;

export const createTicketDocs: FastifySchema = {
  tags: ['Support'],
  summary: 'Open a support conversation',
  description:
    'Starts a conversation with the restaurant, optionally about one of **your own orders**. The first message is included. Anyone with `support.manage` is notified and can reply. You can have up to 10 unresolved conversations at once.',
  security: bearerAuth,
  body: fromZod(createTicketSchema, {
    example: { subject: 'My order arrived cold', category: 'DELIVERY', message: 'The food was cold when it arrived. Can I get a refund?', orderId: 'seed-order-live' },
  }),
  response: {
    201: { description: 'The new conversation with its first message.', ...ref('SupportTicketDetail') },
    ...errorResponses({ 400: 'Validation failed, or the order is not yours.', ...unauthorized, 429: 'Too many unresolved conversations.' }),
  },
};

export const listMineDocs: FastifySchema = {
  tags: ['Support'],
  summary: 'My support conversations',
  description: 'Newest activity first. `unread` is true when the restaurant replied since you last opened it.',
  security: bearerAuth,
  response: { 200: { description: 'My conversations.', type: 'array', items: ref('SupportTicket') }, ...errorResponses(unauthorized) },
};

export const listTicketsDocs: FastifySchema = {
  tags: ['Support'],
  summary: 'Support inbox',
  description: `All conversations for the support team, newest activity first. \`view\`: \`open\` (default — not resolved), \`mine\` (assigned to you), \`unassigned\`, \`resolved\`, or \`all\`. \`q\` searches the subject, reference number and the customer's name or email.\n\n${gate}`,
  security: bearerAuth,
  querystring: {
    type: 'object',
    properties: {
      view: { type: 'string', enum: ['open', 'mine', 'unassigned', 'resolved', 'all'] },
      q: { type: 'string', description: 'Search text.' },
    },
  },
  response: {
    200: { description: 'Matching conversations.', type: 'array', items: ref('SupportTicket') },
    ...errorResponses({ 400: 'Invalid query.', ...protectedErrors }),
  },
};

export const summaryDocs: FastifySchema = {
  tags: ['Support'],
  summary: 'Support inbox counters',
  description: `Counts for the inbox badges: open, waiting on the customer, unassigned, assigned to you, and unread.\n\n${gate}`,
  security: bearerAuth,
  response: { 200: { description: 'Counters.', ...ref('SupportSummary') }, ...errorResponses(protectedErrors) },
};

export const listAgentsDocs: FastifySchema = {
  tags: ['Support'],
  summary: 'People who can handle support',
  description: `Active users holding \`support.manage\` (the owner, and staff granted it), with how many open conversations each has — for choosing who to assign a conversation to.\n\n${gate}`,
  security: bearerAuth,
  response: { 200: { description: 'Agents.', type: 'array', items: ref('SupportAgent') }, ...errorResponses(protectedErrors) },
};

export const getTicketDocs: FastifySchema = {
  tags: ['Support'],
  summary: 'Get a conversation',
  description:
    'The conversation and its messages, oldest first. Visible to the customer who opened it and to support staff; anyone else gets **404**. **Opening it marks it read** for your side. Staff also receive internal notes and events; the customer never does.',
  security: bearerAuth,
  params: idParam,
  response: { 200: { description: 'The conversation.', ...ref('SupportTicketDetail') }, ...errorResponses({ ...unauthorized, ...notFound }) },
};

export const postMessageDocs: FastifySchema = {
  tags: ['Support'],
  summary: 'Send a message',
  description:
    'Adds a message. **Customer:** the conversation returns to *Open* (reopening it if it was resolved). **Staff:** the message is sent to the customer and the conversation becomes *Waiting for customer*; if nobody was assigned it is **assigned to the replier**. Staff may set `internal: true` for a note only the team sees (no status change, no notification).',
  security: bearerAuth,
  params: idParam,
  body: fromZod(postMessageSchema, { example: { body: 'Sorry about that — I have refunded the delivery fee.' } }),
  response: {
    201: { description: 'The message.', ...ref('SupportMessage') },
    ...errorResponses({ 400: 'Validation failed.', ...unauthorized, 403: 'Customers cannot leave internal notes.', ...notFound }),
  },
};

export const setStatusDocs: FastifySchema = {
  tags: ['Support'],
  summary: 'Change a conversation\'s status',
  description:
    'Staff can set any status: `OPEN`, `PENDING` (waiting for the customer) or `RESOLVED`. The **customer** may only mark their own conversation `RESOLVED`. Resolving posts a visible note and notifies the customer.',
  security: bearerAuth,
  params: idParam,
  body: fromZod(updateTicketStatusSchema, { example: { status: 'RESOLVED' } }),
  response: {
    200: ticket('The updated conversation.'),
    ...errorResponses({ 400: 'Validation failed.', ...unauthorized, 403: 'Customers can only resolve their own request.', ...notFound }),
  },
};

export const assignDocs: FastifySchema = {
  tags: ['Support'],
  summary: 'Assign a conversation',
  description: `Hands a conversation to a colleague (or \`null\` to unassign). The assignee must be an active user with \`support.manage\`; they are notified. Recorded as an internal event.\n\n${gate}`,
  security: bearerAuth,
  params: idParam,
  body: fromZod(assignTicketSchema, { example: { assigneeId: 'cm0xyz789ghi012' } }),
  response: {
    200: ticket('The updated conversation.'),
    ...errorResponses({ 400: 'That person cannot handle support conversations.', ...protectedErrors, 404: 'No such conversation.' }),
  },
};
