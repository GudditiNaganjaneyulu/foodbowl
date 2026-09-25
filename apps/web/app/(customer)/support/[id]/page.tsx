'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Package } from 'lucide-react';
import { SUPPORT_CATEGORY_LABELS } from '@foodbowl/shared';
import { Conversation } from '@/components/support/conversation';
import { SupportStatusBadge } from '@/components/support/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toaster';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useSupportTicket } from '@/lib/use-support';

export default function SupportConversationPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const { ticket, error, addMessage, reload } = useSupportTicket(id);
  const [resolving, setResolving] = React.useState(false);

  if (isLoading || (user && !ticket && !error)) {
    return (
      <div className="container flex max-w-2xl flex-col gap-3 py-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="container flex flex-col items-center gap-3 py-24 text-center text-muted-foreground">
        <p>Log in to see this conversation.</p>
        <Button asChild>
          <Link href={`/login?next=/support/${id}`}>Log in</Link>
        </Button>
      </div>
    );
  }
  if (error || !ticket) {
    return (
      <div className="container flex flex-col items-center gap-3 py-24 text-center text-muted-foreground">
        <p>{error?.statusCode === 404 ? "We couldn't find that conversation." : (error?.message ?? 'Something went wrong.')}</p>
        <Button asChild variant="outline">
          <Link href="/support">Back to help &amp; support</Link>
        </Button>
      </div>
    );
  }

  async function resolve() {
    setResolving(true);
    try {
      await apiClient.patch(`/api/v1/support/tickets/${id}/status`, { status: 'RESOLVED' });
      toast({ title: 'Marked as resolved', description: 'Reply any time to reopen it.', variant: 'success' });
      await reload();
    } catch (err) {
      toast({ title: "Couldn't update", description: err instanceof ApiError ? err.message : undefined, variant: 'error' });
    } finally {
      setResolving(false);
    }
  }

  return (
    // Fills the space between the top bar and the bottom tab bar on phones, so the
    // composer sits at the bottom of the screen and only the messages scroll.
    <div className="mx-auto flex h-[calc(100dvh-3.5rem-4rem)] max-w-2xl flex-col md:h-[calc(100dvh-12rem)] md:min-h-[32rem] md:py-4">
      <div className="flex flex-col gap-2 border-b border-border bg-background px-3 py-3 sm:px-4 md:rounded-t-xl md:border md:border-b-0">
        <Link href="/support" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> All requests
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold sm:text-lg" data-testid="ticket-subject">{ticket.subject}</h1>
            <p className="text-xs text-muted-foreground">
              {ticket.number} · {SUPPORT_CATEGORY_LABELS[ticket.category]}
            </p>
          </div>
          <SupportStatusBadge status={ticket.status} viewer="customer" className="shrink-0 whitespace-nowrap" />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {ticket.assignedTo ? <span>{ticket.assignedTo.name} is helping you</span> : <span>Waiting for someone to pick this up</span>}
          {ticket.order && (
            <Link href={`/orders/${ticket.order.id}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              <Package className="h-3 w-3" /> Order {ticket.order.orderNumber}
            </Link>
          )}
          {ticket.status !== 'RESOLVED' && (
            <button type="button" onClick={resolve} disabled={resolving} className="inline-flex items-center gap-1 font-medium text-success hover:underline" data-testid="resolve">
              <CheckCircle2 className="h-3 w-3" /> {resolving ? 'Updating…' : 'Mark as resolved'}
            </button>
          )}
        </div>
      </div>

      <Conversation ticket={ticket} viewer="customer" currentUserId={user.id} onSent={addMessage} className="border-border md:rounded-b-xl md:border" />
    </div>
  );
}
