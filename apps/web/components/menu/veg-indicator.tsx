import { cn } from '@/lib/utils';

/** The square-with-dot veg/non-veg mark used across Indian food delivery apps. */
export function VegIndicator({ isVeg, className }: { isVeg: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border-2',
        isVeg ? 'border-success' : 'border-destructive',
        className,
      )}
      title={isVeg ? 'Vegetarian' : 'Non-vegetarian'}
      aria-label={isVeg ? 'Vegetarian' : 'Non-vegetarian'}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', isVeg ? 'bg-success' : 'bg-destructive')} />
    </span>
  );
}
