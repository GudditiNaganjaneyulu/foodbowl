export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

let accessTokenGetter: () => string | null = () => null;
let refreshHandler: (() => Promise<string | null>) | null = null;

/** Wired once from AuthProvider so apiClient can attach the current access token. */
export function registerAccessTokenGetter(getter: () => string | null) {
  accessTokenGetter = getter;
}

/**
 * Wired from AuthProvider. Called when a request comes back 401 (the 15-minute
 * access token expired): it should silently renew the session and resolve with
 * the new token, or null if the session is really over.
 */
export function registerRefreshHandler(handler: (() => Promise<string | null>) | null) {
  refreshHandler = handler;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_COLD_START_RETRIES = 3;

interface RequestState {
  attempt: number;
  retriedAuth: boolean;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  state: RequestState = { attempt: 0, retriedAuth: false },
): Promise<T> {
  const token = accessTokenGetter();

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        // Declaring JSON with no body makes the API answer 400 (empty JSON body).
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }

  // 503 = the database is waking up (Neon free tier). It fails before running
  // anything, so retrying is safe for every method.
  if (res.status === 503 && state.attempt < MAX_COLD_START_RETRIES) {
    await sleep(1500 * (state.attempt + 1));
    return request<T>(path, init, { ...state, attempt: state.attempt + 1 });
  }

  // Expired access token: renew once, then replay the request.
  if (res.status === 401 && !state.retriedAuth && refreshHandler && !path.startsWith('/api/v1/auth/')) {
    const renewed = await refreshHandler();
    if (renewed) return request<T>(path, init, { ...state, retriedAuth: true });
  }

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, body.details);
  }
  return body as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
