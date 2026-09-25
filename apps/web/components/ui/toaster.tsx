'use client';

import * as React from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastVariant = 'default' | 'success' | 'error';
interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (t: { title: string; description?: string; variant?: ToastVariant }) => void;
}

const ToastContext = React.createContext<ToastContextValue>({ toast: () => undefined });

const ICONS = { default: Info, success: CheckCircle2, error: XCircle } as const;
const TONES: Record<ToastVariant, string> = {
  default: 'text-primary',
  success: 'text-success',
  error: 'text-destructive',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(1);

  const dismiss = React.useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), []);

  const toast = React.useCallback<ToastContextValue['toast']>(
    ({ title, description, variant = 'default' }) => {
      const id = nextId.current++;
      setItems((prev) => [...prev.slice(-3), { id, title, description, variant }]);
      setTimeout(() => dismiss(id), variant === 'error' ? 7000 : 4500);
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Sits above the mobile bottom nav (bottom-20) and out of the way on desktop. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 md:inset-x-auto md:bottom-6 md:right-6 md:items-end"
      >
        {items.map((t) => {
          const Icon = ICONS[t.variant];
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-border bg-card p-3.5 text-card-foreground shadow-lg"
            >
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', TONES[t.variant])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{t.title}</p>
                {t.description && <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => React.useContext(ToastContext);
