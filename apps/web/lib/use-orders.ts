'use client';

import * as React from 'react';
import { REALTIME, type OrderDTO } from '@foodbowl/shared';
import { apiClient, ApiError } from './api-client';
import { useSocketEvent, useSocketRoom } from './socket';
import { useAuth } from './auth-context';

/** A single order, kept current by live updates while the page is open. */
export function useOrder(orderId: string) {
  const { user } = useAuth();
  const [order, setOrder] = React.useState<OrderDTO | null>(null);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      setOrder(await apiClient.get<OrderDTO>(`/api/v1/orders/${orderId}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Failed to load the order', 0));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  React.useEffect(() => {
    if (user) void load();
  }, [user, load]);

  useSocketRoom(REALTIME.ACTIONS.JOIN_ORDER, user ? orderId : null);
  useSocketEvent<OrderDTO>(REALTIME.EVENTS.ORDER_UPDATED, (updated) => {
    if (updated.id === orderId) setOrder(updated);
  });

  return { order, error, loading, reload: load, setOrder };
}

/** The signed-in customer's orders, newest first, updating as their orders change. */
export function useMyOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = React.useState<OrderDTO[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user) return;
    apiClient
      .get<OrderDTO[]>('/api/v1/orders/me')
      .then(setOrders)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load your orders'));
  }, [user]);

  const upsert = React.useCallback((order: OrderDTO) => {
    setOrders((prev) => {
      if (!prev) return prev;
      return prev.some((o) => o.id === order.id) ? prev.map((o) => (o.id === order.id ? order : o)) : [order, ...prev];
    });
  }, []);
  // These arrive in the user's private room, so no explicit join is needed.
  useSocketEvent<OrderDTO>(REALTIME.EVENTS.ORDER_UPDATED, upsert);
  useSocketEvent<OrderDTO>(REALTIME.EVENTS.ORDER_PLACED, upsert);

  return { orders, error };
}
