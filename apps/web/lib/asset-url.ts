import { API_URL } from './api-client';

/**
 * Turns a stored image location into something a browser can load.
 * Photos live in file storage, never in this app: the database holds either
 * an absolute URL (Supabase bucket, or any pasted link) — used as is — or,
 * for the API's built-in storage, a path like "/files/menu-images/x.jpg",
 * which is resolved against the API's address. Keeping the path relative in
 * the database means it works unchanged in every environment.
 */
export function assetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('/files/') ? `${API_URL}${url}` : url;
}
