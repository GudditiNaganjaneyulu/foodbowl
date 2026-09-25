'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Step {
  id: string;
  label: string;
  hint: string;
  done: boolean;
  cta?: { label: string; target: string };
}

/**
 * A short "finish setting up" checklist for new customers: contact number
 * and a delivery address make checkout one tap. Disappears once complete.
 */
export function OnboardingCard({
  name,
  welcome,
  hasPhone,
  addressCount,
}: {
  name: string;
  welcome: boolean;
  hasPhone: boolean;
  addressCount: number | null;
}) {
  const steps: Step[] = [
    { id: 'account', label: 'Create your account', hint: 'Done — you\'re signed in.', done: true },
    { id: 'phone', label: 'Add your phone number', hint: 'So the delivery partner can call you.', done: hasPhone, cta: { label: 'Add phone', target: 'profile-phone' } },
    { id: 'address', label: 'Save a delivery address', hint: 'Checkout becomes one tap.', done: (addressCount ?? 0) > 0, cta: { label: 'Add address', target: 'saved-addresses' } },
  ];
  const remaining = steps.filter((s) => !s.done);
  if (addressCount !== null && remaining.length === 0) return null;
  const done = steps.length - remaining.length;

  function jump(target: string) {
    const el = document.getElementById(target);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (el instanceof HTMLInputElement) el.focus();
  }

  return (
    <Card className="border-primary/30 bg-primary/5" data-testid="onboarding">
      <CardContent className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">{welcome ? `Welcome to FoodBowl, ${name.split(' ')[0]}!` : 'Finish setting up'}</h2>
          <p className="text-sm text-muted-foreground">
            {done} of {steps.length} done. A couple of quick things and ordering is one tap away.
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary/15">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
          </div>
        </div>
        <ul className="flex flex-col gap-3">
          {steps.map((s) => (
            <li key={s.id} className="flex items-center gap-3">
              {s.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />}
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium', s.done && 'text-muted-foreground line-through')}>{s.label}</p>
                {!s.done && <p className="text-xs text-muted-foreground">{s.hint}</p>}
              </div>
              {!s.done && s.cta && (
                <Button size="sm" variant="outline" onClick={() => jump(s.cta!.target)}>
                  {s.cta.label}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {welcome && (
          <Button variant="ghost" size="sm" className="self-start" asChild>
            <a href="/">Skip for now — browse the menu</a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
