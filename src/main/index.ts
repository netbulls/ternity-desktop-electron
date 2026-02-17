import { app, BrowserWindow, Tray, Menu, screen, nativeImage, ipcMain, shell } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { readConfig, writeConfig } from './config';
import { createLogger, getLogPath } from './logger';
import {
  signIn,
  signOut,
  getAuthState,
  getAccessToken,
  abortSignIn,
} from './auth';
import { ENVIRONMENTS, type EnvironmentId } from './environments';

const log = createLogger('app');
const apiLog = createLogger('api');

let tray: Tray | null = null;
let popup: BrowserWindow | null = null;

function createPopup(): BrowserWindow {
  const win = new BrowserWindow({
    width: 380,
    height: 520,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    show: false,
    transparent: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: -20, y: -20 },
    roundedCorners: true,
    hasShadow: true,
    backgroundColor: '#0a0a0a',
    visibleOnAllWorkspaces: true,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
    },
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Hide on blur (click outside) — standard tray app behavior
  win.on('blur', () => {
    win.hide();
  });

  // Esc to close
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'Escape' && input.type === 'keyDown') {
      win.hide();
    }
  });

  return win;
}

function positionPopup(): void {
  if (!tray || !popup) return;

  const trayBounds = tray.getBounds();
  const windowBounds = popup.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x,
    y: trayBounds.y,
  });

  // macOS: center below tray icon
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  const y = Math.round(trayBounds.y + trayBounds.height + 4);

  // Clamp to screen bounds
  const clampedX = Math.max(
    display.workArea.x,
    Math.min(x, display.workArea.x + display.workArea.width - windowBounds.width),
  );
  const clampedY = Math.max(
    display.workArea.y,
    Math.min(y, display.workArea.y + display.workArea.height - windowBounds.height),
  );

  popup.setPosition(clampedX, clampedY);
}

function togglePopup(): void {
  if (!popup) return;

  if (popup.isVisible()) {
    popup.hide();
  } else {
    // Move window to the current Space and set as popup-level so macOS
    // correctly routes blur events even in fullscreen Spaces.
    popup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    popup.setAlwaysOnTop(true, 'pop-up-menu');
    positionPopup();
    popup.show();
    popup.focus();
  }
}

function createTray(): void {
  const trayIconPath = join(
    app.isPackaged ? process.resourcesPath : join(__dirname, '../../resources'),
    'trayTemplate.png',
  );

  const trayImage = nativeImage.createFromPath(trayIconPath);
  trayImage.setTemplateImage(true);

  tray = new Tray(trayImage);
  tray.setToolTip('Ternity');
  tray.on('click', togglePopup);

  // Right-click context menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Start at Login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({ openAtLogin: menuItem.checked });
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Ternity',
      click: () => app.quit(),
    },
  ]);
  tray.on('right-click', () => {
    // Refresh the checkbox state each time the menu opens
    contextMenu.items[0].checked = app.getLoginItemSettings().openAtLogin;
    tray?.popUpContextMenu(contextMenu);
  });
}

app.whenReady().then(() => {
  log.info('App ready', { version: app.getVersion(), platform: process.platform, arch: process.arch });
  log.info('Log file:', getLogPath());

  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  createTray();
  popup = createPopup();

  // Show popup on launch
  popup.once('ready-to-show', () => {
    positionPopup();
    popup!.show();
    popup!.focus();
  });

  // IPC: resize window (for settings expand)
  ipcMain.on('resize-window', (_event, width: number, height: number) => {
    if (!popup) return;
    popup.setSize(Math.round(width), Math.round(height), true);
  });

  // IPC: environment persistence
  ipcMain.handle('auth:get-env', () => {
    const config = readConfig();
    return (config.environment as string) ?? null;
  });

  ipcMain.handle('auth:set-env', (_event, env: string) => {
    log.info('Environment switched to', env);
    const config = readConfig();
    config.environment = env;
    writeConfig(config);
  });

  // IPC: open URL in system browser
  ipcMain.handle('auth:open-external', (_event, url: string) => {
    return shell.openExternal(url);
  });

  // IPC: auth — PKCE sign-in flow
  ipcMain.handle('auth:sign-in', (_event, envId: string) => {
    return signIn(envId as EnvironmentId);
  });

  // IPC: auth — sign out (clear tokens)
  ipcMain.handle('auth:sign-out', (_event, envId: string) => {
    signOut(envId as EnvironmentId);
  });

  // IPC: auth — check stored auth state
  ipcMain.handle('auth:get-auth-state', (_event, envId: string) => {
    return getAuthState(envId as EnvironmentId);
  });

  // IPC: auth — get valid access token (auto-refreshes if expired)
  ipcMain.handle('auth:get-access-token', (_event, envId: string) => {
    return getAccessToken(envId as EnvironmentId);
  });

  // IPC: auth — cancel in-progress sign-in
  ipcMain.handle('auth:cancel-sign-in', () => {
    abortSignIn();
  });

  // IPC: login item (start at login)
  ipcMain.handle('app:get-login-item', () => {
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('app:set-login-item', (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled });
  });

  // IPC: open log file in Finder
  ipcMain.handle('app:open-logs', () => {
    return shell.showItemInFolder(getLogPath());
  });

  // IPC: API proxy — avoids CORS by making fetch calls from main process
  ipcMain.handle(
    'api:fetch',
    async (_event, envId: string, path: string, options?: { method?: string; body?: unknown }) => {
      const token = await getAccessToken(envId as EnvironmentId);
      if (!token) {
        apiLog.warn(`[${envId}] No access token for ${path}`);
        return { error: 'No access token', status: 401 };
      }

      const env = ENVIRONMENTS[envId as EnvironmentId];
      const method = options?.method ?? 'GET';
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };

      let body: string | undefined;
      if (method !== 'GET') {
        headers['Content-Type'] = 'application/json';
        body = options?.body !== undefined ? JSON.stringify(options.body) : '{}';
      }

      const url = `${env.apiBaseUrl}${path}`;
      apiLog.debug(`[${envId}] ${method} ${path}`);

      try {
        const res = await fetch(url, { method, headers, body });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          apiLog.warn(`[${envId}] ${method} ${path} → ${res.status} ${res.statusText}`, text.slice(0, 200));
          return { error: `${res.status} ${res.statusText}: ${text}`, status: res.status };
        }

        const data = await res.json();
        apiLog.debug(`[${envId}] ${method} ${path} → ${res.status}`);
        return { data, status: res.status };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Network error';
        apiLog.error(`[${envId}] ${method} ${path} NETWORK ERROR:`, message);
        return { error: message, status: 0 };
      }
    },
  );
});

app.on('window-all-closed', () => {
  // Don't quit — tray app stays alive
});

app.on('before-quit', () => {
  log.info('App quitting');
});

app.on('activate', () => {
  log.debug('App activated');
});
