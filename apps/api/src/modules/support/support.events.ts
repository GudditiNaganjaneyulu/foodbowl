import { REALTIME, type SupportMessageDTO, type SupportTicketDTO } from '@foodbowl/shared';
import { emitToRooms } from '../../lib/realtime';
import { logger } from '../../lib/logger';

/**
 * Live pushes for support. The two audiences get different payloads:
 * staff (everyone in the support room) see everything including internal
 * notes; the customer only ever gets their own conversation, without notes.
 * Best-effort and never throws — the change is already saved.
 */
export function publishTicket(requesterId: string, forStaff: SupportTicketDTO, forRequester: SupportTicketDTO) {
  try {
    emitToRooms([REALTIME.rooms.support], REALTIME.EVENTS.SUPPORT_TICKET, forStaff);
    emitToRooms([REALTIME.rooms.user(requesterId)], REALTIME.EVENTS.SUPPORT_TICKET, forRequester);
  } catch (err) {
    logger.warn({ err }, 'failed to publish support ticket event');
  }
}

export function publishMessage(requesterId: string, message: SupportMessageDTO) {
  try {
    emitToRooms([REALTIME.rooms.support], REALTIME.EVENTS.SUPPORT_MESSAGE, message);
    if (!message.isInternal) emitToRooms([REALTIME.rooms.user(requesterId)], REALTIME.EVENTS.SUPPORT_MESSAGE, message);
  } catch (err) {
    logger.warn({ err }, 'failed to publish support message event');
  }
}
