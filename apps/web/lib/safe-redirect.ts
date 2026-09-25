/**
 * Where to send someone after login/registration. Only same-site paths are
 * allowed ("/cart", never "//evil.com" or "https://…") so a crafted
 * `?next=` link can't bounce a user to another site.
 */
export function nextPathFromLocation(): string | null {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}
