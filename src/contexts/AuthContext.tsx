import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { confirmPasswordReset, getCurrentUser, login as loginRequest, logout as logoutRequest, recoverUsername, requestPasswordReset, signup as signupRequest, type AuthUser, type SignupInput } from '../api/auth';

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ onboardingCompleted: boolean }>;
  signup: (input: SignupInput) => Promise<void>;
  refreshUser: (token?: string) => Promise<AuthUser | null>;
  logout: () => Promise<void>;
  recoverUsername: (email: string) => Promise<{ maskedUsername: string | null }>;
  requestPasswordReset: (username: string, email: string) => Promise<{ requested: boolean; resetToken: string | null }>;
  confirmPasswordReset: (token: string, newPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const result = await loginRequest(username, password);
      setAccessToken(result.accessToken);
      const currentUser = await getCurrentUser(result.accessToken);
      setUser(currentUser);
      return { onboardingCompleted: currentUser.onboardingCompleted };
    } catch (error) {
      setUser(null);
      setAccessToken(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signup = useCallback(async (input: SignupInput) => {
    setIsLoading(true);
    try {
      await signupRequest(input);
      setAccessToken(null);
      setUser(null);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('localive:logout'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async (token = accessToken) => {
    if (!token) {
      setUser(null);
      return null;
    }
    setIsLoading(true);
    try {
      const currentUser = await getCurrentUser(token);
      setAccessToken(token);
      setUser(currentUser);
      return currentUser;
    } catch (error) {
      setUser(null);
      setAccessToken(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      if (accessToken) await logoutRequest(accessToken);
    } finally {
      setUser(null);
      setAccessToken(null);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('localive:logout'));
      setIsLoading(false);
    }
  }, [accessToken]);

  const recoverUsernameAction = useCallback((email: string) => recoverUsername(email), []);
  const requestPasswordResetAction = useCallback((username: string, email: string) => requestPasswordReset(username, email), []);
  const confirmPasswordResetAction = useCallback(async (token: string, newPassword: string) => {
    await confirmPasswordReset(token, newPassword);
  }, []);

  const value = useMemo(
    () => ({ user, accessToken, isAuthenticated: Boolean(accessToken), isLoading, login, signup, refreshUser, logout, recoverUsername: recoverUsernameAction, requestPasswordReset: requestPasswordResetAction, confirmPasswordReset: confirmPasswordResetAction }),
    [accessToken, confirmPasswordResetAction, isLoading, login, logout, recoverUsernameAction, refreshUser, requestPasswordResetAction, signup, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
