import { safeStorage, shell } from 'electron';
import { createServer, type Server } from 'http';
import { randomBytes, createHash } from 'crypto';
import { readConfig, writeConfig } from './config';
import { createLogger } from './logger';

const log = createLogger('auth');

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
  userinfo_endpoint: string;
  end_session_endpoint?: string;
  issuer: string;
}

interface TokenSet {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_at: number; // Unix timestamp in seconds
  userinfo?: AuthUser; // cached profile from userinfo endpoint
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

const BRAND_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120" fill="none" width="48" height="58">
  <path d="M18 5 L82 5 L62 48 L82 95 L18 95 L38 48Z" stroke="#00D4AA" stroke-width="5" fill="none" stroke-linejoin="round"/>
  <circle cx="50" cy="32" r="6" fill="#00D4AA"/><circle cx="49" cy="52" r="7.5" fill="#00D4AA"/>
  <circle cx="54" cy="67" r="5.5" fill="#00D4AA"/><circle cx="44" cy="77" r="7" fill="#00D4AA"/>
  <circle cx="56" cy="83" r="6" fill="#00D4AA"/>
</svg>`;

const FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120"><path d="M18 5 L82 5 L62 48 L82 95 L18 95 L38 48Z" stroke="#00D4AA" stroke-width="5" fill="none" stroke-linejoin="round"/><circle cx="50" cy="32" r="6" fill="#00D4AA"/><circle cx="49" cy="52" r="7.5" fill="#00D4AA"/><circle cx="54" cy="67" r="5.5" fill="#00D4AA"/><circle cx="44" cy="77" r="7" fill="#00D4AA"/><circle cx="56" cy="83" r="6" fill="#00D4AA"/></svg>';
const FAVICON_SVG_BUFFER = Buffer.from(FAVICON_SVG);

const BRAND_HEAD = `<meta charset="utf-8"><link rel="icon" type="image/svg+xml" href="/favicon.svg">`;

const BRAND_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Oxanium:wght@400;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Oxanium', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0a0a0a; color: #e5e5e5; }
  .card { text-align: center; padding: 2.5rem; max-width: 360px; }
  .logo { margin-bottom: 1.25rem; opacity: 0.5; }
  .brand { font-size: 0.75rem; font-weight: 600; letter-spacing: 5px; text-transform: uppercase; color: #fff; margin-bottom: 1.5rem; display: flex; align-items: baseline; justify-content: center; gap: 0.5rem; }
  .brand-sub { font-size: 0.6rem; font-weight: 400; letter-spacing: 1px; text-transform: none; color: rgba(255,255,255,0.35); }
  h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
  p { color: rgba(255,255,255,0.5); font-size: 0.85rem; line-height: 1.5; }
  .divider { width: 100%; height: 1px; background: #141414; margin: 1.5rem 0; }
  .btn { display: inline-block; padding: 0.6rem 1.5rem; border-radius: 0.5rem; font-family: 'Oxanium', sans-serif; font-size: 0.85rem; font-weight: 600; cursor: pointer; text-decoration: none; transition: opacity 0.15s; border: none; }
  .btn:hover { opacity: 0.85; }
  .btn-primary { background: #00D4AA; color: #0a0a0a; }
  .btn-ghost { background: none; color: rgba(255,255,255,0.4); font-size: 0.75rem; padding: 0.4rem 1rem; }
  .btn-ghost:hover { color: rgba(255,255,255,0.7); }
`;

const SUCCESS_HTML = `<!DOCTYPE html>
<html>
<head>${BRAND_HEAD}<title>Signed in — Ternity</title><style>${BRAND_STYLES}</style></head>
<body><div class="card">
  <div class="logo">${BRAND_LOGO_SVG}</div>
  <div class="brand">Ternity <span class="brand-sub">Electron</span></div>
  <h1 style="color: #00D4AA;">Signed in</h1>
  <p>You can close this tab and return to Ternity.</p>
</div></body>
</html>`;

const ERROR_HTML = (msg: string) => `<!DOCTYPE html>
<html>
<head>${BRAND_HEAD}<title>Sign in failed — Ternity</title><style>${BRAND_STYLES}</style></head>
<body><div class="card">
  <div class="logo">${BRAND_LOGO_SVG}</div>
  <div class="brand">Ternity <span class="brand-sub">Electron</span></div>
  <h1 style="color: #ef4444;">Sign in failed</h1>
  <p>${msg}</p>
</div></body>
</html>`;

const SIGNOUT_HTML = (endSessionUrl: string | null) => `<!DOCTYPE html>
<html>
<head>${BRAND_HEAD}<title>Signed out — Ternity</title><style>${BRAND_STYLES}</style></head>
<body><div class="card">
  <div class="logo">${BRAND_LOGO_SVG}</div>
  <div class="brand">Ternity <span class="brand-sub">Electron</span></div>
  <h1 style="color: #00D4AA;">Signed out</h1>
  <p>You've been signed out of Ternity Desktop.</p>
  ${endSessionUrl ? `
  <div class="divider"></div>
  <p style="margin-bottom: 1rem;">Still signed in to the browser?</p>
  <a href="${endSessionUrl}" class="btn btn-primary">Sign out of browser</a>
  ` : ''}
</div></body>
</html>`;

const SIGNOUT_COMPLETE_HTML = `<!DOCTYPE html>
<html>
<head>${BRAND_HEAD}<title>Signed out — Ternity</title><style>${BRAND_STYLES}</style></head>
<body><div class="card">
  <div class="logo">${BRAND_LOGO_SVG}</div>
  <div class="brand">Ternity <span class="brand-sub">Electron</span></div>
  <h1 style="color: #00D4AA;">Fully signed out</h1>
  <p>You've been signed out of the desktop app and the browser. You can close this tab.</p>
</div></body>
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

      if (url.pathname === '/favicon.svg' || url.pathname === '/favicon.ico') {
        res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
        res.end(FAVICON_SVG_BUFFER);
        return;
      }

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(ERROR_HTML(errorDescription ?? error));
        cleanup();
        reject(new Error(errorDescription ?? error));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(ERROR_HTML('No authorization code received'));
        cleanup();
        reject(new Error('No authorization code received'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
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
// Fetch user profile from Ternity API (most reliable source)
// ============================================================

async function fetchApiProfile(apiBaseUrl: string, accessToken: string): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      log.warn('API /me fetch failed:', res.status);
      return null;
    }
    const data = (await res.json()) as { userId: string; displayName: string; email: string | null };
    log.info('API /me response:', JSON.stringify(data));
    return {
      sub: data.userId,
      name: data.displayName,
      email: data.email ?? undefined,
    };
  } catch (err) {
    log.error('API /me error:', err);
    return null;
  }
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
  // Step 1: Exchange auth code WITHOUT resource — this returns the refresh token.
  // Logto only issues refresh tokens for non-resource-specific token requests.
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: appId,
    code,
    code_verifier: codeVerifier,
    redirect_uri: LOGTO_REDIRECT_URI,
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

  const initial = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in: number;
  };

  log.info('Initial token exchange — has refresh_token:', !!initial.refresh_token, 'expires_in:', initial.expires_in);

  if (!initial.refresh_token) {
    // Fallback: return opaque token (will work for userinfo but not API calls)
    log.warn('No refresh token received — API calls will fail when this token expires');
    return {
      access_token: initial.access_token,
      refresh_token: initial.refresh_token,
      id_token: initial.id_token,
      expires_at: Math.floor(Date.now() / 1000) + initial.expires_in,
    };
  }

  // Step 2: Use refresh token to get a resource-specific JWT access token for the API.
  const apiTokens = await refreshTokens(tokenEndpoint, appId, initial.refresh_token);
  log.info('API token obtained via refresh — expires_in:', apiTokens.expires_at - Math.floor(Date.now() / 1000));

  return {
    access_token: apiTokens.access_token,
    refresh_token: apiTokens.refresh_token ?? initial.refresh_token,
    id_token: initial.id_token ?? apiTokens.id_token,
    expires_at: apiTokens.expires_at,
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
let signOutServer: Server | null = null;

export async function signIn(envId: EnvironmentId): Promise<SignInResult> {
  if (activeSignIn) {
    return { success: false, error: 'Sign-in already in progress' };
  }

  // Close sign-out server if still running (shares the same port)
  if (signOutServer) {
    signOutServer.close();
    signOutServer = null;
  }

  const env = ENVIRONMENTS[envId];
  if (!env.logtoAppId) {
    return { success: false, error: `No Logto App ID configured for ${envId} environment` };
  }

  activeSignIn = (async (): Promise<SignInResult> => {
    try {
      // 1. Discover OIDC endpoints
      log.info('Discovering OIDC endpoints for', env.logtoEndpoint);
      const oidc = await discoverOidc(env.logtoEndpoint);
      log.info('OIDC discovered:', oidc.authorization_endpoint);

      // 2. Generate PKCE pair
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      // 3. Start callback server
      log.info('Starting callback server on port', CALLBACK_PORT);
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
        prompt: 'login consent',
      });

      const authUrl = `${oidc.authorization_endpoint}?${authParams.toString()}`;
      log.info('Opening browser:', authUrl);
      await shell.openExternal(authUrl);
      log.info('Browser opened, waiting for callback...');

      // 5. Wait for callback with auth code
      const { code, close } = await callbackPromise;
      log.info('Got auth code, exchanging for tokens...');

      // 6. Exchange code for tokens
      const tokens = await exchangeCode(oidc.token_endpoint, env.logtoAppId, code, codeVerifier);
      log.info('Tokens received');
      close();

      // 7. Get user profile from Ternity API (same source as web app)
      const apiProfile = await fetchApiProfile(env.apiBaseUrl, tokens.access_token);
      if (apiProfile) {
        tokens.userinfo = apiProfile;
      }

      // Fall back to ID token if API fetch failed
      const user = tokens.userinfo
        ?? (tokens.id_token ? decodeIdToken(tokens.id_token) : null);

      // 8. Store tokens (with cached profile)
      storeTokens(envId, tokens);

      log.info('Sign-in complete, user:', user?.name ?? user?.email ?? user?.sub);
      return { success: true, isAuthenticated: true, user };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      log.error('Sign-in failed:', message);
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

export async function signOut(envId: EnvironmentId): Promise<{ signOutPageUrl: string }> {
  const tokens = loadTokens(envId);
  clearTokens(envId);

  const postLogoutUri = `http://127.0.0.1:${CALLBACK_PORT}/signed-out-complete`;

  // Build end_session URL with post_logout_redirect_uri back to our server
  let endSessionUrl: string | null = null;
  try {
    const env = ENVIRONMENTS[envId];
    const oidc = await discoverOidc(env.logtoEndpoint);
    if (oidc.end_session_endpoint) {
      const params = new URLSearchParams({
        client_id: env.logtoAppId,
        post_logout_redirect_uri: postLogoutUri,
      });
      if (tokens?.id_token) params.set('id_token_hint', tokens.id_token);
      endSessionUrl = `${oidc.end_session_endpoint}?${params.toString()}`;
    }
  } catch {
    // OIDC discovery failed — still show sign-out page without browser button
  }

  // Start a localhost server to serve branded sign-out pages:
  // /signed-out         → initial page with "Sign out of browser" button
  // /signed-out-complete → shown after Logto redirects back (post_logout_redirect_uri)
  const initialHtml = SIGNOUT_HTML(endSessionUrl);
  const port = CALLBACK_PORT;
  const url = await new Promise<string>((resolve) => {
    const server = createServer((req, res) => {
      const pathname = new URL(req.url ?? '/', `http://127.0.0.1:${port}`).pathname;
      if (pathname === '/favicon.svg' || pathname === '/favicon.ico') {
        res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
        res.end(FAVICON_SVG_BUFFER);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (pathname === '/signed-out-complete') {
        res.end(SIGNOUT_COMPLETE_HTML);
      } else {
        res.end(initialHtml);
      }
    });
    server.listen(port, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${port}/signed-out`);
    });
    // Track so signIn() can close it if user signs in quickly
    signOutServer = server;
    // Auto-close after 60s — allow time for the Logto redirect round-trip
    setTimeout(() => { server.close(); signOutServer = null; }, 60_000);
  });

  return { signOutPageUrl: url };
}

export function getAuthState(envId: EnvironmentId): AuthState {
  const tokens = loadTokens(envId);
  if (!tokens) return { isAuthenticated: false, user: null };

  // Prefer cached userinfo (fetched from OIDC endpoint), fall back to ID token
  const user = tokens.userinfo ?? (tokens.id_token ? decodeIdToken(tokens.id_token) : null);
  return { isAuthenticated: true, user };
}

const refreshFailures = new Map<EnvironmentId, number>();

export async function getAccessToken(envId: EnvironmentId): Promise<string | null> {
  const tokens = loadTokens(envId);
  if (!tokens) return null;

  // If token is still valid (with 60s buffer), return it
  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at > now + 60) {
    refreshFailures.delete(envId);
    return tokens.access_token;
  }

  // Try to refresh
  if (!tokens.refresh_token) {
    log.warn('No refresh token for', envId, '— clearing session');
    clearTokens(envId);
    return null;
  }

  try {
    const env = ENVIRONMENTS[envId];
    const oidc = await discoverOidc(env.logtoEndpoint);
    const newTokens = await refreshTokens(
      oidc.token_endpoint,
      env.logtoAppId,
      tokens.refresh_token,
    );

    // Logto returns new refresh token on rotation — preserve cached profile
    storeTokens(envId, {
      ...newTokens,
      refresh_token: newTokens.refresh_token ?? tokens.refresh_token,
      id_token: newTokens.id_token ?? tokens.id_token,
      userinfo: tokens.userinfo,
    });

    refreshFailures.delete(envId);
    log.info('Token refreshed for', envId);
    return newTokens.access_token;
  } catch (err) {
    const failures = (refreshFailures.get(envId) ?? 0) + 1;
    refreshFailures.set(envId, failures);
    log.warn('Refresh failed for', envId, `(attempt ${failures}):`, err);

    // Allow up to 3 consecutive failures before clearing session
    // (handles transient network issues, laptop wake from sleep, etc.)
    if (failures >= 3) {
      log.error('Too many refresh failures — clearing session for', envId);
      clearTokens(envId);
      refreshFailures.delete(envId);
      return null;
    }

    // Return expired token — the API will 401 but we'll retry refresh next time
    return null;
  }
}
