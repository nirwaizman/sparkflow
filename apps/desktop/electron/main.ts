import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  dialog,
  shell,
} from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Lightweight JSON preferences store (avoids adding electron-store dep).
type Prefs = {
  backendUrl: string;
  apiToken: string;
  workspaceFolder: string;
  autoLaunch: boolean;
  sessionCookie?: string;
};

const DEFAULTS: Prefs = {
  backendUrl: 'http://localhost:3000',
  apiToken: '',
  workspaceFolder: '',
  autoLaunch: true,
};

const prefsPath = () => path.join(app.getPath('userData'), 'prefs.json');

async function loadPrefs(): Promise<Prefs> {
  try {
    const raw = await fs.readFile(prefsPath(), 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

async function savePrefs(next: Prefs): Promise<void> {
  await fs.mkdir(path.dirname(prefsPath()), { recursive: true });
  await fs.writeFile(prefsPath(), JSON.stringify(next, null, 2), 'utf8');
}

let tray: Tray | null = null;
let quickWin: BrowserWindow | null = null;
let prefsWin: BrowserWindow | null = null;
let prefs: Prefs = { ...DEFAULTS };

const isDev = !app.isPackaged;
const devUrl = process.env.VITE_DEV_SERVER_URL;
const distHtml = path.join(__dirname, '..', 'dist', 'index.html');

function loadRoute(win: BrowserWindow, route: string) {
  if (isDev && devUrl) {
    void win.loadURL(`${devUrl}#${route}`);
  } else {
    void win.loadFile(distHtml, { hash: route });
  }
}

function createQuickWindow() {
  if (quickWin && !quickWin.isDestroyed()) return quickWin;

  const display = screen.getPrimaryDisplay();
  const width = 680;
  const height = 420;
  const x = Math.floor(display.workArea.x + (display.workArea.width - width) / 2);
  const y = Math.floor(display.workArea.y + (display.workArea.height - height) / 3);

  quickWin = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  quickWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  quickWin.on('blur', () => quickWin?.hide());

  loadRoute(quickWin, '/quick');
  return quickWin;
}

function toggleQuickWindow() {
  const win = createQuickWindow();
  if (win.isVisible()) {
    win.hide();
  } else {
    win.show();
    win.focus();
  }
}

function createPreferencesWindow() {
  if (prefsWin && !prefsWin.isDestroyed()) {
    prefsWin.focus();
    return;
  }
  prefsWin = new BrowserWindow({
    width: 560,
    height: 520,
    title: 'SparkFlow Preferences',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  loadRoute(prefsWin, '/preferences');
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Open Quick Prompt  (Option+Space)', click: () => toggleQuickWindow() },
    { type: 'separator' },
    { label: 'Preferences…', click: () => createPreferencesWindow() },
    {
      label: 'Check for Updates…',
      click: () => {
        // TODO: wire electron-updater. Stub for now.
        void dialog.showMessageBox({
          type: 'info',
          message: 'You are on the latest build.',
          detail: 'Auto-update integration is a TODO.',
        });
      },
    },
    {
      label: 'About SparkFlow',
      click: () => {
        void dialog.showMessageBox({
          type: 'info',
          message: 'SparkFlow Desktop',
          detail: `Version ${app.getVersion()}\nGenspark Claw parity client.`,
        });
      },
    },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  ]);
}

function createTray() {
  // 16x16 transparent placeholder; replace with real icon asset later.
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('SparkFlow');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => toggleQuickWindow());
}

function applyAutoLaunch(enabled: boolean) {
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
}

// --- IPC ---

function registerIpc() {
  ipcMain.handle('prefs:get', async () => prefs);
  ipcMain.handle('prefs:set', async (_e: unknown, patch: Partial<Prefs>) => {
    prefs = { ...prefs, ...patch };
    await savePrefs(prefs);
    if (typeof patch.autoLaunch === 'boolean') applyAutoLaunch(patch.autoLaunch);
    return prefs;
  });

  ipcMain.handle('prefs:pickFolder', async () => {
    const res = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    prefs.workspaceFolder = res.filePaths[0];
    await savePrefs(prefs);
    return prefs.workspaceFolder;
  });

  const insideWorkspace = (target: string) => {
    const ws = prefs.workspaceFolder;
    if (!ws) return false;
    const rel = path.relative(ws, path.resolve(target));
    return !rel.startsWith('..') && !path.isAbsolute(rel);
  };

  ipcMain.handle('fs:read', async (_e: unknown, relOrAbs: string) => {
    const ws = prefs.workspaceFolder;
    if (!ws) throw new Error('No workspace folder configured.');
    const target = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(ws, relOrAbs);
    if (!insideWorkspace(target)) throw new Error('Path escapes workspace.');
    return fs.readFile(target, 'utf8');
  });

  ipcMain.handle('fs:writeSafe', async (_e: unknown, relOrAbs: string, contents: string) => {
    const ws = prefs.workspaceFolder;
    if (!ws) throw new Error('No workspace folder configured.');
    const target = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(ws, relOrAbs);
    if (!insideWorkspace(target)) throw new Error('Path escapes workspace.');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, contents, 'utf8');
    return { ok: true, path: target };
  });

  ipcMain.handle('window:hideQuick', () => {
    quickWin?.hide();
  });

  ipcMain.handle('shell:openExternal', async (_e: unknown, url: string) => {
    await shell.openExternal(url);
  });
}

app.whenReady().then(async () => {
  prefs = await loadPrefs();
  applyAutoLaunch(prefs.autoLaunch);

  // Hide dock icon on macOS — tray-only app.
  if (process.platform === 'darwin') app.dock?.hide();

  registerIpc();
  createTray();
  createQuickWindow();

  const ok = globalShortcut.register('Alt+Space', toggleQuickWindow);
  if (!ok) console.warn('Failed to register Option+Space global shortcut.');
});

app.on('window-all-closed', () => {
  // Stay alive as a tray app — deliberately do not call app.quit().
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
