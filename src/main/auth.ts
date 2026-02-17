import { safeStorage, shell } from 'electron';
import { createServer, type Server } from 'http';
import { randomBytes, createHash } from 'crypto';
import { readConfig, writeConfig } from './config';
import {
  ENVIRONMENTS,
  LOGTO_REDIRECT_URI,
  LOGTO_SCOPES,
  LOGTO_API_RESOURCE,
  type EnvironmentId,
} from './environments';

// ============================================================
// Types
// ============================================================

export interface AuthUser {
  sub: string;
  name?: string;
  email?: string;
  phone?: string;
  picture?: string;
  roles?: string[];
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
}

export interface SignInResult {
  success: boolean;
  isAuthenticated?: boolean;
  user?: AuthUser | null;
  error?: string;
}

interface OidcConfig {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
  issuer: string;
}

interface TokenSet {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_at: number; // Unix timestamp in seconds
}

// ============================================================
// OIDC Discovery (cached per endpoint)
// ============================================================

const oidcCache = new Map<string, OidcConfig>();

async function discoverOidc(logtoEndpoint: string): Promise<OidcConfig> {
  const cached = oidcCache.get(logtoEndpoint);
  if (cached) return cached;

  const url = `${logtoEndpoint}/oidc/.well-known/openid-configuration`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status} ${res.statusText}`);

  const config = (await res.json()) as OidcConfig;
  oidcCache.set(logtoEndpoint, config);
  return config;
}

// ============================================================
// PKCE helpers
// ============================================================

function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

// ============================================================
// Token storage (encrypted via safeStorage)
// ============================================================

function storeTokens(envId: EnvironmentId, tokens: TokenSet): void {
  const config = readConfig();
  const json = JSON.stringify(tokens);

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(json);
    if (!config.auth) config.auth = {};
    (config.auth as Record<string, unknown>)[envId] = encrypted.toString('base64');
  } else {
    // Fallback: plaintext (Linux without keyring)
    if (!config.auth) config.auth = {};
    (config.auth as Record<string, unknown>)[envId] = json;
  }

  writeConfig(config);
}

function loadTokens(envId: EnvironmentId): TokenSet | null {
  const config = readConfig();
  const auth = config.auth as Record<string, unknown> | undefined;
  if (!auth?.[envId]) return null;

  try {
    const stored = auth[envId] as string;

    if (safeStorage.isEncryptionAvailable()) {
      const buffer = Buffer.from(stored, 'base64');
      const json = safeStorage.decryptString(buffer);
      return JSON.parse(json) as TokenSet;
    } else {
      return JSON.parse(stored) as TokenSet;
    }
  } catch {
    return null;
  }
}

function clearTokens(envId: EnvironmentId): void {
  const config = readConfig();
  const auth = config.auth as Record<string, unknown> | undefined;
  if (auth) {
    delete auth[envId];
    writeConfig(config);
  }
}

// ============================================================
// ID token decode (no verification — we trust Logto over HTTPS)
// ============================================================

function decodeIdToken(idToken: string): AuthUser | null {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return {
      sub: payload.sub,
      name: payload.name ?? payload.username,
      email: payload.email,
      phone: payload.phone_number,
      picture: payload.picture,
      roles: payload.roles,
    };
  } catch {
    return null;
  }
}

// ============================================================
// Localhost callback server
// ============================================================

const CALLBACK_PORT = 21987;
const CALLBACK_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

const SUCCESS_HTML = `<!DOCTYPE html>
<html>
<head><title>Signed in</title><style>
  body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0a0a0a; color: #e5e5e5; }
  .card { text-align: center; padding: 2rem; }
  h1 { color: #2dd4bf; font-size: 1.5rem; margin-bottom: 0.5rem; }
  p { color: #a3a3a3; }
</style></head>
<body><div class="card"><h1>Signed in!</h1><p>You can close this tab and return to Ternity.</p></div></body>
</html>`;

const ERROR_HTML = (msg: string) => `<!DOCTYPE html>
<html>
<head><title>Sign in failed</title><style>
  body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0a0a0a; color: #e5e5e5; }
  .card { text-align: center; padding: 2rem; }
  h1 { color: #ef4444; font-size: 1.5rem; margin-bottom: 0.5rem; }
  p { color: #a3a3a3; }
</style></head>
<body><div class="card"><h1>Sign in failed</h1><p>${msg}</p></div></body>
</html>`;

function startCallbackServer(): Promise<{ code: string; close: () => void }> {
  return new Promise((resolve, reject) => {
    let server: Server | null = null;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Sign-in timed out — no callback received within 2 minutes'));
    }, CALLBACK_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timeout);
      if (server) {
        server.close();
        server = null;
      }
    }

    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${CALLBACK_PORT}`);

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(ERROR_HTML(errorDescription ?? error));
        cleanup();
        reject(new Error(errorDescription ?? error));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(ERROR_HTML('No authorization code received'));
        cleanup();
        reject(new Error('No authorization code received'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(SUCCESS_HTML);
      resolve({ code, close: cleanup });
    });

    server.listen(CALLBACK_PORT, '127.0.0.1', () => {
      // Server is ready
    });

    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Callback server failed to start: ${err.message}`));
    });

    // Store server reference for abort support
    activeServer = server;
  });
}

// ============================================================
// Token exchange / refresh
// ============================================================

async function exchangeCode(
  tokenEndpoint: string,
  appId: string,
  code: string,
  codeVerifier: string,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: appId,
    code,
    code_verifier: codeVerifier,
    redirect_uri: LOGTO_REDIRECT_URI,
    resource: LOGTO_API_RESOURCE,
  });

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in: number;
  };

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    id_token: data.id_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
  };
}

async function refreshTokens(
  tokenEndpoint: string,
  appId: string,
  refreshToken: string,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: appId,
    refresh_token: refreshToken,
    resource: LOGTO_API_RESOURCE,
  });

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in: number;
  };

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    id_token: data.id_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
  };
}

// ============================================================
// Sign-in / sign-out / state
// ============================================================

let activeServer: Server | null = null;
let activeSignIn: Promise<SignInResult> | null = null;

export async function signIn(envId: EnvironmentId): Promise<SignInResult> {
  if (activeSignIn) {
    return { success: false, error: 'Sign-in already in progress' };
  }

  const env = ENVIRONMENTS[envId];
  if (!env.logtoAppId) {
    return { success: false, error: `No Logto App ID configured for ${envId} environment` };
  }

  activeSignIn = (async (): Promise<SignInResult> => {
    try {
      // 1. Discover OIDC endpoints
      console.log('[auth] Discovering OIDC endpoints for', env.logtoEndpoint);
      const oidc = await discoverOidc(env.logtoEndpoint);
      console.log('[auth] OIDC discovered:', oidc.authorization_endpoint);

      // 2. Generate PKCE pair
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      // 3. Start callback server
      console.log('[auth] Starting callback server on port', CALLBACK_PORT);
      const callbackPromise = startCallbackServer();

      // 4. Build auth URL and open in system browser
      const authParams = new URLSearchParams({
        client_id: env.logtoAppId,
        redirect_uri: LOGTO_REDIRECT_URI,
        response_type: 'code',
        scope: LOGTO_SCOPES.join(' '),
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        resource: LOGTO_API_RESOURCE,
        prompt: 'consent',
      });

      const authUrl = `${oidc.authorization_endpoint}?${authParams.toString()}`;
      console.log('[auth] Opening browser:', authUrl);
      await shell.openExternal(authUrl);
      console.log('[auth] Browser opened, waiting for callback...');

      // 5. Wait for callback with auth code
      const { code, close } = await callbackPromise;
      console.log('[auth] Got auth code, exchanging for tokens...');

      // 6. Exchange code for tokens
      const tokens = await exchangeCode(oidc.token_endpoint, env.logtoAppId, code, codeVerifier);
      console.log('[auth] Tokens received');

      // 7. Store tokens
      storeTokens(envId, tokens);
      close();

      // 8. Decode user from ID token
      const user = tokens.id_token ? decodeIdToken(tokens.id_token) : null;
      console.log('[auth] Sign-in complete, user:', user?.name ?? user?.sub);

      return { success: true, isAuthenticated: true, user };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[auth] Sign-in failed:', message);
      return { success: false, error: message };
    } finally {
      activeServer = null;
      activeSignIn = null;
    }
  })();

  return activeSignIn;
}

export function abortSignIn(): void {
  if (activeServer) {
    activeServer.close();
    activeServer = null;
  }
}

export function signOut(envId: EnvironmentId): void {
  clearTokens(envId);
}

export function getAuthState(envId: EnvironmentId): AuthState {
  const tokens = loadTokens(envId);
  if (!tokens) return { isAuthenticated: false, user: null };

  const user = tokens.id_token ? decodeIdToken(tokens.id_token) : null;
  return { isAuthenticated: true, user };
}

export async function getAccessToken(envId: EnvironmentId): Promise<string | null> {
  const tokens = loadTokens(envId);
  if (!tokens) return null;

  // If token is still valid (with 60s buffer), return it
  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at > now + 60) {
    return tokens.access_token;
  }

  // Try to refresh
  if (!tokens.refresh_token) return null;

  try {
    const env = ENVIRONMENTS[envId];
    const oidc = await discoverOidc(env.logtoEndpoint);
    const newTokens = await refreshTokens(
      oidc.token_endpoint,
      env.logtoAppId,
      tokens.refresh_token,
    );

    // Logto returns new refresh token on rotation
    storeTokens(envId, {
      ...newTokens,
      refresh_token: newTokens.refresh_token ?? tokens.refresh_token,
      id_token: newTokens.id_token ?? tokens.id_token,
    });

    return newTokens.access_token;
  } catch {
    // Refresh failed — clear tokens, user needs to re-auth
    clearTokens(envId);
    return null;
  }
}
