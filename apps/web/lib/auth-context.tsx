'use client';

import * as React from 'react';
import { ApiError, apiClient, registerAccessTokenGetter, registerRefreshHandler } from './api-client';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (input: { email: string; password: string; name: string; phone?: string }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  /** Silently renews the access token; resolves with the new token, or null if the session is over. */
  refreshSession: () => Promise<string | null>;
  hasPermission: (permission: string) => boolean;
}

/** Expiry (ms since epoch) from a JWT's `exp` claim, or null if it can't be read. */
function tokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // Access token lives in memory only (never localStorage) — the refresh
  // token is an httpOnly cookie set by the API, so a silent refresh on
  // mount recovers the session without exposing tokens to JS/XSS.
  const accessTokenRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    registerAccessTokenGetter(() => accessTokenRef.current);
  }, []);

  const userRef = React.useRef<AuthUser | null>(null);

  // The refs are written HERE, synchronously, not in an effect after render:
  // effects run child-first, so components that fire requests as soon as the
  // user changes (the cart loading itself, say) would otherwise send their
  // first request without the new token, get a 401, and — via the refresh
  // path — wrongly end the session that was just created.
  const applyAuthResult = React.useCallback((result: { accessToken: string; user: AuthUser }) => {
    accessTokenRef.current = result.accessToken;
    userRef.current = result.user;
    setAccessToken(result.accessToken);
    setUser(result.user);
  }, []);

  const clearSession = React.useCallback(() => {
    accessTokenRef.current = null;
    userRef.current = null;
    setAccessToken(null);
    setUser(null);
  }, []);

  // Single-flight: the expiry timer, a 401 retry and the socket can all ask
  // for a refresh at once, but refresh tokens are single-use (rotated), so
  // only one request may be in flight or the losers would log the user out.
  const inFlight = React.useRef<Promise<string | null> | null>(null);
  const refreshSession = React.useCallback((): Promise<string | null> => {
    inFlight.current ??= (async () => {
      let sessionOver = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await apiClient.post<{ accessToken: string; user: AuthUser }>('/api/v1/auth/refresh');
          applyAuthResult(result);
          return result.accessToken;
        } catch (err) {
          const rejected = err instanceof ApiError && (err.statusCode === 401 || err.statusCode === 403);
          // Another tab may have just rotated the (shared) cookie; one short
          // wait and retry picks up its new value before we give up.
          if (rejected && attempt === 0) {
            await new Promise((r) => setTimeout(r, 600));
            continue;
          }
          sessionOver = rejected;
          break;
        }
      }
      // Only a definitive "no" from the server ends the session. A network
      // blip or a 5xx must not log someone out of a working session.
      if (sessionOver && userRef.current) clearSession();
      return null;
    })().finally(() => {
      inFlight.current = null;
    });
    return inFlight.current;
  }, [applyAuthResult, clearSession]);

  React.useEffect(() => {
    registerRefreshHandler(refreshSession);
    return () => registerRefreshHandler(null);
  }, [refreshSession]);

  // Restore the session on page load from the httpOnly refresh cookie.
  React.useEffect(() => {
    refreshSession().finally(() => setIsLoading(false));
  }, [refreshSession]);

  // Renew a minute before the access token expires so long-lived screens
  // (the order queue can sit open all day) never hit a 401 at all.
  React.useEffect(() => {
    if (!accessToken) return;
    const exp = tokenExpiry(accessToken);
    if (!exp) return;
    const timer = setTimeout(() => void refreshSession(), Math.max(exp - Date.now() - 60_000, 5_000));
    return () => clearTimeout(timer);
  }, [accessToken, refreshSession]);

  const login = React.useCallback(
    async (email: string, password: string) => {
      const result = await apiClient.post<{ accessToken: string; user: AuthUser }>('/api/v1/auth/login', {
        email,
        password,
      });
      applyAuthResult(result);
      return result.user;
    },
    [applyAuthResult],
  );

  const registerFn = React.useCallback(
    async (input: { email: string; password: string; name: string; phone?: string }) => {
      const result = await apiClient.post<{ accessToken: string; user: AuthUser }>(
        '/api/v1/auth/register',
        input,
      );
      applyAuthResult(result);
      return result.user;
    },
    [applyAuthResult],
  );

  const logout = React.useCallback(async () => {
    await apiClient.post('/api/v1/auth/logout').catch(() => undefined);
    clearSession();
  }, [clearSession]);

  const hasPermission = React.useCallback(
    (permission: string) => user?.permissions.includes(permission) ?? false,
    [user],
  );

  const value = React.useMemo(
    () => ({ user, accessToken, isLoading, login, register: registerFn, logout, refreshSession, hasPermission }),
    [user, accessToken, isLoading, login, registerFn, logout, refreshSession, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** UX-only gating — every mutation is re-checked server-side regardless. */
export function usePermissions() {
  const { hasPermission, user } = useAuth();
  return { hasPermission, role: user?.role };
}
