/**
 * useAuth — authentication hook with auto-register-then-login.
 *
 * On login we first attempt a direct login. If the backend rejects it with a
 * 401 (user does not exist yet), we transparently register the account and then
 * log in again. This gives a frictionless "just type an email + password" flow.
 */
import { useState, useCallback, useEffect } from 'react';
import { apiService } from '../services/apiService';
import { User } from '../types';

interface UseAuthResult {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

function isUnauthorized(err: unknown): boolean {
  return (err as { response?: { status?: number } })?.response?.status === 401;
}

/** Derive a sane username / full name from an email address. */
function deriveIdentity(email: string): { username: string; fullName: string } {
  const local = (email.split('@')[0] || 'user').replace(/[^a-zA-Z0-9_.-]/g, '');
  const username = `${local || 'user'}_${Date.now().toString(36)}`;
  const fullName = local
    ? local.charAt(0).toUpperCase() + local.slice(1)
    : 'New User';
  return { username, fullName };
}

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(apiService.getToken());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate the user from an existing token on first mount.
  useEffect(() => {
    let cancelled = false;
    const existing = apiService.getToken();
    if (!existing) return;
    setIsLoading(true);
    apiService
      .getCurrentUser()
      .then((u) => {
        if (!cancelled) {
          setUser(u);
          setToken(existing);
        }
      })
      .catch(() => {
        if (!cancelled) {
          apiService.clearToken();
          setToken(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      let auth;
      try {
        auth = await apiService.login(email, password);
      } catch (err) {
        if (!isUnauthorized(err)) throw err;
        // Account doesn't exist yet — register then log in.
        const { username, fullName } = deriveIdentity(email);
        await apiService.register({ email, password, username, fullName });
        auth = await apiService.login(email, password);
      }
      setUser(auth.user);
      setToken(auth.token);
    } catch (err) {
      const message = apiService.getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await apiService.logout();
    } finally {
      setUser(null);
      setToken(null);
      setError(null);
      setIsLoading(false);
    }
  }, []);

  return {
    user,
    token,
    login,
    logout,
    isAuthenticated: !!token,
    isLoading,
    error,
  };
}

export default useAuth;
