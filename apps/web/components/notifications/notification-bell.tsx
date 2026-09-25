'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { REALTIME, type NotificationDTO, type NotificationListDTO } from '@foodbowl/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/toaster';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { timeAgo } from '@/lib/format';
import { useSocketEvent } from '@/lib/socket';
import { cn } from '@/lib/utils';

/** Where clicking a notification should take this user. */
function targetFor(role: string, n: NotificationDTO): string | null {
  const orderId = typeof n.metadata.orderId === 'string' ? n.metadata.orderId : null;
  if (!orderId) return null;
  switch (role) {
    case 'restaurant_owner':
      return `/admin/orders?order=${orderId}`;
    case 'staff':
      return `/staff?order=${orderId}`;
    case 'delivery_partner':
      return '/delivery';
    default:
      return `/orders/${orderId}`;
  }
}

/**
 * Bell with an unread badge. New notifications arrive live over the socket
 * (also surfaced as a toast) so nobody has to refresh to notice an order.
 */
export function NotificationBell() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = React.useState<NotificationDTO[]>([]);
  const [unread, setUnread] = React.useState(0);

  const load = React.useCallback(async () => {
    try {
      const list = await apiClient.get<NotificationListDTO>('/api/v1/notifications/me?limit=20');
      setItems(list.items);
      setUnread(list.unreadCount);
    } catch {
      // The bell is non-essential; stay quiet if it can't load.
    }
  }, []);

  React.useEffect(() => {
    if (user) void load();
    else {
      setItems([]);
      setUnread(0);
    }
  }, [user, load]);

  useSocketEvent<NotificationDTO>(REALTIME.EVENTS.NOTIFICATION, (n) => {
    setItems((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, 20));
    setUnread((c) => c + 1);
    toast({ title: n.title, description: n.body });
  });

  if (!user) return null;

  async function open(n: NotificationDTO) {
    if (!n.isRead) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setUnread((c) => Math.max(0, c - 1));
      apiClient.patch(`/api/v1/notifications/${n.id}/read`).catch(() => undefined);
    }
    const target = targetFor(user!.role, n);
    if (target) router.push(target);
  }

  async function markAll() {
    setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
    setUnread(0);
    await apiClient.post('/api/v1/notifications/read-all').catch(() => undefined);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Bell className="h-[1.15rem] w-[1.15rem]" />
          {unread > 0 && (
            <Badge className="absolute -right-1 -top-1 h-4.5 min-w-4.5 justify-center px-1 text-[10px] leading-none">
              {unread > 99 ? '99+' : unread}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <DropdownMenuLabel className="p-0 text-sm">Notifications</DropdownMenuLabel>
          {unread > 0 && (
            <button type="button" onClick={markAll} className="text-xs font-medium text-primary hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">You're all caught up.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => open(n)}
                className={cn(
                  'flex w-full flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left last:border-0 hover:bg-accent',
                  !n.isRead && 'bg-primary/5',
                )}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className={cn('text-sm leading-snug', !n.isRead && 'font-semibold')}>{n.title}</span>
                  {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
                <span className="text-[11px] text-muted-foreground/80">{timeAgo(n.createdAt)}</span>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
