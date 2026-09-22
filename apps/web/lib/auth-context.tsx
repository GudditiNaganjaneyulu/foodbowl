'use client';

import * as React from 'react';
import { apiClient, registerAccessTokenGetter } from './api-client';

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
  hasPermission: (permission: string) => boolean;
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
    accessTokenRef.current = accessToken;
  }, [accessToken]);
  React.useEffect(() => {
    registerAccessTokenGetter(() => accessTokenRef.current);
  }, []);

  const applyAuthResult = React.useCallback((result: { accessToken: string; user: AuthUser }) => {
    setAccessToken(result.accessToken);
    setUser(result.user);
  }, []);

  React.useEffect(() => {
    apiClient
      .post<{ accessToken: string; user: AuthUser }>('/api/v1/auth/refresh')
      .then(applyAuthResult)
      .catch(() => undefined)
      .finally(() => setIsLoading(false));
  }, [applyAuthResult]);

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
    setAccessToken(null);
    setUser(null);
  }, []);

  const hasPermission = React.useCallback(
    (permission: string) => user?.permissions.includes(permission) ?? false,
    [user],
  );

  const value = React.useMemo(
    () => ({ user, accessToken, isLoading, login, register: registerFn, logout, hasPermission }),
    [user, accessToken, isLoading, login, registerFn, logout, hasPermission],
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
