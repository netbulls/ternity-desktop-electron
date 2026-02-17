import { app, BrowserWindow, Tray, screen, nativeImage, ipcMain, shell } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { readConfig, writeConfig } from './config';
import {
  signIn,
  signOut,
  getAuthState,
  getAccessToken,
  abortSignIn,
} from './auth';
import type { EnvironmentId } from './environments';

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

  // Hide on blur (click outside) — disabled in dev for easier testing
  if (!is.dev) {
    win.on('blur', () => {
      win.hide();
    });
  }

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
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  createTray();
  popup = createPopup();

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
});

app.on('window-all-closed', () => {
  // Don't quit — tray app stays alive
});
