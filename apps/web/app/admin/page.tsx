import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, ListOrdered, Users, UtensilsCrossed } from 'lucide-react';

const STATS = [
  { label: "Today's orders", value: '—', icon: ListOrdered },
  { label: "Today's revenue", value: '—', icon: DollarSign },
  { label: 'Menu items', value: '—', icon: UtensilsCrossed },
  { label: 'Active staff', value: '—', icon: Users },
];

export default function AdminOverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Order-volume and revenue reporting wires up once the Orders module lands (BUILD_PROMPT.md milestone 6).
        </CardContent>
      </Card>
    </div>
  );
}
