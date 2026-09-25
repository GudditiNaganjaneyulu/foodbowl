import type { Notification, NotificationChannel } from '@prisma/client';
import { PERMISSIONS, REALTIME, ROLES, type NotificationDTO } from '@foodbowl/shared';
import { env } from '../../config/env';
import { prisma } from '../../db/prisma';
import { getMailer } from '../../lib/mailer';
import { logger } from '../../lib/logger';
import { emitToRooms } from '../../lib/realtime';
import { getEffectivePermissions } from '../../lib/rbac';

export interface NotificationPayload {
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

/** BUILD_PROMPT.md §9 — one implementation per delivery channel. */
export interface NotificationProvider {
  readonly channel: NotificationChannel;
  send(userId: string, payload: NotificationPayload): Promise<void>;
}

export function toNotificationDTO(n: Notification): NotificationDTO {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    isRead: n.isRead,
    metadata: (n.metadata ?? {}) as Record<string, unknown>,
    createdAt: n.createdAt.toISOString(),
  };
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Stored in the Notification table and pushed live to the user's socket room. */
export class InAppNotificationProvider implements NotificationProvider {
  readonly channel = 'IN_APP' as const;

  async send(userId: string, payload: NotificationPayload) {
    const row = await prisma.notification.create({
      data: {
        userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        channel: 'IN_APP',
        metadata: (payload.metadata ?? {}) as object,
      },
    });
    emitToRooms([REALTIME.rooms.user(userId)], REALTIME.EVENTS.NOTIFICATION, toNotificationDTO(row));
  }
}

/** Off unless EMAIL_NOTIFICATIONS_ENABLED=true (see config/env.ts). */
export class EmailNotificationProvider implements NotificationProvider {
  readonly channel = 'EMAIL' as const;

  async send(userId: string, payload: NotificationPayload) {
    if (!env.EMAIL_NOTIFICATIONS_ENABLED) return;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (!user) return;
    await getMailer().sendMail({
      from: env.SMTP_FROM,
      to: user.email,
      subject: payload.title,
      text: `Hi ${user.name},\n\n${payload.body}\n\n— FoodBowl`,
      html: `<p>Hi ${escapeHtml(user.name)},</p><p>${escapeHtml(payload.body)}</p><p>— FoodBowl</p>`,
    });
  }
}

/** Wired but deliberately a no-op, so adding real push later is purely additive. */
export class PushStubNotificationProvider implements NotificationProvider {
  readonly channel = 'PUSH_STUB' as const;

  async send(userId: string, payload: NotificationPayload) {
    logger.debug({ userId, type: payload.type }, 'push notification (stub, not sent)');
  }
}

const providers: NotificationProvider[] = [
  new InAppNotificationProvider(),
  new EmailNotificationProvider(),
  new PushStubNotificationProvider(),
];

// Notifications are sent after the triggering request has already succeeded,
// so they run in the background and can never fail or slow it down. Tracking
// the promises lets tests (and shutdown) wait for them to finish.
const pending = new Set<Promise<unknown>>();
export const settleNotifications = () => Promise.allSettled([...pending]);

async function fanOut(userIds: string[], payload: NotificationPayload) {
  const recipients = [...new Set(userIds)];
  await Promise.all(
    recipients.flatMap((userId) =>
      providers.map(async (provider) => {
        try {
          await provider.send(userId, payload);
        } catch (err) {
          logger.warn({ err, userId, channel: provider.channel, type: payload.type }, 'notification failed');
        }
      }),
    ),
  );
}

/**
 * Fire-and-forget fan-out to every configured channel. `recipients` may be a
 * promise (e.g. "everyone who can see the queue"), so that lookup is part of
 * the tracked background task too. Never throws.
 */
export function notify(recipients: string[] | Promise<string[]>, payload: NotificationPayload): void {
  const task: Promise<void> = (async () => {
    try {
      const userIds = await recipients;
      if (userIds.length > 0) await fanOut(userIds, payload);
    } catch (err) {
      logger.warn({ err, type: payload.type }, 'failed to send notifications');
    }
  })().finally(() => pending.delete(task));
  pending.add(task);
}

/** Active users who effectively hold a permission (role default or per-user grant). */
export async function usersWithPermission(permission: string): Promise<string[]> {
  const candidates = await prisma.user.findMany({
    where: { isActive: true, role: { key: { in: [ROLES.RESTAURANT_OWNER, ROLES.STAFF] } } },
    select: { id: true },
  });
  const held = await Promise.all(
    candidates.map(async (c) => (await getEffectivePermissions(c.id)).has(permission as never)),
  );
  return candidates.filter((_, i) => held[i]).map((c) => c.id);
}

export const restaurantOrderStaff = () => usersWithPermission(PERMISSIONS.ORDERS_VIEW);
export const restaurantDispatchers = () => usersWithPermission(PERMISSIONS.DELIVERY_ASSIGN);

// ── Reading and marking ───────────────────────────────────────────────────

export async function listMine(userId: string, opts: { unreadOnly?: boolean; limit?: number }) {
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, channel: 'IN_APP', ...(opts.unreadOnly && { isRead: false }) },
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 30,
    }),
    prisma.notification.count({ where: { userId, channel: 'IN_APP', isRead: false } }),
  ]);
  return { items: rows.map(toNotificationDTO), unreadCount };
}

export async function markRead(userId: string, id: string): Promise<NotificationDTO | null> {
  const { count } = await prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
  if (count === 0) return null;
  return toNotificationDTO(await prisma.notification.findUniqueOrThrow({ where: { id } }));
}

export async function markAllRead(userId: string): Promise<number> {
  const { count } = await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
  return count;
}
