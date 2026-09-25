import type { Server } from 'socket.io';
import { REALTIME } from '@foodbowl/shared';

let io: Server | null = null;

export function setRealtimeServer(server: Server | null) {
  io = server;
}

/**
 * Best-effort push to Socket.IO rooms. A no-op when the socket server isn't
 * attached (scripts, tests), and never throws: realtime is an enhancement on
 * top of state that is already committed to the database, so a failed push
 * must not fail the request that caused it. Passing several rooms delivers
 * once per socket even when it is in more than one of them.
 */
export function emitToRooms(rooms: string[], event: string, payload: unknown) {
  if (!io || rooms.length === 0) return;
  io.of(REALTIME.NAMESPACE).to(rooms).emit(event, payload);
}
