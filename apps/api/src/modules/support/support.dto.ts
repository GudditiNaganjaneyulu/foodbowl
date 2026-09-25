import type { Prisma } from '@prisma/client';
import type { SupportMessageDTO, SupportTicketDTO, SupportTicketDetailDTO } from '@foodbowl/shared';

const senderSelect = { select: { id: true, name: true, role: { select: { key: true } } } } as const;

export const ticketInclude = {
  requester: { select: { id: true, name: true, email: true, phone: true } },
  order: { select: { id: true, orderNumber: true, status: true } },
  assignedTo: { select: { id: true, name: true } },
  // The latest message the customer can see — used for list previews and unread state.
  messages: {
    where: { isInternal: false, kind: 'TEXT' },
    orderBy: { createdAt: 'desc' },
    take: 1,
    include: { sender: senderSelect },
  },
} satisfies Prisma.SupportTicketInclude;

export type TicketRow = Prisma.SupportTicketGetPayload<{ include: typeof ticketInclude }>;
type MessageRow = Prisma.SupportMessageGetPayload<{ include: { sender: typeof senderSelect } }>;

export const messageInclude = { sender: senderSelect } satisfies Prisma.SupportMessageInclude;

export type Viewer = 'staff' | 'requester';

export function toMessageDTO(m: MessageRow, requesterId: string): SupportMessageDTO {
  return {
    id: m.id,
    ticketId: m.ticketId,
    kind: m.kind,
    body: m.body,
    isInternal: m.isInternal,
    sender: m.sender ? { id: m.sender.id, name: m.sender.name, role: m.sender.role.key } : null,
    fromStaff: m.sender !== null && m.sender.id !== requesterId,
    createdAt: m.createdAt.toISOString(),
  };
}

/**
 * What each side has "not opened yet". The customer has unread activity when
 * the last thing they can see was written by staff after they last looked; staff
 * (one shared read marker for the whole team) when the last visible message is
 * the customer's and nobody has looked since.
 */
function isUnread(row: TicketRow, viewer: Viewer, last: MessageRow | undefined): boolean {
  if (!last) return false;
  const fromStaff = last.sender !== null && last.sender.id !== row.requesterId;
  if (viewer === 'requester') return fromStaff && last.createdAt > row.requesterReadAt;
  return !fromStaff && (row.staffReadAt === null || last.createdAt > row.staffReadAt);
}

export function toTicketDTO(row: TicketRow, viewer: Viewer): SupportTicketDTO {
  const last = row.messages[0];
  return {
    id: row.id,
    number: row.number,
    subject: row.subject,
    category: row.category,
    status: row.status,
    requester: row.requester,
    order: row.order ? { id: row.order.id, orderNumber: row.order.orderNumber, status: row.order.status } : null,
    assignedTo: row.assignedTo,
    lastMessageAt: row.lastMessageAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    unread: isUnread(row, viewer, last),
    lastMessage: last
      ? {
          body: last.body,
          fromStaff: last.sender !== null && last.sender.id !== row.requesterId,
          senderName: last.sender?.name ?? 'FoodBowl',
          createdAt: last.createdAt.toISOString(),
        }
      : null,
  };
}

export function toDetailDTO(row: TicketRow, messages: MessageRow[], viewer: Viewer): SupportTicketDetailDTO {
  return {
    ...toTicketDTO(row, viewer),
    // Internal notes never leave the staff side.
    messages: messages.filter((m) => viewer === 'staff' || !m.isInternal).map((m) => toMessageDTO(m, row.requesterId)),
  };
}
