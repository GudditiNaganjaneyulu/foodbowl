import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { REALTIME, type NotificationListDTO, type SupportAgentDTO, type SupportMessageDTO, type SupportSummaryDTO, type SupportTicketDetailDTO, type SupportTicketDTO } from '@foodbowl/shared';
import type { FastifyInstance } from 'fastify';
import { settleNotifications } from '../src/modules/notifications/notification.service';
import { deleteSince, resetBaseline } from './cleanup';
import { ACCOUNTS, describeDb, login, type Session } from './helpers';

let app: FastifyInstance;
let prisma: typeof import('../src/db/prisma').prisma;
let owner: Session, agent: Session, kitchen: Session, rider: Session, c1: Session, c2: Session, c3: Session;
const startedAt = new Date();

const open = async (s: Session, over: object = {}) => {
  const res = await s.req('POST', '/api/v1/support/tickets', { subject: 'Where is my order?', category: 'DELIVERY', message: 'It has been an hour.', ...over });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as SupportTicketDetailDTO;
};
const inbox = async (s: Session, query = '') => (await s.req('GET', `/api/v1/support/tickets${query}`)).body as SupportTicketDTO[];
const detail = async (s: Session, id: string) => (await s.req('GET', `/api/v1/support/tickets/${id}`)).body as SupportTicketDetailDTO;
const say = (s: Session, id: string, body: string, internal?: boolean) => s.req('POST', `/api/v1/support/tickets/${id}/messages`, { body, internal });
const notes = async (s: Session) => ((await s.req('GET', '/api/v1/notifications/me')).body as NotificationListDTO).items;

describeDb('customer support (needs TEST_DATABASE_URL)', () => {
  beforeAll(async () => {
    const { buildApp } = await import('../src/app');
    ({ prisma } = await import('../src/db/prisma'));
    await resetBaseline(prisma);
    app = await buildApp();
    await app.ready();
    [owner, agent, kitchen, rider, c1, c2, c3] = await Promise.all([
      login(app, ACCOUNTS.owner), login(app, ACCOUNTS.staffSupport), login(app, ACCOUNTS.staffOrders), login(app, ACCOUNTS.delivery1),
      login(app, ACCOUNTS.customer1), login(app, ACCOUNTS.customer2), login(app, ACCOUNTS.customer3),
    ]);
  });

  // Each test opens its own conversations; clear them so the per-customer cap
  // (10 unresolved) only ever comes into play in the test that checks it.
  afterEach(async () => {
    await settleNotifications();
    await prisma.supportTicket.deleteMany({ where: { createdAt: { gte: startedAt }, requesterId: { in: [c1.userId, c2.userId] } } });
  });

  afterAll(async () => {
    await settleNotifications();
    await prisma.supportTicket.deleteMany({ where: { createdAt: { gte: startedAt } } });
    await deleteSince(prisma, startedAt);
    await app.close();
  });

  describe('opening a conversation', () => {
    it('creates it with the first message, optionally linked to your own order', async () => {
      const t = await open(c1, { orderId: 'seed-order-delivered', subject: 'Cold food', category: 'ORDER' });
      expect(t).toMatchObject({ subject: 'Cold food', category: 'ORDER', status: 'OPEN', assignedTo: null, unread: false });
      expect(t.number).toMatch(/^SUP-\d{6}$/);
      expect(t.order).toMatchObject({ orderNumber: 'FB-1001' });
      expect(t.messages).toHaveLength(1);
      expect(t.messages[0]).toMatchObject({ body: 'It has been an hour.', fromStaff: false, isInternal: false, kind: 'TEXT' });
    });

    it('validates input and refuses other people\'s orders', async () => {
      const bad = (over: object) => c1.req('POST', '/api/v1/support/tickets', { subject: 'Hello there', message: 'x', ...over });
      expect((await bad({ subject: 'Hi' })).status).toBe(400); // too short
      expect((await bad({ message: '   ' })).status).toBe(400);
      expect((await bad({ message: 'x'.repeat(2001) })).status).toBe(400);
      expect((await bad({ category: 'NOPE' })).status).toBe(400);
      expect((await bad({ orderId: 'seed-order-live' })).status).toBe(400); // customer2's order
      expect((await bad({ orderId: 'does-not-exist' })).status).toBe(400);
      expect((await app.inject({ method: 'POST', url: '/api/v1/support/tickets', payload: {} })).statusCode).toBe(401);
    });

    it('caps unresolved conversations per person', async () => {
      for (let i = 0; i < 10; i++) await open(c3, { subject: `Question number ${i}` });
      const res = await c3.req('POST', '/api/v1/support/tickets', { subject: 'One too many', message: 'hello' });
      expect(res.status).toBe(429);
    });
  });

  describe('who can see what', () => {
    it('shows customers only their own, and hides others behind a 404', async () => {
      const t = await open(c1, { subject: 'Private matter' });
      const mine = (await c1.req('GET', '/api/v1/support/tickets/me')).body as SupportTicketDTO[];
      expect(mine.some((x) => x.id === t.id)).toBe(true);
      expect(((await c2.req('GET', '/api/v1/support/tickets/me')).body as SupportTicketDTO[]).some((x) => x.id === t.id)).toBe(false);
      expect((await c2.req('GET', `/api/v1/support/tickets/${t.id}`)).status).toBe(404);
      expect((await c2.req('POST', `/api/v1/support/tickets/${t.id}/messages`, { body: 'snooping' })).status).toBe(404);
      expect((await c2.req('PATCH', `/api/v1/support/tickets/${t.id}/status`, { status: 'RESOLVED' })).status).toBe(404);
    });

    it('needs support.manage for the inbox — even for other staff, riders and customers', async () => {
      const t = await open(c1, { subject: 'Inbox access' });
      for (const s of [kitchen, rider, c1]) {
        expect((await s.req('GET', '/api/v1/support/tickets')).status).toBe(403);
        expect((await s.req('GET', '/api/v1/support/summary')).status).toBe(403);
        expect((await s.req('GET', '/api/v1/support/agents')).status).toBe(403);
      }
      // A staff member WITHOUT support.manage can't open someone's conversation either.
      expect((await kitchen.req('GET', `/api/v1/support/tickets/${t.id}`)).status).toBe(404);
      expect((await kitchen.req('PATCH', `/api/v1/support/tickets/${t.id}/assign`, { assigneeId: null })).status).toBe(403);
      for (const s of [agent, owner]) expect((await inbox(s)).some((x) => x.id === t.id)).toBe(true);
    });
  });

  describe('replying', () => {
    it('lets staff answer, hands the ball to the customer, and claims an unassigned conversation', async () => {
      const t = await open(c1, { subject: 'Reply flow' });
      expect((await inbox(agent)).find((x) => x.id === t.id)).toMatchObject({ unread: true, status: 'OPEN', assignedTo: null });

      const opened = await detail(agent, t.id);
      expect(opened.unread).toBe(false); // opening marks it read for the team
      const reply = await say(agent, t.id, 'Sorry to hear that — looking into it now.');
      expect(reply.status).toBe(201);
      expect(reply.body).toMatchObject({ fromStaff: true, isInternal: false, sender: { name: 'Staff Sam (customer support)' } });

      const after = await detail(c1, t.id);
      expect(after).toMatchObject({ status: 'PENDING', assignedTo: { name: 'Staff Sam (customer support)' }, unread: false });
      expect(after.messages.map((m) => m.body)).toEqual(['It has been an hour.', 'Sorry to hear that — looking into it now.']);
    });

    it('marks the customer\'s copy unread until they open it, then read', async () => {
      const t = await open(c1, { subject: 'Unread state' });
      await say(agent, t.id, 'Hello!');
      expect(((await c1.req('GET', '/api/v1/support/tickets/me')).body as SupportTicketDTO[]).find((x) => x.id === t.id)!.unread).toBe(true);
      await detail(c1, t.id);
      expect(((await c1.req('GET', '/api/v1/support/tickets/me')).body as SupportTicketDTO[]).find((x) => x.id === t.id)!.unread).toBe(false);
    });

    it('returns the conversation to Open when the customer writes back', async () => {
      const t = await open(c1, { subject: 'Ping pong' });
      await say(agent, t.id, 'Can you send a photo?');
      expect((await detail(agent, t.id)).status).toBe('PENDING');
      await say(c1, t.id, 'Here you go.');
      const after = await detail(agent, t.id);
      expect(after.status).toBe('OPEN');
      expect(after.assignedTo).toMatchObject({ name: 'Staff Sam (customer support)' }); // keeps its owner
    });

    it('keeps internal notes away from the customer, in the detail, the preview and status', async () => {
      const t = await open(c1, { subject: 'Notes' });
      await say(owner, t.id, 'Public answer');
      const note = await say(agent, t.id, 'Customer has complained before — be careful.', true);
      expect(note.body).toMatchObject({ isInternal: true });

      const forCustomer = await detail(c1, t.id);
      expect(JSON.stringify(forCustomer)).not.toContain('complained before');
      expect(forCustomer.lastMessage?.body).toBe('Public answer');
      expect(forCustomer.messages.every((m) => !m.isInternal)).toBe(true);

      const forStaff = await detail(agent, t.id);
      expect(forStaff.messages.some((m) => m.isInternal && m.body.includes('complained before'))).toBe(true);
      expect(forStaff.status).toBe('PENDING'); // a note doesn't change the state
      expect((await say(c1, t.id, 'Trying a secret note', true)).status).toBe(403);
    });

    it('rejects empty and oversized messages', async () => {
      const t = await open(c1, { subject: 'Validation' });
      expect((await say(c1, t.id, '   ')).status).toBe(400);
      expect((await say(c1, t.id, 'y'.repeat(2001))).status).toBe(400);
    });
  });

  describe('assigning', () => {
    it('lists exactly the people who can handle support, with their workload', async () => {
      const agents = (await owner.req('GET', '/api/v1/support/agents')).body as SupportAgentDTO[];
      expect(agents.map((a) => a.name)).toEqual(expect.arrayContaining(['Owner Olivia', 'Staff Sam (customer support)']));
      expect(agents.map((a) => a.name)).not.toContain('Staff Sam (orders only)'); // no support.manage
      expect(agents.every((a) => a.openAssigned >= 0)).toBe(true);
    });

    it('hands a conversation to a colleague, records it privately, and notifies them', async () => {
      const t = await open(c1, { subject: 'Assign me' });
      const ownerId = owner.userId;
      const res = await agent.req('PATCH', `/api/v1/support/tickets/${t.id}/assign`, { assigneeId: ownerId });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toMatchObject({ assignedTo: { id: ownerId, name: 'Owner Olivia' } });

      const staffView = await detail(owner, t.id);
      expect(staffView.messages.at(-1)).toMatchObject({ kind: 'SYSTEM', isInternal: true });
      expect(staffView.messages.at(-1)!.body).toContain('assigned this to Owner Olivia');
      expect((await detail(c1, t.id)).messages.some((m) => m.kind === 'SYSTEM')).toBe(false); // customer never sees it

      await settleNotifications();
      expect((await notes(owner)).some((n) => n.type === 'support.assigned' && n.metadata.ticketId === t.id)).toBe(true);

      // …and back to nobody.
      const un = await agent.req('PATCH', `/api/v1/support/tickets/${t.id}/assign`, { assigneeId: null });
      expect(un.body.assignedTo).toBeNull();
      // No-op assignments don't spam the log.
      const before = (await detail(owner, t.id)).messages.length;
      await agent.req('PATCH', `/api/v1/support/tickets/${t.id}/assign`, { assigneeId: null });
      expect((await detail(owner, t.id)).messages.length).toBe(before);
    });

    it('refuses to assign to someone who cannot handle support, or who doesn\'t exist', async () => {
      const t = await open(c1, { subject: 'Bad assignee' });
      for (const id of [kitchen.userId, rider.userId, c2.userId, 'nope']) {
        expect((await agent.req('PATCH', `/api/v1/support/tickets/${t.id}/assign`, { assigneeId: id })).status).toBe(400);
      }
      expect((await agent.req('PATCH', `/api/v1/support/tickets/${t.id}/assign`, {})).status).toBe(400);
    });

    it('drives the inbox filters', async () => {
      const mineT = await open(c1, { subject: 'Filter mine zzq' });
      const freeT = await open(c2, { subject: 'Filter free zzq' });
      await agent.req('PATCH', `/api/v1/support/tickets/${mineT.id}/assign`, { assigneeId: agent.userId });

      const ids = async (q: string) => (await inbox(agent, q)).map((t) => t.id);
      expect(await ids('?view=mine')).toContain(mineT.id);
      expect(await ids('?view=mine')).not.toContain(freeT.id);
      expect(await ids('?view=unassigned')).toContain(freeT.id);
      expect(await ids('?view=unassigned')).not.toContain(mineT.id);
      expect(await ids('?q=free zzq')).toEqual([freeT.id]);
      expect((await ids(`?q=${encodeURIComponent('Riley')}`)).length).toBeGreaterThan(0); // by customer name
      expect((await agent.req('GET', '/api/v1/support/tickets?view=bogus')).status).toBe(400);

      const summary = (await agent.req('GET', '/api/v1/support/summary')).body as SupportSummaryDTO;
      expect(summary.mine).toBeGreaterThanOrEqual(1);
      expect(summary.unassigned).toBeGreaterThanOrEqual(1);
      expect(summary.open).toBeGreaterThanOrEqual(2);
    });
  });

  describe('resolving', () => {
    it('lets staff resolve (visibly, notifying the customer) and the customer reopen by replying', async () => {
      const t = await open(c1, { subject: 'Resolve me' });
      const res = await agent.req('PATCH', `/api/v1/support/tickets/${t.id}/status`, { status: 'RESOLVED' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'RESOLVED' });
      expect(res.body.resolvedAt).toBeTruthy();
      expect((await detail(c1, t.id)).messages.at(-1)).toMatchObject({ kind: 'SYSTEM', isInternal: false });
      expect((await inbox(agent)).some((x) => x.id === t.id)).toBe(false); // out of the default open view
      expect((await inbox(agent, '?view=resolved')).some((x) => x.id === t.id)).toBe(true);

      await settleNotifications();
      expect((await notes(c1)).some((n) => n.type === 'support.resolved' && n.metadata.ticketId === t.id)).toBe(true);

      await say(c1, t.id, 'Actually, it is still not sorted.');
      const reopened = await detail(agent, t.id);
      expect(reopened).toMatchObject({ status: 'OPEN', resolvedAt: null });
      expect(reopened.messages.some((m) => m.isInternal && m.body.includes('reopened'))).toBe(true);
    });

    it('lets customers resolve their own request, but not put it in any other state', async () => {
      const t = await open(c1, { subject: 'Self resolve' });
      expect((await c1.req('PATCH', `/api/v1/support/tickets/${t.id}/status`, { status: 'PENDING' })).status).toBe(403);
      expect((await c1.req('PATCH', `/api/v1/support/tickets/${t.id}/status`, { status: 'OPEN' })).status).toBe(403);
      expect((await c1.req('PATCH', `/api/v1/support/tickets/${t.id}/status`, { status: 'BOGUS' })).status).toBe(400);
      const ok = await c1.req('PATCH', `/api/v1/support/tickets/${t.id}/status`, { status: 'RESOLVED' });
      expect(ok.status).toBe(200);
      expect(ok.body.status).toBe('RESOLVED');
    });

    it('a staff reply to a resolved conversation reopens it as waiting-for-customer', async () => {
      const t = await open(c1, { subject: 'Late reply' });
      await agent.req('PATCH', `/api/v1/support/tickets/${t.id}/status`, { status: 'RESOLVED' });
      await say(agent, t.id, 'One more thing…');
      expect(await detail(agent, t.id)).toMatchObject({ status: 'PENDING', resolvedAt: null });
    });
  });

  describe('notifications', () => {
    it('tells the team about a new request, the customer about a reply, and the owner of a chat about a customer reply', async () => {
      const t = await open(c2, { subject: 'Notify everyone' });
      await settleNotifications();
      for (const staff of [owner, agent]) {
        expect((await notes(staff)).some((n) => n.type === 'support.new' && n.metadata.ticketId === t.id)).toBe(true);
      }
      expect((await notes(kitchen)).some((n) => n.metadata.ticketId === t.id)).toBe(false); // not a support agent
      expect((await notes(c1)).some((n) => n.metadata.ticketId === t.id)).toBe(false);

      await say(agent, t.id, 'On it.'); // agent now owns the conversation
      await settleNotifications();
      expect((await notes(c2)).some((n) => n.type === 'support.reply' && n.metadata.ticketId === t.id)).toBe(true);

      await say(c2, t.id, 'Thanks!');
      await settleNotifications();
      expect((await notes(agent)).some((n) => n.type === 'support.customer_reply' && n.metadata.ticketId === t.id)).toBe(true);
      // Assigned to the agent, so the owner isn't pinged about this reply.
      expect((await notes(owner)).some((n) => n.type === 'support.customer_reply' && n.metadata.ticketId === t.id)).toBe(false);
    });
  });

  describe('live updates', () => {
    let url: string;
    const sockets: Socket[] = [];
    beforeAll(async () => {
      await app.listen({ port: 0, host: '127.0.0.1' });
      const addr = app.server.address();
      url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}${REALTIME.NAMESPACE}`;
    });
    afterAll(() => sockets.forEach((s) => s.disconnect()));

    const connectAs = (token: string) =>
      new Promise<Socket>((resolve, reject) => {
        const s = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
        sockets.push(s);
        s.on('connect', () => resolve(s));
        s.on('connect_error', reject);
      });
    const ack = (s: Socket, event: string) => new Promise<{ ok: boolean }>((resolve) => s.emit(event, resolve));
    /** Resolves with the first `event` payload matching `wanted` (default: any). */
    const next = <T,>(s: Socket, event: string, wanted: (p: T) => boolean = () => true, ms = 3000) =>
      new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`no matching "${event}" within ${ms}ms`)), ms);
        const listener = (p: T) => {
          if (!wanted(p)) return;
          clearTimeout(t);
          s.off(event, listener);
          resolve(p);
        };
        s.on(event, listener);
      });

    it('only support staff may join the support room', async () => {
      expect((await ack(await connectAs(agent.token), REALTIME.ACTIONS.JOIN_SUPPORT)).ok).toBe(true);
      expect((await ack(await connectAs(owner.token), REALTIME.ACTIONS.JOIN_SUPPORT)).ok).toBe(true);
      expect((await ack(await connectAs(kitchen.token), REALTIME.ACTIONS.JOIN_SUPPORT)).ok).toBe(false);
      expect((await ack(await connectAs(c1.token), REALTIME.ACTIONS.JOIN_SUPPORT)).ok).toBe(false);
    });

    it('pushes new conversations and messages to staff, and replies (but never internal notes) to the customer', async () => {
      const staffSock = await connectAs(agent.token);
      await ack(staffSock, REALTIME.ACTIONS.JOIN_SUPPORT);
      const customerSock = await connectAs(c1.token);

      const newTicket = next<SupportTicketDTO>(staffSock, REALTIME.EVENTS.SUPPORT_TICKET, (p) => p.subject === 'Live conversation');
      const t = await open(c1, { subject: 'Live conversation' });
      expect((await newTicket).id).toBe(t.id);

      const staffGotReply = next<SupportMessageDTO>(customerSock, REALTIME.EVENTS.SUPPORT_MESSAGE, (m) => m.fromStaff);
      await say(agent, t.id, 'Live reply');
      expect((await staffGotReply).body).toBe('Live reply');

      // An internal note reaches staff but must never reach the customer's socket.
      const leaked: SupportMessageDTO[] = [];
      customerSock.on(REALTIME.EVENTS.SUPPORT_MESSAGE, (m: SupportMessageDTO) => leaked.push(m));
      const staffNote = next<SupportMessageDTO>(staffSock, REALTIME.EVENTS.SUPPORT_MESSAGE, (m) => m.isInternal && m.kind === 'TEXT');
      await say(agent, t.id, 'Secret staff note', true);
      expect((await staffNote).isInternal).toBe(true);
      await new Promise((r) => setTimeout(r, 400));
      expect(leaked.some((m) => m.body === 'Secret staff note')).toBe(false);
    });

    it('does not show one customer\'s conversation to another customer', async () => {
      const other = await connectAs(c2.token);
      const seen: unknown[] = [];
      other.on(REALTIME.EVENTS.SUPPORT_TICKET, (p) => seen.push(p));
      other.on(REALTIME.EVENTS.SUPPORT_MESSAGE, (p) => seen.push(p));
      const t = await open(c1, { subject: 'Not for customer two' });
      await say(agent, t.id, 'Reply for customer one only');
      await new Promise((r) => setTimeout(r, 400));
      expect(seen).toEqual([]);
    });
  });
});
