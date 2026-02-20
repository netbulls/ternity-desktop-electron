import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  screen,
  nativeImage,
  nativeTheme,
  ipcMain,
  shell,
  systemPreferences,
} from 'electron';
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
const isLinux = process.platform === 'linux';

let tray: Tray | null = null;
let popup: BrowserWindow | null = null;

// Remembered window position (cross-platform; also serves as Linux fallback since tray.getBounds() returns zeros)
let savedPosition: { x: number; y: number } | null = null;

// Linux: suppress blur briefly after tray click (GNOME fires blur immediately after show)
let blurSuppressedUntil = 0;

// Guard: on Windows, resize event fires synchronously during setSize — skip width enforcement
let programmaticResize = false;

// macOS: track space switches to distinguish them from click-outside blurs.
// NSWorkspaceActiveSpaceDidChangeNotification fires when the user switches spaces;
// we set a timestamp so the blur handler can detect the transition and re-focus
// instead of hiding.
let spaceChangedAt = 0;

function loadSavedPosition(): void {
  const config = readConfig();
  if (config.windowX != null && config.windowY != null) {
    savedPosition = { x: config.windowX as number, y: config.windowY as number };
  }
}

function savePosition(x: number, y: number): void {
  savedPosition = { x, y };
  const config = readConfig();
  config.windowX = x;
  config.windowY = y;
  writeConfig(config);
}

const DEFAULT_POPUP_HEIGHT = 730;
const MIN_POPUP_HEIGHT = 400;
const MAX_POPUP_HEIGHT = 1200;

function loadSavedHeight(): number {
  const config = readConfig();
  const h = config.windowHeight as number | undefined;
  if (h != null && h >= MIN_POPUP_HEIGHT && h <= MAX_POPUP_HEIGHT) return h;
  return DEFAULT_POPUP_HEIGHT;
}

let popupHeight = DEFAULT_POPUP_HEIGHT;

function createPopup(): BrowserWindow {
  const win = new BrowserWindow({
    width: 380,
    height: popupHeight,
    frame: false,
    resizable: true,
    movable: true,
    skipTaskbar: true,
    show: false,
    transparent: false,
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : undefined,
    trafficLightPosition: process.platform === 'darwin' ? { x: -20, y: -20 } : undefined,
    roundedCorners: true,
    hasShadow: true,
    backgroundColor: '#0a0a0a',
    visibleOnAllWorkspaces: !isLinux,
    maximizable: false,
    fullscreenable: false,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
    },
  });

  // macOS: pin across all spaces including full-screen
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setAlwaysOnTop(true, 'floating');
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Save position when window is hidden or closed.
  // On Linux/Wayland the 'moved' event never fires, so this is the primary save mechanism.
  // 'hide' covers blur/Escape/toggle; 'close' covers app quit.
  for (const event of ['hide', 'close'] as const) {
    win.on(event, () => {
      if (win.isDestroyed()) return;
      const [x, y] = win.getPosition();
      savePosition(x, y);
    });
  }

  // Blur handling — platform-specific
  let blurTimer: ReturnType<typeof setTimeout> | null = null;

  win.on('blur', () => {
    if (Date.now() < blurSuppressedUntil) return;
    if (blurTimer) clearTimeout(blurTimer);

    if (process.platform === 'darwin') {
      // macOS: distinguish "clicked another app" from "space switch".
      // Space switches fire NSWorkspaceActiveSpaceDidChangeNotification
      // which sets spaceChangedAt. If blur happens right after, re-focus
      // to survive the transition. Otherwise, user clicked away → hide.
      blurTimer = setTimeout(() => {
        if (win.isDestroyed() || !win.isVisible()) return;
        if (Date.now() - spaceChangedAt < 1000) {
          // Space just changed → re-focus to survive the transition
          win.setAlwaysOnTop(true, 'floating');
          app.show();
          win.focus();
        } else {
          // User clicked another app → dismiss
          win.hide();
        }
      }, 200);
    } else {
      // Linux/Windows: hide on blur (click outside)
      blurTimer = setTimeout(() => {
        if (win.isVisible() && !win.isFocused() && !win.isDestroyed()) {
          win.hide();
        }
      }, 100);
    }
  });

  win.on('focus', () => {
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = null;
    }
  });

  // Esc to close
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'Escape' && input.type === 'keyDown') {
      win.hide();
    }
  });

  // Save position when user moves the window (for "Remember Position" feature)
  win.on('moved', () => {
    const [x, y] = win.getPosition();
    savePosition(x, y);
    log.debug('Window moved to', { x, y });
  });

  // Save height when user resizes vertically (debounced)
  let heightSaveTimer: ReturnType<typeof setTimeout> | null = null;
  win.on('resize', () => {
    if (programmaticResize) return;
    const [, h] = win.getSize();
    popupHeight = h;
    if (heightSaveTimer) clearTimeout(heightSaveTimer);
    heightSaveTimer = setTimeout(() => {
      const config = readConfig();
      config.windowHeight = h;
      writeConfig(config);
      log.debug('Window height saved', h);
    }, 500);
  });

  return win;
}

function positionPopup(): void {
  if (!tray || !popup) return;

  const windowBounds = popup.getBounds();

  // Use remembered position if available (cross-platform)
  if (savedPosition) {
    const display = screen.getDisplayNearestPoint(savedPosition);
    const wa = display.workArea;
    const x = Math.max(wa.x, Math.min(savedPosition.x, wa.x + wa.width - windowBounds.width));
    const y = Math.max(wa.y, Math.min(savedPosition.y, wa.y + wa.height - windowBounds.height));
    popup.setPosition(x, y);
    return;
  }

  const trayBounds = tray.getBounds();
  const hasTrayBounds = trayBounds.width > 0 && trayBounds.height > 0;

  const display = hasTrayBounds
    ? screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
    : screen.getPrimaryDisplay();

  let x: number;
  let y: number;

  const wa = display.workArea;

  if (hasTrayBounds) {
    // Center horizontally on tray icon
    x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
    // macOS: tray at top → popup below; Windows/Linux: tray at bottom → popup above
    const trayAtTop = trayBounds.y < wa.y + wa.height / 2;
    if (trayAtTop) {
      y = Math.round(trayBounds.y + trayBounds.height + 4);
    } else {
      // Position flush with bottom of work area (just above taskbar)
      y = wa.y + wa.height - windowBounds.height - 4;
    }
  } else {
    // Fallback: top-right corner of work area
    x = wa.x + wa.width - windowBounds.width - 8;
    y = wa.y + 8;
  }

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

function showPopup(): void {
  if (!popup) return;
  if (isLinux) blurSuppressedUntil = Date.now() + 300;
  if (process.platform === 'darwin') {
    // Re-apply every show — Electron can reset these internally
    popup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    popup.setAlwaysOnTop(true, 'floating');
    app.show(); // activate app (needed to appear over full-screen spaces)
  } else {
    popup.setAlwaysOnTop(true);
  }
  positionPopup();
  popup.show();
  popup.focus();
}

function togglePopup(): void {
  if (!popup) return;
  if (popup.isVisible()) {
    popup.hide();
  } else {
    showPopup();
  }
}

function getTrayIconName(): string {
  if (process.platform === 'darwin') return 'trayTemplate.png';
  if (process.platform === 'win32') {
    // Windows: detect taskbar theme and use appropriate icon
    return nativeTheme.shouldUseDarkColors ? 'trayLight.png' : 'trayDark.png';
  }
  // Linux: GNOME/KDE panels are dark across all major distros
  return 'trayLight.png';
}

function createTray(): void {
  const resourceDir = app.isPackaged ? process.resourcesPath : join(__dirname, '../../resources');
  const trayIconPath = join(resourceDir, getTrayIconName());

  const trayImage = nativeImage.createFromPath(trayIconPath);
  if (process.platform === 'darwin') trayImage.setTemplateImage(true);

  tray = new Tray(trayImage);
  tray.setToolTip('Ternity');

  tray.on('click', togglePopup);
  tray.on('double-click', togglePopup);

  const contextMenu = Menu.buildFromTemplate([
    ...(isLinux
      ? [
          { label: 'Open', click: () => showPopup() } as Electron.MenuItemConstructorOptions,
          { type: 'separator' as const },
        ]
      : []),
    {
      label: 'Start at Login',
      type: 'checkbox' as const,
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem: Electron.MenuItem) => {
        app.setLoginItemSettings({ openAtLogin: menuItem.checked });
      },
    },
    { type: 'separator' as const },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);

  if (isLinux) {
    tray.setContextMenu(contextMenu);
  } else {
    tray.on('right-click', () => {
      contextMenu.items[0].checked = app.getLoginItemSettings().openAtLogin;
      tray?.popUpContextMenu(contextMenu);
    });
  }
}

app.whenReady().then(() => {
  log.info('App ready', { version: app.getVersion(), platform: process.platform, arch: process.arch });
  log.info('Log file:', getLogPath());

  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  loadSavedPosition();
  popupHeight = loadSavedHeight();
  createTray();
  popup = createPopup();

  // Windows: update tray icon when user switches light/dark mode
  if (process.platform === 'win32') {
    nativeTheme.on('updated', () => {
      if (!tray) return;
      const resourceDir = app.isPackaged ? process.resourcesPath : join(__dirname, '../../resources');
      const iconPath = join(resourceDir, getTrayIconName());
      tray.setImage(nativeImage.createFromPath(iconPath));
    });
  }

  // IPC: resize window (for settings expand)
  // On first resize, show the popup (content is properly sized, no visual jank)
  let initialShowDone = isLinux; // Linux: skip auto-show, tray click opens it
  ipcMain.on('resize-window', (_event, width: number) => {
    if (!popup) return;
    const w = Math.round(width);

    // Set size, then lock width while allowing vertical resize via min/max constraints
    // Guard: on Windows, resize event fires synchronously during setSize — skip width enforcement
    programmaticResize = true;
    popup.setMinimumSize(1, 1);
    popup.setMaximumSize(0, 0);
    popup.setSize(w, popupHeight, initialShowDone);
    // Lock width: min and max width are the same; height range allows vertical resize
    popup.setMinimumSize(w, MIN_POPUP_HEIGHT);
    popup.setMaximumSize(w, MAX_POPUP_HEIGHT);
    programmaticResize = false;

    // Keep popup on-screen after width change (settings expand can push it off-edge)
    if (initialShowDone) {
      const bounds = popup.getBounds();
      const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
      const wa = display.workArea;
      let nx = bounds.x;
      if (bounds.x + w > wa.x + wa.width) nx = wa.x + wa.width - w;
      if (nx < wa.x) nx = wa.x;
      if (nx !== bounds.x) {
        popup.setPosition(nx, bounds.y);
        savedPosition = { x: nx, y: bounds.y };
      }
    }
    if (!initialShowDone) {
      initialShowDone = true;
      // Let resize paint before showing
      setTimeout(() => {
        if (process.platform === 'darwin') {
          popup!.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
          popup!.setAlwaysOnTop(true, 'floating');
        }
        positionPopup();
        popup!.show();
        popup!.focus();
      }, 50);
    }
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

  // IPC: remember position toggle
  ipcMain.handle('app:get-remember-position', () => {
    const config = readConfig();
    return config.rememberPosition === true;
  });

  ipcMain.handle('app:set-remember-position', (_event, enabled: boolean) => {
    const config = readConfig();
    config.rememberPosition = enabled;
    if (!enabled) {
      delete config.windowX;
      delete config.windowY;
      savedPosition = null;
    }
    writeConfig(config);
  });

  // IPC: default project preference
  ipcMain.handle('app:get-default-project', () => {
    const config = readConfig();
    return (config.defaultProjectId as string) ?? null;
  });

  ipcMain.handle('app:set-default-project', (_event, projectId: string | null) => {
    const config = readConfig();
    if (projectId) {
      config.defaultProjectId = projectId;
    } else {
      delete config.defaultProjectId;
    }
    writeConfig(config);
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

// macOS: subscribe to space-change notifications
if (process.platform === 'darwin') {
  systemPreferences.subscribeWorkspaceNotification(
    'NSWorkspaceActiveSpaceDidChangeNotification',
    () => {
      spaceChangedAt = Date.now();
    },
  );
}

app.on('window-all-closed', () => {
  // Don't quit — tray app stays alive
});

app.on('before-quit', () => {
  log.info('App quitting');
});

app.on('activate', () => {
  log.debug('App activated');
});
