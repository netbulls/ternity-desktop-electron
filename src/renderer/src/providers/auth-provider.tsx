import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ENVIRONMENTS,
  DEFAULT_ENVIRONMENT,
  type EnvironmentId,
  type EnvironmentConfig,
} from '@/lib/environments';

interface AuthContextValue {
  environment: EnvironmentId;
  environmentConfig: EnvironmentConfig;
  isAuthenticated: boolean;
  isDemo: boolean;
  isLoading: boolean;
  isSigningIn: boolean;
  user: AuthUser | null;
  setEnvironment: (env: EnvironmentId) => void;
  signIn: () => void;
  signInDemo: () => void;
  signOut: () => void;
  cancelSignIn: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [environment, setEnvironmentState] = useState<EnvironmentId>(DEFAULT_ENVIRONMENT);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  const environmentConfig = ENVIRONMENTS[environment];
  const isDemo = isAuthenticated && user?.sub === 'demo';

  // Load persisted environment + restore auth state on mount
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) {
      setIsLoading(false);
      return;
    }

    (async () => {
      try {
        const stored = await api.getEnvironment();
        const envId = stored && stored in ENVIRONMENTS ? (stored as EnvironmentId) : environment;
        if (stored && stored in ENVIRONMENTS) {
          setEnvironmentState(envId);
        }

        // Check if we have stored tokens for this environment
        const state = await api.getAuthState(envId);
        if (state.isAuthenticated) {
          setIsAuthenticated(true);
          setUser(state.user);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setEnvironment = useCallback((env: EnvironmentId) => {
    setEnvironmentState(env);
    window.electronAPI?.setEnvironment(env);

    // Re-check auth state for the new environment
    const api = window.electronAPI;
    if (api) {
      api.getAuthState(env).then((state) => {
        setIsAuthenticated(state.isAuthenticated);
        setUser(state.user);
      });
    } else {
      setIsAuthenticated(false);
      setUser(null);
    }
  }, []);

  const signIn = useCallback(() => {
    const api = window.electronAPI;
    if (!api) return;

    setIsSigningIn(true);

    api
      .signIn(environment)
      .then((result) => {
        if (result.success) {
          setIsAuthenticated(true);
          setUser(result.user ?? null);
        }
      })
      .finally(() => {
        setIsSigningIn(false);
      });
  }, [environment]);

  const signInDemo = useCallback(() => {
    setIsAuthenticated(true);
    setUser({ sub: 'demo', name: 'Demo User' });
  }, []);

  const signOut = useCallback(() => {
    setIsAuthenticated(false);
    setUser(null);
    window.electronAPI?.signOut(environment);
  }, [environment]);

  const cancelSignIn = useCallback(() => {
    window.electronAPI?.cancelSignIn();
    setIsSigningIn(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        environment,
        environmentConfig,
        isAuthenticated,
        isDemo,
        isLoading,
        isSigningIn,
        user,
        setEnvironment,
        signIn,
        signInDemo,
        signOut,
        cancelSignIn,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
