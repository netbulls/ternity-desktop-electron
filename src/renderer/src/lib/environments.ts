export type EnvironmentId = 'local' | 'dev' | 'prod';

export interface EnvironmentConfig {
  id: EnvironmentId;
  label: string;
  apiBaseUrl: string;
  webAppUrl: string;
  logtoEndpoint: string;
  logtoAppId: string;
}

export const ENVIRONMENTS: Record<EnvironmentId, EnvironmentConfig> = {
  local: {
    id: 'local',
    label: 'Local',
    apiBaseUrl: 'http://localhost:3010',
    webAppUrl: 'http://localhost:5173',
    logtoEndpoint: 'http://localhost:3001',
    logtoAppId: 'zj3wpsadvjag9t2cz8hvt',
  },
  dev: {
    id: 'dev',
    label: 'Dev',
    apiBaseUrl: 'https://dev.app.ternity.xyz',
    webAppUrl: 'https://dev.app.ternity.xyz',
    logtoEndpoint: 'https://dev.auth.ternity.xyz',
    logtoAppId: 'lc5kuqxtr6zcp5q4acw1e',
  },
  prod: {
    id: 'prod',
    label: 'Prod',
    apiBaseUrl: 'https://app.ternity.xyz',
    webAppUrl: 'https://app.ternity.xyz',
    logtoEndpoint: 'https://auth.ternity.xyz',
    logtoAppId: 'fon9httgns1fy1ghzbbjs',
  },
};

export const ENVIRONMENT_LIST = Object.values(ENVIRONMENTS);

export const DEFAULT_ENVIRONMENT: EnvironmentId = 'prod';
