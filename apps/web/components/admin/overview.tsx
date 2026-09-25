'use client';

import * as React from 'react';
import Link from 'next/link';
import { DollarSign, ListOrdered, RefreshCw, Users, UtensilsCrossed, XCircle } from 'lucide-react';
import type { ReportSummaryDTO } from '@foodbowl/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiClient, ApiError } from '@/lib/api-client';
import { money } from '@/lib/format';
import { orderStatusLabel } from '@/lib/order-status-styles';

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });

export function AdminOverview() {
  const [data, setData] = React.useState<ReportSummaryDTO | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setData(await apiClient.get<ReportSummaryDTO>('/api/v1/admin/reports/summary'));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load the summary');
    }
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const stats = [
    { label: 'Orders today', value: String(data.today.ordersPlaced), icon: ListOrdered, id: 'orders-today' },
    { label: 'Revenue today', value: money(data.today.revenue), icon: DollarSign, id: 'revenue-today' },
    { label: 'Cancelled today', value: String(data.today.ordersCancelled), icon: XCircle, id: 'cancelled-today' },
    { label: 'Menu items', value: `${data.menu.available}/${data.menu.items} available`, icon: UtensilsCrossed, id: 'menu-items' },
    { label: 'Active staff', value: String(data.staff.active), icon: Users, id: 'active-staff' },
  ];
  const maxOrders = Math.max(1, ...data.last7Days.map((d) => d.ordersPlaced));
  const inProgress = data.activeByStatus.reduce((n, s) => n + s.count, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Revenue counts cash collected on delivered orders. Days are UTC.</p>
        <Button size="sm" variant="ghost" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold" data-testid={stat.id}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Last 7 days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-44 items-end gap-2" role="img" aria-label="Orders per day for the last 7 days">
              {data.last7Days.map((d) => (
                <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.ordersPlaced} orders · ${money(d.revenue)}`}>
                  <span className="text-xs tabular-nums text-muted-foreground">{d.ordersPlaced}</span>
                  <div className="w-full rounded-t bg-primary/80" style={{ height: `${Math.max(4, (d.ordersPlaced / maxOrders) * 100)}%` }} />
                  <span className="text-xs text-muted-foreground">{dayLabel(d.date)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Revenue this week: <strong className="text-foreground">{money(data.last7Days.reduce((n, d) => n + Number(d.revenue), 0))}</strong>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">In progress now</CardTitle>
            <Link href="/admin/orders" className="text-xs font-medium text-primary hover:underline">
              Open queue
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {data.activeByStatus.map((s) => (
              <div key={s.status} className="flex justify-between">
                <span className="text-muted-foreground">{orderStatusLabel(s.status)}</span>
                <span className="font-medium tabular-nums">{s.count}</span>
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t border-border pt-2 font-semibold">
              <span>Total</span>
              <span className="tabular-nums" data-testid="in-progress-total">{inProgress}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Best sellers (last 30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {data.topItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing delivered in the last 30 days yet.</p>
          ) : (
            <ol className="flex flex-col gap-2 text-sm">
              {data.topItems.map((t, i) => (
                <li key={t.name} className="flex items-center justify-between gap-3">
                  <span>
                    <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                    {t.name}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {t.quantity} sold · {money(t.revenue)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
