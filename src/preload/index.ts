import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: electronAPI.process.versions,
  resizeWindow: (width: number, height: number) => {
    ipcRenderer.send('resize-window', width, height);
  },
  getEnvironment: () => ipcRenderer.invoke('auth:get-env'),
  setEnvironment: (env: string) => ipcRenderer.invoke('auth:set-env', env),
  openExternal: (url: string) => ipcRenderer.invoke('auth:open-external', url),
  signIn: (envId: string) => ipcRenderer.invoke('auth:sign-in', envId),
  signInDemo: () => ipcRenderer.invoke('auth:sign-in-demo'),
  signOut: (envId: string) => ipcRenderer.invoke('auth:sign-out', envId),
  getAuthState: (envId: string) => ipcRenderer.invoke('auth:get-auth-state', envId),
  getAccessToken: (envId: string) => ipcRenderer.invoke('auth:get-access-token', envId),
  cancelSignIn: () => ipcRenderer.invoke('auth:cancel-sign-in'),
  apiFetch: (envId: string, path: string, options?: { method?: string; body?: unknown }) =>
    ipcRenderer.invoke('api:fetch', envId, path, options),
  getLoginItem: () => ipcRenderer.invoke('app:get-login-item'),
  setLoginItem: (enabled: boolean) => ipcRenderer.invoke('app:set-login-item', enabled),
  openLogs: () => ipcRenderer.invoke('app:open-logs'),
  getDefaultProject: () => ipcRenderer.invoke('app:get-default-project'),
  setDefaultProject: (projectId: string | null) =>
    ipcRenderer.invoke('app:set-default-project', projectId),
  getRememberPosition: () => ipcRenderer.invoke('app:get-remember-position'),
  setRememberPosition: (enabled: boolean) =>
    ipcRenderer.invoke('app:set-remember-position', enabled),
  getLastHeight: () => ipcRenderer.invoke('app:get-last-height'),
  setSuppressEscape: (suppressed: boolean) => ipcRenderer.send('set-suppress-escape', suppressed),
});
