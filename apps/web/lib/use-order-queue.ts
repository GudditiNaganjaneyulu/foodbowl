'use client';

import * as React from 'react';
import { REALTIME, TERMINAL_STATUSES, type OrderDTO } from '@foodbowl/shared';
import { apiClient, ApiError } from './api-client';
import { useAuth } from './auth-context';
import { useSocket, useSocketEvent, useSocketRoom } from './socket';

/**
 * The restaurant's live order list. `active` is everything still in progress
 * (oldest first, the order to work through); `history` is delivered/cancelled
 * (newest first). Both stay current from the staff queue socket room, and
 * reload in full after a reconnect so nothing that happened while offline is missed.
 */
export function useOrderQueue(scope: 'active' | 'history') {
  const { user, hasPermission } = useAuth();
  const canView = Boolean(user) && hasPermission('orders.view');
  const { socket } = useSocket();
  const [orders, setOrders] = React.useState<OrderDTO[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const path = scope === 'active' ? '/api/v1/orders?limit=100' : '/api/v1/orders?status=DELIVERED,CANCELLED&limit=30';
      setOrders(await apiClient.get<OrderDTO[]>(path));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load orders');
    }
  }, [scope]);

  React.useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  React.useEffect(() => {
    if (!socket || !canView) return;
    socket.on('connect', load);
    return () => {
      socket.off('connect', load);
    };
  }, [socket, canView, load]);

  useSocketRoom(REALTIME.ACTIONS.JOIN_QUEUE, canView ? undefined : null);

  const upsert = React.useCallback(
    (order: OrderDTO) => {
      setOrders((prev) => {
        if (!prev) return prev;
        const belongs = TERMINAL_STATUSES.includes(order.status) === (scope === 'history');
        const rest = prev.filter((o) => o.id !== order.id);
        if (!belongs) return rest;
        const merged = [...rest, order];
        return merged.sort((a, b) =>
          scope === 'active' ? a.placedAt.localeCompare(b.placedAt) : b.placedAt.localeCompare(a.placedAt),
        );
      });
    },
    [scope],
  );
  useSocketEvent<OrderDTO>(REALTIME.EVENTS.ORDER_PLACED, upsert);
  useSocketEvent<OrderDTO>(REALTIME.EVENTS.ORDER_UPDATED, upsert);

  return { orders, error, upsert, reload: load, canView };
}
