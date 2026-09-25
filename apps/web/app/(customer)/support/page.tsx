'use client';

import Link from 'next/link';
import { ChevronRight, LifeBuoy, Plus } from 'lucide-react';
import { SUPPORT_CATEGORY_LABELS } from '@foodbowl/shared';
import { SupportStatusBadge } from '@/components/support/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth-context';
import { timeAgo } from '@/lib/format';
import { useMySupportTickets } from '@/lib/use-support';
import { cn } from '@/lib/utils';

export default function SupportPage() {
  const { user, isLoading } = useAuth();
  const { tickets, error } = useMySupportTickets();

  if (isLoading) return <div className="container py-24" />;

  if (!user) {
    return (
      <div className="container flex flex-col items-center gap-3 py-24 text-center text-muted-foreground">
        <LifeBuoy className="h-10 w-10" />
        <p>Log in to get help with an order or your account.</p>
        <Button asChild className="mt-2">
          <Link href="/login?next=/support">Log in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container flex max-w-2xl flex-col gap-5 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Help &amp; support</h1>
          <p className="text-sm text-muted-foreground">Message the restaurant — a real person replies here.</p>
        </div>
        <Button asChild data-testid="new-request">
          <Link href="/support/new">
            <Plus className="h-4 w-4" /> New request
          </Link>
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!tickets && !error && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {tickets?.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center text-muted-foreground">
          <LifeBuoy className="h-9 w-9" />
          <p className="max-w-xs text-sm">Something wrong with an order, or a question? Start a request and we'll get back to you.</p>
          <Button asChild variant="outline">
            <Link href="/support/new">Contact the restaurant</Link>
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {tickets?.map((t) => (
          <Link key={t.id} href={`/support/${t.id}`} data-testid="ticket-row" data-subject={t.subject}>
            <Card className={cn('transition-colors hover:bg-accent/40', t.unread && 'border-primary/50')}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('truncate font-medium', t.unread && 'font-semibold')}>{t.subject}</span>
                    {t.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="New reply" />}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {t.lastMessage ? `${t.lastMessage.fromStaff ? `${t.lastMessage.senderName}: ` : 'You: '}${t.lastMessage.body}` : 'No messages yet'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <SupportStatusBadge status={t.status} viewer="customer" />
                    <span>{t.number}</span>
                    <span>· {SUPPORT_CATEGORY_LABELS[t.category]}</span>
                    {t.order && <span>· Order {t.order.orderNumber}</span>}
                    <span>· {timeAgo(t.lastMessageAt)}</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
