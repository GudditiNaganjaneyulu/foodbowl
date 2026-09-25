'use client';

import * as React from 'react';

/** A clock that re-renders the caller every `intervalMs`, so "5 min ago" stays true. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
