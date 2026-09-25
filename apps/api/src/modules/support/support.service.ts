import { Prisma } from '@prisma/client';
import {
  PERMISSIONS,
  type AssignTicketInput,
  type CreateTicketInput,
  type PostMessageInput,
  type SupportAgentDTO,
  type SupportMessageDTO,
  type SupportStatus,
  type SupportSummaryDTO,
  type SupportTicketDTO,
  type SupportTicketDetailDTO,
} from '@foodbowl/shared';
import { prisma } from '../../db/prisma';
import { HttpError } from '../../lib/http-error';
import { logger } from '../../lib/logger';
import { getActor, type Actor } from '../../lib/rbac';
import {
  notifySupportAssigned,
  notifySupportCustomerReply,
  notifySupportNew,
  notifySupportResolved,
  notifySupportStaffReply,
} from '../notifications/notification.events';
import { usersWithPermission } from '../notifications/notification.service';
import { publishMessage, publishTicket } from './support.events';
import { messageInclude, ticketInclude, toDetailDTO, toMessageDTO, toTicketDTO, type TicketRow } from './support.dto';

const MAX_OPEN_PER_USER = 10;
const isStaff = (actor: Actor) => actor.permissions.has(PERMISSIONS.SUPPORT_MANAGE);

function generateNumber(): string {
  return `SUP-${Math.floor(100000 + Math.random() * 900000)}`;
}

async function loadTicket(id: string): Promise<TicketRow> {
  const row = await prisma.supportTicket.findUnique({ where: { id }, include: ticketInclude });
  if (!row) throw new HttpError('Conversation not found', 404);
  return row;
}

/** 404 (not 403) for anyone who isn't the requester or support staff, so ids can't be probed. */
async function loadForActor(id: string, actor: Actor): Promise<{ row: TicketRow; viewer: 'staff' | 'requester' }> {
  const row = await loadTicket(id);
  if (row.requesterId === actor.userId) return { row, viewer: 'requester' };
  if (isStaff(actor)) return { row, viewer: 'staff' };
  throw new HttpError('Conversation not found', 404);
}

/** Push the fresh state of a ticket to everyone who should see it. */
async function broadcastTicket(id: string) {
  const row = await loadTicket(id);
  publishTicket(row.requesterId, toTicketDTO(row, 'staff'), toTicketDTO(row, 'requester'));
  return row;
}

async function addSystemMessage(ticketId: string, body: string, isInternal: boolean, senderId: string | null) {
  const m = await prisma.supportMessage.create({
    data: { ticketId, senderId, kind: 'SYSTEM', body, isInternal },
    include: messageInclude,
  });
  const ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId }, select: { requesterId: true } });
  publishMessage(ticket.requesterId, toMessageDTO(m, ticket.requesterId));
  return m;
}

// ── Creating and reading ──────────────────────────────────────────────────

export async function createTicket(userId: string, input: CreateTicketInput): Promise<SupportTicketDetailDTO> {
  if (input.orderId) {
    const order = await prisma.order.findFirst({ where: { id: input.orderId, userId }, select: { id: true } });
    if (!order) throw new HttpError('Choose one of your own orders', 400);
  }
  const open = await prisma.supportTicket.count({ where: { requesterId: userId, status: { not: 'RESOLVED' } } });
  if (open >= MAX_OPEN_PER_USER) {
    throw new HttpError('You already have several open requests — please wait for a reply, or resolve the ones that are done', 429);
  }

  let created: { id: string } | undefined;
  for (let attempt = 1; !created; attempt++) {
    try {
      created = await prisma.supportTicket.create({
        data: {
          number: generateNumber(),
          subject: input.subject,
          category: input.category,
          requesterId: userId,
          orderId: input.orderId,
          messages: { create: { senderId: userId, body: input.message } },
        },
        select: { id: true },
      });
    } catch (err) {
      const collision = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (!collision || attempt >= 5) throw err;
    }
  }

  const row = await loadTicket(created.id);
  const messages = await prisma.supportMessage.findMany({ where: { ticketId: row.id }, orderBy: { createdAt: 'asc' }, include: messageInclude });
  logger.info({ ticketId: row.id, number: row.number, userId }, 'support request opened');
  publishTicket(row.requesterId, toTicketDTO(row, 'staff'), toTicketDTO(row, 'requester'));
  for (const m of messages) publishMessage(row.requesterId, toMessageDTO(m, row.requesterId));
  notifySupportNew(toTicketDTO(row, 'staff'));
  return toDetailDTO(row, messages, 'requester');
}

export async function listMine(userId: string): Promise<SupportTicketDTO[]> {
  const rows = await prisma.supportTicket.findMany({
    where: { requesterId: userId },
    orderBy: { lastMessageAt: 'desc' },
    take: 100,
    include: ticketInclude,
  });
  return rows.map((r) => toTicketDTO(r, 'requester'));
}

export interface StaffListFilter {
  view?: 'open' | 'mine' | 'unassigned' | 'resolved' | 'all';
  search?: string;
}

export async function listForStaff(actor: Actor, filter: StaffListFilter): Promise<SupportTicketDTO[]> {
  const view = filter.view ?? 'open';
  const where: Prisma.SupportTicketWhereInput = {
    ...(view === 'open' && { status: { not: 'RESOLVED' } }),
    ...(view === 'mine' && { status: { not: 'RESOLVED' }, assignedToId: actor.userId }),
    ...(view === 'unassigned' && { status: { not: 'RESOLVED' }, assignedToId: null }),
    ...(view === 'resolved' && { status: 'RESOLVED' }),
    ...(filter.search?.trim() && {
      OR: [
        { subject: { contains: filter.search.trim(), mode: 'insensitive' } },
        { number: { contains: filter.search.trim(), mode: 'insensitive' } },
        { requester: { name: { contains: filter.search.trim(), mode: 'insensitive' } } },
        { requester: { email: { contains: filter.search.trim(), mode: 'insensitive' } } },
      ],
    }),
  };
  const rows = await prisma.supportTicket.findMany({ where, orderBy: { lastMessageAt: 'desc' }, take: 100, include: ticketInclude });
  return rows.map((r) => toTicketDTO(r, 'staff'));
}

export async function getSummary(actor: Actor): Promise<SupportSummaryDTO> {
  const [open, waitingOnCustomer, unassigned, mine, candidates] = await Promise.all([
    prisma.supportTicket.count({ where: { status: 'OPEN' } }),
    prisma.supportTicket.count({ where: { status: 'PENDING' } }),
    prisma.supportTicket.count({ where: { status: { not: 'RESOLVED' }, assignedToId: null } }),
    prisma.supportTicket.count({ where: { status: { not: 'RESOLVED' }, assignedToId: actor.userId } }),
    prisma.supportTicket.findMany({ where: { status: { not: 'RESOLVED' } }, orderBy: { lastMessageAt: 'desc' }, take: 200, include: ticketInclude }),
  ]);
  return { open, waitingOnCustomer, unassigned, mine, unread: candidates.filter((r) => toTicketDTO(r, 'staff').unread).length };
}

export async function getTicket(id: string, userId: string): Promise<SupportTicketDetailDTO> {
  const actor = await getActor(userId);
  const { row, viewer } = await loadForActor(id, actor);

  // Opening a conversation marks it read for that side.
  await prisma.supportTicket.update({
    where: { id },
    data: viewer === 'requester' ? { requesterReadAt: new Date() } : { staffReadAt: new Date() },
    select: { id: true },
  });
  const fresh = await loadTicket(id);
  const messages = await prisma.supportMessage.findMany({ where: { ticketId: id }, orderBy: { createdAt: 'asc' }, include: messageInclude });
  if (row.messages[0] && toTicketDTO(row, viewer).unread) {
    publishTicket(fresh.requesterId, toTicketDTO(fresh, 'staff'), toTicketDTO(fresh, 'requester'));
  }
  return toDetailDTO(fresh, messages, viewer);
}

// ── Talking ───────────────────────────────────────────────────────────────

export async function postMessage(id: string, userId: string, input: PostMessageInput): Promise<SupportMessageDTO> {
  const actor = await getActor(userId);
  const { row, viewer } = await loadForActor(id, actor);
  const now = new Date();
  const internal = input.internal === true;

  if (viewer === 'requester' && internal) throw new HttpError('Only the restaurant can leave internal notes', 403);

  const reopening = viewer === 'requester' && row.status !== 'OPEN';
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.supportMessage.create({
      data: { ticketId: id, senderId: userId, body: input.body, isInternal: internal },
      include: messageInclude,
    });

    if (viewer === 'requester') {
      // A customer's reply always puts the ball back in the restaurant's court (and reopens a resolved chat).
      await tx.supportTicket.update({
        where: { id },
        data: { status: 'OPEN', resolvedAt: null, lastMessageAt: now, requesterReadAt: now },
      });
    } else if (internal) {
      await tx.supportTicket.update({ where: { id }, data: { staffReadAt: now } });
    } else {
      // A staff reply hands it to the customer, and claims the conversation if nobody had it.
      await tx.supportTicket.update({
        where: { id },
        data: {
          status: 'PENDING',
          resolvedAt: null,
          lastMessageAt: now,
          staffReadAt: now,
          ...(row.assignedToId === null && { assignedToId: userId }),
        },
      });
    }
    return created;
  });

  if (reopening) await addSystemMessage(id, 'The customer replied — conversation reopened.', true, null);
  if (viewer === 'staff' && !internal && row.assignedToId === null) {
    const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
    await addSystemMessage(id, `${me.name} took this conversation.`, true, null);
  }

  const dto = toMessageDTO(message, row.requesterId);
  publishMessage(row.requesterId, dto);
  const fresh = await broadcastTicket(id);
  if (!internal) {
    if (viewer === 'requester') notifySupportCustomerReply(toTicketDTO(fresh, 'staff'), input.body);
    else notifySupportStaffReply(toTicketDTO(fresh, 'requester'), input.body);
  }
  return dto;
}

// ── Managing ──────────────────────────────────────────────────────────────

export async function listAgents(): Promise<SupportAgentDTO[]> {
  const ids = await usersWithPermission(PERMISSIONS.SUPPORT_MANAGE);
  const [users, counts] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, role: { select: { key: true } } }, orderBy: { name: 'asc' } }),
    prisma.supportTicket.groupBy({ by: ['assignedToId'], where: { status: { not: 'RESOLVED' }, assignedToId: { in: ids } }, _count: { _all: true } }),
  ]);
  const open = new Map(counts.map((c) => [c.assignedToId, c._count._all]));
  return users.map((u) => ({ id: u.id, name: u.name, role: u.role.key, openAssigned: open.get(u.id) ?? 0 }));
}

export async function assign(id: string, userId: string, input: AssignTicketInput): Promise<SupportTicketDTO> {
  const actor = await getActor(userId);
  if (!isStaff(actor)) throw new HttpError('Missing permission: support.manage', 403);
  const row = await loadTicket(id);

  let assignee: { id: string; name: string } | null = null;
  if (input.assigneeId !== null) {
    const agents = await usersWithPermission(PERMISSIONS.SUPPORT_MANAGE);
    if (!agents.includes(input.assigneeId)) throw new HttpError('That person cannot handle support conversations', 400);
    assignee = await prisma.user.findUniqueOrThrow({ where: { id: input.assigneeId }, select: { id: true, name: true } });
  }
  if ((row.assignedToId ?? null) === (assignee?.id ?? null)) return toTicketDTO(row, 'staff');

  await prisma.supportTicket.update({ where: { id }, data: { assignedToId: assignee?.id ?? null } });
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
  await addSystemMessage(
    id,
    assignee
      ? assignee.id === userId ? `${me.name} assigned this to themselves.` : `${me.name} assigned this to ${assignee.name}.`
      : `${me.name} unassigned this conversation.`,
    true,
    userId,
  );
  const fresh = await broadcastTicket(id);
  if (assignee && assignee.id !== userId) notifySupportAssigned(toTicketDTO(fresh, 'staff'), assignee.id, me.name);
  return toTicketDTO(fresh, 'staff');
}

export async function setStatus(id: string, userId: string, status: SupportStatus): Promise<SupportTicketDTO> {
  const actor = await getActor(userId);
  const { row, viewer } = await loadForActor(id, actor);
  // Customers can close their own conversation; only staff can put it in the other states.
  if (viewer === 'requester' && status !== 'RESOLVED') throw new HttpError('You can only mark your own request as resolved', 403);
  if (row.status === status) return toTicketDTO(row, viewer);

  await prisma.supportTicket.update({
    where: { id },
    data: { status, resolvedAt: status === 'RESOLVED' ? new Date() : null },
  });
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
  if (status === 'RESOLVED') await addSystemMessage(id, `${me.name} marked this as resolved.`, false, userId);
  else if (row.status === 'RESOLVED') await addSystemMessage(id, `${me.name} reopened this conversation.`, false, userId);

  const fresh = await broadcastTicket(id);
  if (status === 'RESOLVED' && viewer === 'staff') notifySupportResolved(toTicketDTO(fresh, 'requester'));
  return toTicketDTO(fresh, viewer);
}
