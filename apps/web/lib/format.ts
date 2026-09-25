/** Money arrives from the API as decimal strings ("12.50"); parse only for display. */
export function money(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function addressLine(a: { line1: string; line2?: string | null; city: string; state: string; postalCode: string }): string {
  return [a.line1, a.line2, `${a.city}, ${a.state} ${a.postalCode}`].filter(Boolean).join(', ');
}
