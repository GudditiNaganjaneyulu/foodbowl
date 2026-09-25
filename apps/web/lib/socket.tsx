'use client';

import * as React from 'react';
import { io, type Socket } from 'socket.io-client';
import { REALTIME } from '@foodbowl/shared';
import { useAuth } from './auth-context';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = React.createContext<SocketContextValue>({ socket: null, connected: false });

/**
 * One Socket.IO connection to the API's `/orders` namespace for the whole
 * app, present only while someone is logged in. It is keyed on the USER (not
 * the access token), so the token renewing every ~15 minutes doesn't tear the
 * connection down; the current token is read fresh on every (re)connect.
 */
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user, accessToken, refreshSession } = useAuth();
  const userId = user?.id ?? null;
  const [socket, setSocket] = React.useState<Socket | null>(null);
  const [connected, setConnected] = React.useState(false);

  const tokenRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  React.useEffect(() => {
    if (!userId) return;

    const s = io(`${SOCKET_URL}${REALTIME.NAMESPACE}`, {
      auth: (cb) => cb({ token: tokenRef.current }),
      withCredentials: true,
    });

    let retries = 0;
    s.on('connect', () => {
      retries = 0;
      setConnected(true);
    });
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', async (err) => {
      setConnected(false);
      // The server rejected an expired token (socket.io won't retry that on
      // its own): renew the session and try again a few times.
      if (err.message === 'unauthorized' && retries < 3) {
        retries += 1;
        if (await refreshSession()) s.connect();
      }
    });

    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [userId, refreshSession]);

  const value = React.useMemo(() => ({ socket, connected }), [socket, connected]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export const useSocket = () => React.useContext(SocketContext);

/** Subscribe to a server event for as long as the component is mounted. */
export function useSocketEvent<T>(event: string, handler: (payload: T) => void) {
  const { socket } = useSocket();
  const handlerRef = React.useRef(handler);
  React.useEffect(() => {
    handlerRef.current = handler;
  });

  React.useEffect(() => {
    if (!socket) return;
    const listener = (payload: T) => handlerRef.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}

/**
 * Join a server room (e.g. the staff queue, or one order) and REJOIN after
 * every reconnect — rooms are per-connection on the server, so a dropped
 * connection silently loses them. Pass `arg = null` to stay out.
 */
export function useSocketRoom(action: string, arg?: string | null) {
  const { socket } = useSocket();
  React.useEffect(() => {
    if (!socket || arg === null) return;
    const join = () => socket.emit(action, ...(arg === undefined ? [] : [arg]), () => undefined);
    if (socket.connected) join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
      if (action === REALTIME.ACTIONS.JOIN_ORDER && arg) socket.emit(REALTIME.ACTIONS.LEAVE_ORDER, arg);
    };
  }, [socket, action, arg]);
}
