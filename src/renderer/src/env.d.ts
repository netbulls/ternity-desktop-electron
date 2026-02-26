/// <reference types="electron-vite/client" />

declare const __APP_VERSION__: string;

interface AuthUser {
  sub: string;
  name?: string;
  email?: string;
  phone?: string;
  picture?: string;
  roles?: string[];
}

interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
}

interface SignInResult {
  success: boolean;
  isAuthenticated?: boolean;
  user?: AuthUser | null;
  error?: string;
}

interface Window {
  electronAPI: {
    platform: string;
    versions: Record<string, string>;
    resizeWindow: (width: number, height: number) => void;
    getEnvironment: () => Promise<string | null>;
    setEnvironment: (env: string) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
    signIn: (envId: string) => Promise<SignInResult>;
    signInDemo: () => Promise<void>;
    signOut: (envId: string) => Promise<void>;
    getAuthState: (envId: string) => Promise<AuthState>;
    getAccessToken: (envId: string) => Promise<string | null>;
    cancelSignIn: () => Promise<void>;
    onAuthProgress: (
      callback: (data: { step: number; label: string; progress: number }) => void,
    ) => () => void;
    apiFetch: (
      envId: string,
      path: string,
      options?: { method?: string; body?: unknown },
    ) => Promise<{ data?: unknown; error?: string; status: number }>;
    getLoginItem: () => Promise<boolean>;
    setLoginItem: (enabled: boolean) => Promise<void>;
    openLogs: () => Promise<void>;
    getDefaultProject: () => Promise<string | null>;
    setDefaultProject: (projectId: string | null) => Promise<void>;
    getRememberPosition: () => Promise<boolean>;
    setRememberPosition: (enabled: boolean) => Promise<void>;
    getStayOnTop: () => Promise<boolean>;
    setStayOnTop: (enabled: boolean) => Promise<void>;
    getLastHeight: () => Promise<number>;
    setSuppressEscape: (suppressed: boolean) => void;
  };
}
