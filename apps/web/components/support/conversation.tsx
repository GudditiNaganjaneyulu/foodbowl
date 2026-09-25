'use client';

import * as React from 'react';
import { Lock, Send } from 'lucide-react';
import type { SupportMessageDTO, SupportTicketDetailDTO } from '@foodbowl/shared';
import { MAX_MESSAGE_LENGTH } from '@foodbowl/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toaster';
import { apiClient, ApiError } from '@/lib/api-client';
import { formatDateTime, formatTime } from '@/lib/format';
import { initials } from '@/lib/support';
import { cn } from '@/lib/utils';

type Viewer = 'customer' | 'staff';

/**
 * The message thread plus the composer — the same component for the customer
 * and for support staff, so both sides see the same conversation (staff also
 * see internal notes and events). The thread scrolls; the composer stays put
 * at the bottom, which is what makes it comfortable on a phone.
 */
export function Conversation({
  ticket,
  viewer,
  currentUserId,
  onSent,
  className,
}: {
  ticket: SupportTicketDetailDTO;
  viewer: Viewer;
  currentUserId: string;
  onSent: (message: SupportMessageDTO) => void;
  className?: string;
}) {
  const { toast } = useToast();
  const [text, setText] = React.useState('');
  const [internal, setInternal] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const bottom = React.useRef<HTMLDivElement>(null);
  const resolved = ticket.status === 'RESOLVED';

  // Stay pinned to the newest message.
  React.useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [ticket.messages.length, ticket.id]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const message = await apiClient.post<SupportMessageDTO>(`/api/v1/support/tickets/${ticket.id}/messages`, {
        body,
        internal: viewer === 'staff' && internal ? true : undefined,
      });
      onSent(message);
      setText('');
      if (internal) setInternal(false);
    } catch (err) {
      toast({ title: "Couldn't send your message", description: err instanceof ApiError ? err.message : undefined, variant: 'error' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4" data-testid="thread" role="log" aria-live="polite">
        <ol className="mx-auto flex max-w-2xl flex-col gap-3">
          {ticket.messages.map((m, i) => {
            const prev = ticket.messages[i - 1];
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
            return (
              <React.Fragment key={m.id}>
                {newDay && (
                  <li className="my-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {new Date(m.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </li>
                )}
                <Message message={m} mine={m.sender?.id === currentUserId} viewer={viewer} />
              </React.Fragment>
            );
          })}
          {resolved && (
            <li className="text-center text-xs text-muted-foreground">
              {viewer === 'customer' ? 'This request is resolved. Reply below if you still need help.' : 'Resolved. A reply will reopen it.'}
            </li>
          )}
        </ol>
        <div ref={bottom} />
      </div>

      <div className={cn('border-t border-border bg-background p-3 pb-safe sm:px-4', internal && 'bg-warning/10')}>
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {viewer === 'staff' && (
            <div className="flex items-center justify-between gap-2 text-xs">
              <label className="flex cursor-pointer items-center gap-2 font-medium">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} data-testid="internal-toggle" />
                <Lock className="h-3 w-3" /> Internal note <span className="font-normal text-muted-foreground">(the customer won't see it)</span>
              </label>
            </div>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              aria-label={internal ? 'Internal note' : 'Your message'}
              placeholder={internal ? 'Write a note for the team…' : viewer === 'staff' ? 'Reply to the customer…' : 'Type your message…'}
              value={text}
              maxLength={MAX_MESSAGE_LENGTH}
              rows={2}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                // Desktop: Enter sends, Shift+Enter adds a line. On phones the on-screen Enter stays a newline.
                if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 768px)').matches) {
                  e.preventDefault();
                  void send();
                }
              }}
              className="max-h-40 min-h-[44px] flex-1 resize-none"
              data-testid="composer"
            />
            <Button onClick={send} disabled={sending || !text.trim()} size="icon" className="h-11 w-11 shrink-0" aria-label="Send message" data-testid="send">
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {text.length > MAX_MESSAGE_LENGTH - 200 && (
            <p className="text-right text-xs text-muted-foreground">
              {text.length}/{MAX_MESSAGE_LENGTH}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Message({ message, mine, viewer }: { message: SupportMessageDTO; mine: boolean; viewer: Viewer }) {
  if (message.kind === 'SYSTEM') {
    return (
      <li className="flex justify-center" data-testid="system-message">
        <span
          className={cn(
            'max-w-[90%] rounded-full px-3 py-1 text-center text-xs',
            message.isInternal ? 'bg-warning/15 text-foreground' : 'bg-muted text-muted-foreground',
          )}
          title={formatDateTime(message.createdAt)}
        >
          {message.isInternal && <Lock className="mr-1 inline h-3 w-3" />}
          {message.body}
        </span>
      </li>
    );
  }

  if (message.isInternal) {
    return (
      <li className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm" data-testid="internal-note">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
          <Lock className="h-3 w-3" /> Internal note · {message.sender?.name} · {formatTime(message.createdAt)}
        </p>
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
      </li>
    );
  }

  // Customers see the restaurant on the left; staff see the customer on the left.
  const showAvatar = !mine;
  return (
    <li className={cn('flex items-end gap-2', mine && 'flex-row-reverse')} data-testid="message" data-from-staff={message.fromStaff}>
      {showAvatar && (
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
            message.fromStaff ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
          )}
          aria-hidden
        >
          {initials(message.sender?.name ?? 'FB')}
        </span>
      )}
      <div className={cn('flex max-w-[82%] flex-col gap-0.5 sm:max-w-[75%]', mine && 'items-end')}>
        {showAvatar && (
          <span className="px-1 text-[11px] text-muted-foreground">
            {message.sender?.name}
            {viewer === 'customer' && message.fromStaff && ' · FoodBowl'}
          </span>
        )}
        <div
          className={cn(
            'whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm',
            mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted',
          )}
        >
          {message.body}
        </div>
        <span className="px-1 text-[10px] text-muted-foreground">{formatTime(message.createdAt)}</span>
      </div>
    </li>
  );
}
