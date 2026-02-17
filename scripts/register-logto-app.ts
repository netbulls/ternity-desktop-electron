/**
 * Register a Native App in Logto for the desktop PKCE auth flow.
 *
 * Usage:
 *   LOGTO_M2M_APP_ID=... LOGTO_M2M_APP_SECRET=... pnpm register-logto-app local
 *   LOGTO_M2M_APP_ID=... LOGTO_M2M_APP_SECRET=... pnpm register-logto-app dev
 *   LOGTO_M2M_APP_ID=... LOGTO_M2M_APP_SECRET=... pnpm register-logto-app prod
 *
 * Outputs the created Application ID — paste it into environments.ts (both main and renderer).
 */

const ENVIRONMENTS = {
  local: { logtoEndpoint: 'http://localhost:3001' },
  dev: { logtoEndpoint: 'https://dev.auth.ternity.xyz' },
  prod: { logtoEndpoint: 'https://auth.ternity.xyz' },
} as const;

const REDIRECT_URI = 'http://127.0.0.1:21987/callback';

type EnvId = keyof typeof ENVIRONMENTS;

async function getM2MToken(logtoEndpoint: string, appId: string, appSecret: string) {
  const res = await fetch(`${logtoEndpoint}/oidc/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: appId,
      client_secret: appSecret,
      resource: 'https://default.logto.app/api',
      scope: 'all',
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get M2M token: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function createNativeApp(logtoEndpoint: string, token: string) {
  const res = await fetch(`${logtoEndpoint}/api/applications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Ternity Desktop',
      description: 'Desktop tray companion app (Electron)',
      type: 'Native',
      oidcClientMetadata: {
        redirectUris: [REDIRECT_URI],
        postLogoutRedirectUris: [],
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create application: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { id: string; name: string };
  return data;
}

async function main() {
  const envId = process.argv[2] as EnvId | undefined;

  if (!envId || !(envId in ENVIRONMENTS)) {
    console.error(`Usage: pnpm register-logto-app <local|dev|prod>`);
    process.exit(1);
  }

  const appId = process.env.LOGTO_M2M_APP_ID;
  const appSecret = process.env.LOGTO_M2M_APP_SECRET;

  if (!appId || !appSecret) {
    console.error('Set LOGTO_M2M_APP_ID and LOGTO_M2M_APP_SECRET environment variables');
    process.exit(1);
  }

  const env = ENVIRONMENTS[envId];
  console.log(`Registering Native App on ${envId} (${env.logtoEndpoint})...`);

  const token = await getM2MToken(env.logtoEndpoint, appId, appSecret);
  const app = await createNativeApp(env.logtoEndpoint, token);

  console.log(`\nCreated: ${app.name}`);
  console.log(`App ID:  ${app.id}`);
  console.log(`\nPaste this into both environment configs (main + renderer):`);
  console.log(`  logtoAppId: '${app.id}'`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
