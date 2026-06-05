'use strict';

const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { autoUpdater } = require('electron-updater');

// ---------------------------------------------------------------------------
// Persistence helpers: JSON files in the OS-appropriate userData folder.
// ---------------------------------------------------------------------------
const dataFile = () => path.join(app.getPath('userData'), 'countdowns.json');
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (_) {
    return fallback;
  }
}

function writeJSON(file, value) {
  try {
    fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to write', file, err);
    return false;
  }
}

function loadCountdowns() {
  const v = readJSON(dataFile(), null);
  return Array.isArray(v) ? v : null;
}

const DEFAULT_SETTINGS = {
  theme: 'dark',
  sort: 'manual',
  alwaysOnTop: false,
  tmdbApiKey: ''
};

function loadSettings() {
  return Object.assign({}, DEFAULT_SETTINGS, readJSON(settingsFile(), {}));
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
let mainWindow = null;
let tray = null;
let isQuitting = false;

function appIconPath() {
  // Window/dock icon in dev; packaged builds get their icon from build/icon.png
  // via electron-builder.
  return path.join(__dirname, '..', 'build', 'icon.png');
}

function createWindow() {
  const settings = loadSettings();
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 680,
    minHeight: 520,
    backgroundColor: '#0b1020',
    title: 'Countdown Deck',
    icon: fs.existsSync(appIconPath()) ? appIconPath() : undefined,
    alwaysOnTop: !!settings.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', (e) => {
    // Keep the app alive in the tray instead of quitting on window close.
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ---------------------------------------------------------------------------
// Tray / menu-bar view
// ---------------------------------------------------------------------------
function trayImage() {
  const dir = path.join(__dirname, 'assets');
  const file = process.platform === 'darwin'
    ? path.join(dir, 'trayTemplate.png')
    : path.join(dir, 'tray.png');
  const img = nativeImage.createFromPath(file);
  if (process.platform === 'darwin') img.setTemplateImage(true);
  return img;
}

function createTray() {
  try {
    tray = new Tray(trayImage());
  } catch (_) {
    return; // tray unsupported in this environment
  }
  tray.setToolTip('Countdown Deck');
  tray.on('click', showWindow);
  updateTray([]);
}

function showWindow() {
  if (!mainWindow) return createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function updateTray(summaries) {
  if (!tray) return;
  const items = (summaries || []).slice(0, 8).map((s) => ({ label: s, enabled: false }));
  const template = [
    { label: 'Show Countdown Deck', click: showWindow },
    { type: 'separator' },
    ...(items.length ? items : [{ label: 'No countdowns', enabled: false }]),
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
  if (process.platform === 'darwin' && tray.setTitle) {
    tray.setTitle(summaries && summaries.length ? ' ' + summaries[0] : '');
  }
}

// ---------------------------------------------------------------------------
// TMDB lookup (done in main to avoid CORS and keep the key out of the page)
// ---------------------------------------------------------------------------
function tmdbSearch(query) {
  return new Promise((resolve) => {
    const key = loadSettings().tmdbApiKey;
    if (!key) return resolve({ error: 'no-key' });
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}&include_adult=false`;
    https.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve({ error: 'http-' + res.statusCode });
        try {
          const json = JSON.parse(body);
          const results = (json.results || [])
            .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
            .map((r) => ({
              title: r.title || r.name,
              date: r.release_date || r.first_air_date || '',
              type: r.media_type,
              overview: (r.overview || '').slice(0, 140)
            }))
            .filter((r) => r.title);
          resolve({ results });
        } catch (_) {
          resolve({ error: 'parse' });
        }
      });
    }).on('error', () => resolve({ error: 'network' }));
  });
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.handle('countdowns:load', () => loadCountdowns());
ipcMain.handle('countdowns:save', (_e, v) => writeJSON(dataFile(), v));
ipcMain.handle('settings:load', () => loadSettings());
ipcMain.handle('settings:save', (_e, v) => {
  const ok = writeJSON(settingsFile(), Object.assign({}, DEFAULT_SETTINGS, v));
  if (mainWindow) mainWindow.setAlwaysOnTop(!!(v && v.alwaysOnTop));
  return ok;
});
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('window:setAlwaysOnTop', (_e, on) => { if (mainWindow) mainWindow.setAlwaysOnTop(!!on); });
ipcMain.handle('tray:update', (_e, summaries) => updateTray(summaries));
ipcMain.handle('tmdb:search', (_e, query) => tmdbSearch(query));
ipcMain.handle('notify', (_e, payload) => {
  const { title, body } = payload || {};
  if (Notification.isSupported()) new Notification({ title, body, silent: false }).show();
});

ipcMain.handle('updates:check', async () => {
  if (!app.isPackaged) return { status: 'dev' };
  try {
    const r = await autoUpdater.checkForUpdates();
    return { status: 'checked', version: r && r.updateInfo ? r.updateInfo.version : undefined };
  } catch (err) {
    return { status: 'error', message: String(err && err.message ? err.message : err) };
  }
});
ipcMain.handle('updates:install', () => autoUpdater.quitAndInstall());

// ---------------------------------------------------------------------------
// Auto-update wiring (electron-updater -> GitHub Releases)
// ---------------------------------------------------------------------------
function sendUpdate(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:status', payload);
}

function setupAutoUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => sendUpdate({ state: 'checking' }));
  autoUpdater.on('update-available', (i) => sendUpdate({ state: 'available', version: i.version }));
  autoUpdater.on('update-not-available', () => sendUpdate({ state: 'none' }));
  autoUpdater.on('download-progress', (p) => sendUpdate({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('error', (err) => sendUpdate({ state: 'error', message: String(err && err.message ? err.message : err) }));
  autoUpdater.on('update-downloaded', (i) => sendUpdate({ state: 'ready', version: i.version }));
  if (app.isPackaged) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 4000);
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  createWindow();
  createTray();
  setupAutoUpdates();
  app.on('activate', () => { showWindow(); });
});

app.on('before-quit', () => { isQuitting = true; });

// A tray is present, so we intentionally keep running when the window closes.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) app.quit();
});
