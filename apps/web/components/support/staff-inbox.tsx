'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, Package, Phone, Radio, Search, UserCheck, X } from 'lucide-react';
import {
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_STATUSES,
  type SupportAgentDTO,
  type SupportStatus,
  type SupportTicketDTO,
  type SupportTicketDetailDTO,
} from '@foodbowl/shared';
import { Conversation } from '@/components/support/conversation';
import { SupportStatusBadge } from '@/components/support/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toaster';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { timeAgo } from '@/lib/format';
import { useSocket } from '@/lib/socket';
import { initials, supportStatusLabel } from '@/lib/support';
import { useSupportInbox, useSupportTicket } from '@/lib/use-support';
import { cn } from '@/lib/utils';

type View = 'open' | 'mine' | 'unassigned' | 'resolved';

/**
 * The support team's inbox. Desktop: conversation list beside the open
 * conversation. Phone: the list, and tapping a conversation replaces it (with
 * a back button) — the same screen, arranged for the space available.
 */
export function StaffInbox({ ordersHref }: { ordersHref: string | null }) {
  const { connected } = useSocket();
  const [view, setView] = React.useState<View>('open');
  const [search, setSearch] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const { tickets, summary, error, canView } = useSupportInbox(view, search);

  // Deep link from a notification: ?ticket=<id>
  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('ticket');
    if (id) setSelectedId(id);
  }, []);
  const select = (id: string | null) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('ticket', id);
    else url.searchParams.delete('ticket');
    window.history.replaceState(null, '', url);
  };

  const tabs: { id: View; label: string; count?: number }[] = [
    { id: 'open', label: 'Open', count: summary ? summary.open + summary.waitingOnCustomer : undefined },
    { id: 'mine', label: 'Mine', count: summary?.mine },
    { id: 'unassigned', label: 'Unassigned', count: summary?.unassigned },
    { id: 'resolved', label: 'Resolved' },
  ];

  if (!canView) return null;

  return (
    <div className="flex h-[calc(100dvh-4rem-2rem)] min-h-[28rem] flex-col md:h-[calc(100dvh-4rem-3rem)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Customer support</h2>
          <p className="hidden text-sm text-muted-foreground sm:block">Answer customers and assign conversations to the right person.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Radio className={cn('h-3.5 w-3.5', connected && 'text-success')} /> {connected ? 'Live' : 'Connecting…'}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-background">
        {/* List pane: full width on phones (hidden once a conversation is open), fixed width beside it on desktop. */}
        <section className={cn('flex w-full min-w-0 flex-col border-border md:w-[22rem] md:shrink-0 md:border-r', selectedId && 'hidden md:flex')} aria-label="Conversations">
          <div className="flex flex-col gap-2 border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Search conversations" placeholder="Search subject, customer, reference…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-9" />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-none" role="tablist">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={view === t.id}
                  onClick={() => setView(t.id)}
                  data-testid={`tab-${t.id}`}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                    view === t.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.label}
                  {t.count !== undefined && t.count > 0 && (
                    <span className={cn('rounded-full px-1.5 text-xs', view === t.id ? 'bg-primary-foreground/20' : 'bg-muted')}>{t.count}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto" data-testid="inbox-list">
            {error && <p className="p-4 text-sm text-destructive">{error}</p>}
            {!tickets && !error && (
              <div className="flex flex-col gap-2 p-3">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            )}
            {tickets?.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{search ? 'No conversations match your search.' : view === 'resolved' ? 'Nothing resolved yet.' : 'All caught up — no conversations here.'}</p>}
            {tickets?.map((t) => (
              <TicketRow key={t.id} ticket={t} selected={t.id === selectedId} onSelect={() => select(t.id)} />
            ))}
          </div>
        </section>

        {/* Conversation pane */}
        <section className={cn('min-w-0 flex-1 flex-col', selectedId ? 'flex' : 'hidden md:flex')} aria-label="Conversation">
          {selectedId ? (
            <ConversationPane key={selectedId} id={selectedId} ordersHref={ordersHref} onBack={() => select(null)} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
              <Mail className="h-9 w-9" />
              <p className="text-sm">Choose a conversation to read and reply.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function TicketRow({ ticket: t, selected, onSelect }: { ticket: SupportTicketDTO; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid="inbox-row"
      data-subject={t.subject}
      className={cn('flex w-full flex-col gap-1 border-b border-border px-3 py-3 text-left transition-colors hover:bg-accent/40', selected && 'bg-accent/60', t.unread && 'bg-primary/5')}
    >
      <span className="flex items-start justify-between gap-2">
        <span className={cn('min-w-0 truncate text-sm', t.unread ? 'font-semibold' : 'font-medium')}>{t.subject}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          {t.unread && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />}
          {timeAgo(t.lastMessageAt)}
        </span>
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {t.requester.name} · {t.lastMessage ? `${t.lastMessage.fromStaff ? 'You/team: ' : ''}${t.lastMessage.body}` : 'No messages'}
      </span>
      <span className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <SupportStatusBadge status={t.status} viewer="staff" className="px-2 py-0 text-[10px]" />
        {t.order && <Badge variant="outline" className="px-2 py-0 text-[10px]">Order {t.order.orderNumber}</Badge>}
        <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
          {t.assignedTo ? (
            <>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary" title={`Assigned to ${t.assignedTo.name}`}>
                {initials(t.assignedTo.name)}
              </span>
            </>
          ) : (
            <span className="rounded-full border border-dashed border-border px-1.5 py-0.5">Unassigned</span>
          )}
        </span>
      </span>
    </button>
  );
}

function ConversationPane({ id, ordersHref, onBack }: { id: string; ordersHref: string | null; onBack: () => void }) {
  const { user, hasPermission } = useAuth();
  const { toast } = useToast();
  const { ticket, error, addMessage, setTicket } = useSupportTicket(id);
  const [agents, setAgents] = React.useState<SupportAgentDTO[]>([]);
  const [busy, setBusy] = React.useState(false);
  // Phones: the details/controls collapse so the messages get the screen; desktop always shows them.
  const [showControls, setShowControls] = React.useState(false);

  React.useEffect(() => {
    apiClient.get<SupportAgentDTO[]>('/api/v1/support/agents').then(setAgents).catch(() => undefined);
  }, [ticket?.assignedTo?.id]);

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
        <p className="text-sm">{error.statusCode === 404 ? 'That conversation no longer exists.' : error.message}</p>
        <Button variant="outline" onClick={onBack}>Back to the list</Button>
      </div>
    );
  }
  if (!ticket || !user) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const change = async (call: () => Promise<SupportTicketDTO>, done: string) => {
    setBusy(true);
    try {
      const updated = await call();
      setTicket((prev) => (prev ? ({ ...prev, ...updated, messages: prev.messages } as SupportTicketDetailDTO) : prev));
      toast({ title: done, variant: 'success' });
    } catch (err) {
      toast({ title: "That didn't work", description: err instanceof ApiError ? err.message : undefined, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const setStatus = (status: SupportStatus) =>
    change(() => apiClient.patch<SupportTicketDTO>(`/api/v1/support/tickets/${id}/status`, { status }), `Marked ${supportStatusLabel(status, 'staff').toLowerCase()}`);
  const assign = (assigneeId: string | null) =>
    change(() => apiClient.patch<SupportTicketDTO>(`/api/v1/support/tickets/${id}/assign`, { assigneeId }), assigneeId ? 'Assigned' : 'Unassigned');

  return (
    <>
      <header className="flex flex-col gap-3 border-b border-border p-3 sm:px-4">
        <div className="flex items-start gap-2">
          <Button variant="ghost" size="icon" className="-ml-2 h-8 w-8 shrink-0 md:hidden" onClick={onBack} aria-label="Back to conversations" data-testid="inbox-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold" data-testid="ticket-subject">{ticket.subject}</h3>
            <p className="text-xs text-muted-foreground">
              {ticket.number} · {SUPPORT_CATEGORY_LABELS[ticket.category]}
            </p>
          </div>
          <SupportStatusBadge status={ticket.status} viewer="staff" className="shrink-0" />
        </div>

        <div className="flex items-center justify-between gap-2 md:hidden">
          <span className="truncate text-xs">
            <span className="font-medium">{ticket.requester.name}</span>
            <span className="text-muted-foreground"> · {ticket.assignedTo ? `assigned to ${ticket.assignedTo.name}` : 'unassigned'}</span>
          </span>
          <button
            type="button"
            onClick={() => setShowControls((v) => !v)}
            aria-expanded={showControls}
            className="shrink-0 text-xs font-medium text-primary hover:underline"
            data-testid="toggle-details"
          >
            {showControls ? 'Hide details' : 'Details & assign'}
          </button>
        </div>

        <div className={cn('flex-col gap-3', showControls ? 'flex' : 'hidden md:flex')} data-testid="ticket-controls">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{ticket.requester.name}</span>
          <a href={`mailto:${ticket.requester.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
            <Mail className="h-3 w-3" /> {ticket.requester.email}
          </a>
          {ticket.requester.phone && (
            <a href={`tel:${ticket.requester.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
              <Phone className="h-3 w-3" /> {ticket.requester.phone}
            </a>
          )}
          {ticket.order && ordersHref && hasPermission('orders.view') && (
            <Link href={`${ordersHref}?order=${ticket.order.id}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              <Package className="h-3 w-3" /> Order {ticket.order.orderNumber}
            </Link>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Select aria-label="Status" value={ticket.status} disabled={busy} onChange={(e) => setStatus(e.target.value as SupportStatus)} className="h-9 sm:w-auto" data-testid="status-select">
            {SUPPORT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {supportStatusLabel(s, 'staff')}
              </option>
            ))}
          </Select>
          <Select aria-label="Assigned to" value={ticket.assignedTo?.id ?? ''} disabled={busy} onChange={(e) => assign(e.target.value || null)} className="h-9 sm:w-auto" data-testid="assign-select">
            <option value="">Unassigned</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.id === user.id ? ' (me)' : ''} · {a.openAssigned} open
              </option>
            ))}
          </Select>
          {ticket.assignedTo?.id !== user.id && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => assign(user.id)} className="col-span-2 sm:col-span-1" data-testid="assign-me">
              <UserCheck className="h-3.5 w-3.5" /> Assign to me
            </Button>
          )}
          {ticket.status !== 'RESOLVED' && (
            <Button size="sm" disabled={busy} onClick={() => setStatus('RESOLVED')} className="col-span-2 sm:col-span-1 sm:ml-auto" data-testid="resolve">
              Mark resolved
            </Button>
          )}
        </div>
        </div>
      </header>

      <Conversation ticket={ticket} viewer="staff" currentUserId={user.id} onSent={addMessage} />
    </>
  );
}
