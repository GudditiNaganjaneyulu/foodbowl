'use client';

import * as React from 'react';
import {
  REALTIME,
  type SupportMessageDTO,
  type SupportSummaryDTO,
  type SupportTicketDTO,
  type SupportTicketDetailDTO,
} from '@foodbowl/shared';
import { apiClient, ApiError } from './api-client';
import { useAuth } from './auth-context';
import { useSocket, useSocketEvent, useSocketRoom } from './socket';

/**
 * One conversation, kept live: new messages appear as they are sent, status /
 * assignment changes update the header, and a reconnect re-reads everything so
 * nothing sent while offline is missed. Opening it (the GET) marks it read.
 */
export function useSupportTicket(id: string) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [ticket, setTicket] = React.useState<SupportTicketDetailDTO | null>(null);
  const [error, setError] = React.useState<ApiError | null>(null);

  const load = React.useCallback(async () => {
    try {
      setTicket(await apiClient.get<SupportTicketDetailDTO>(`/api/v1/support/tickets/${id}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Could not load the conversation', 0));
    }
  }, [id]);

  React.useEffect(() => {
    if (user) void load();
  }, [user, load]);

  React.useEffect(() => {
    if (!socket) return;
    socket.on('connect', load);
    return () => {
      socket.off('connect', load);
    };
  }, [socket, load]);

  useSocketEvent<SupportMessageDTO>(REALTIME.EVENTS.SUPPORT_MESSAGE, (message) => {
    if (message.ticketId !== id) return;
    setTicket((prev) => {
      if (!prev || prev.messages.some((m) => m.id === message.id)) return prev;
      return { ...prev, messages: [...prev.messages, message] };
    });
    // Something arrived from the other side while looking at it: opening = reading.
    if (message.sender?.id !== user?.id) void load();
  });
  useSocketEvent<SupportTicketDTO>(REALTIME.EVENTS.SUPPORT_TICKET, (updated) => {
    if (updated.id !== id) return;
    setTicket((prev) => (prev ? { ...updated, messages: prev.messages, unread: false } : prev));
  });

  const addMessage = React.useCallback((message: SupportMessageDTO) => {
    setTicket((prev) => (prev && !prev.messages.some((m) => m.id === message.id) ? { ...prev, messages: [...prev.messages, message] } : prev));
  }, []);

  return { ticket, error, reload: load, addMessage, setTicket };
}

/** The customer's own conversations, live. */
export function useMySupportTickets() {
  const { user } = useAuth();
  const [tickets, setTickets] = React.useState<SupportTicketDTO[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setTickets(await apiClient.get<SupportTicketDTO[]>('/api/v1/support/tickets/me'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load your requests');
    }
  }, []);
  React.useEffect(() => {
    if (user) void load();
  }, [user, load]);

  useSocketEvent<SupportTicketDTO>(REALTIME.EVENTS.SUPPORT_TICKET, (t) =>
    setTickets((prev) => (prev ? [t, ...prev.filter((x) => x.id !== t.id)].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)) : prev)),
  );
  return { tickets, error, reload: load };
}

/**
 * Staff side: the inbox for one filter, plus the counters. Joins the staff
 * support room, upserts conversations as they change, and reloads after a
 * reconnect. `view` decides which conversations belong in the list.
 */
export function useSupportInbox(view: 'open' | 'mine' | 'unassigned' | 'resolved', search: string) {
  const { user, hasPermission } = useAuth();
  const { socket } = useSocket();
  const canView = Boolean(user) && hasPermission('support.manage');
  const [tickets, setTickets] = React.useState<SupportTicketDTO[] | null>(null);
  const [summary, setSummary] = React.useState<SupportSummaryDTO | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const q = search.trim() ? `&q=${encodeURIComponent(search.trim())}` : '';
      const [list, counters] = await Promise.all([
        apiClient.get<SupportTicketDTO[]>(`/api/v1/support/tickets?view=${view}${q}`),
        apiClient.get<SupportSummaryDTO>('/api/v1/support/summary'),
      ]);
      setTickets(list);
      setSummary(counters);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load conversations');
    }
  }, [view, search]);

  React.useEffect(() => {
    if (!canView) return;
    const timer = setTimeout(() => void load(), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [canView, load, search]);

  React.useEffect(() => {
    if (!socket || !canView) return;
    socket.on('connect', load);
    return () => {
      socket.off('connect', load);
    };
  }, [socket, canView, load]);

  useSocketRoom(REALTIME.ACTIONS.JOIN_SUPPORT, canView ? undefined : null);

  // Anything that changes a conversation can change the counters and which list it belongs to.
  useSocketEvent<SupportTicketDTO>(REALTIME.EVENTS.SUPPORT_TICKET, (t) => {
    const mine = t.assignedTo?.id === user?.id;
    const belongs =
      view === 'resolved' ? t.status === 'RESOLVED'
      : t.status === 'RESOLVED' ? false
      : view === 'mine' ? mine
      : view === 'unassigned' ? t.assignedTo === null
      : true;
    setTickets((prev) => {
      if (!prev) return prev;
      const rest = prev.filter((x) => x.id !== t.id);
      return (belongs ? [t, ...rest] : rest).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    });
    apiClient.get<SupportSummaryDTO>('/api/v1/support/summary').then(setSummary).catch(() => undefined);
  });

  return { tickets, summary, error, canView, reload: load };
}

/** Just the counters (for the sidebar badge), live. */
export function useSupportSummary() {
  const { user, hasPermission } = useAuth();
  const canView = Boolean(user) && hasPermission('support.manage');
  const [summary, setSummary] = React.useState<SupportSummaryDTO | null>(null);
  const load = React.useCallback(() => {
    apiClient.get<SupportSummaryDTO>('/api/v1/support/summary').then(setSummary).catch(() => undefined);
  }, []);
  React.useEffect(() => {
    if (canView) load();
  }, [canView, load]);
  useSocketRoom(REALTIME.ACTIONS.JOIN_SUPPORT, canView ? undefined : null);
  useSocketEvent<SupportTicketDTO>(REALTIME.EVENTS.SUPPORT_TICKET, load);
  return summary;
}
