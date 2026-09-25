'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { SUPPORT_CATEGORIES, SUPPORT_CATEGORY_LABELS, MAX_MESSAGE_LENGTH, type OrderDTO, type SupportCategory, type SupportTicketDetailDTO } from '@foodbowl/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatDateTime, money } from '@/lib/format';

export default function NewSupportRequestPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [orders, setOrders] = React.useState<OrderDTO[]>([]);
  const [category, setCategory] = React.useState<SupportCategory>('OTHER');
  const [orderId, setOrderId] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    if (!user) return;
    apiClient.get<OrderDTO[]>('/api/v1/orders/me?limit=20').then(setOrders).catch(() => undefined);
  }, [user]);

  // Arriving from an order ("Need help with this order?") pre-selects it.
  React.useEffect(() => {
    const fromOrder = new URLSearchParams(window.location.search).get('order');
    if (fromOrder) {
      setOrderId(fromOrder);
      setCategory('ORDER');
    }
  }, []);

  if (isLoading) return <div className="container py-24" />;
  if (!user) {
    return (
      <div className="container flex flex-col items-center gap-3 py-24 text-center text-muted-foreground">
        <p>Log in to contact the restaurant.</p>
        <Button asChild>
          <Link href="/login?next=/support/new">Log in</Link>
        </Button>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const ticket = await apiClient.post<SupportTicketDetailDTO>('/api/v1/support/tickets', {
        subject: subject.trim(),
        category,
        message: message.trim(),
        orderId: orderId || undefined,
      });
      router.push(`/support/${ticket.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send your request');
      setSending(false);
    }
  }

  return (
    <div className="container flex max-w-xl flex-col gap-4 py-6">
      <Link href="/support" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Help &amp; support
      </Link>
      <h1 className="text-xl font-semibold">Contact the restaurant</h1>

      <Card>
        <CardContent className="p-5">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="support-category">What is this about?</Label>
              <Select id="support-category" value={category} onChange={(e) => setCategory(e.target.value as SupportCategory)}>
                {SUPPORT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {SUPPORT_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </div>

            {orders.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="support-order">
                  Which order? <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Select id="support-order" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
                  <option value="">Not about a specific order</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderNumber} · {formatDateTime(o.placedAt)} · {money(o.total)}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="support-subject">Title</Label>
              <Input id="support-subject" required minLength={3} maxLength={120} placeholder="e.g. My order arrived cold" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="support-message">Tell us what happened</Label>
              <Textarea id="support-message" required rows={5} maxLength={MAX_MESSAGE_LENGTH} placeholder="The more detail, the faster we can help." value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={sending || subject.trim().length < 3 || !message.trim()} data-testid="send-request">
              {sending ? 'Sending…' : 'Send request'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
