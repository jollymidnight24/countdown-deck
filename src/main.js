'use strict';

const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { autoUpdater } = require('electron-updater');

// Custom scheme so user-uploaded background media (stored in userData) can be
// referenced from the renderer without exposing absolute file paths.
protocol.registerSchemesAsPrivileged([
  { scheme: 'cdmedia', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

let mediaDir = null;

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
  tmdbApiKey: '',
  trayMode: 'soonest',   // 'soonest' | 'specific' | 'cycle'
  trayId: '',            // id of the countdown when trayMode === 'specific'
  trayCycleSecs: 6,      // seconds per item when trayMode === 'cycle'
  dateFormat: 'system',  // 'system' | 'iso' | 'us' | 'eu' | 'long'
  clock: 'auto',         // 'auto' | '12' | '24'
  timeZone: '',          // '' = local, else an IANA timezone
  uiFont: 'system',      // font family key
  uiScale: 1,            // overall UI zoom factor
  dashboardBg: 'preset:nebula', // dashboard background spec
  dnd: false             // Do Not Disturb: mute all alerts
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
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required'  // let alarm sounds play on timer
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
  updateTray({});
}

function showWindow() {
  if (!mainWindow) return createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function updateTray(payload) {
  if (!tray) return;
  const p = payload || {};
  const labels = Array.isArray(p.items) ? p.items : [];
  const menuItems = labels.slice(0, 8).map((s) => ({ label: s, enabled: false }));
  const template = [
    { label: 'Show Countdown Deck', click: showWindow },
    { type: 'separator' },
    ...(menuItems.length ? menuItems : [{ label: 'No countdowns', enabled: false }]),
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
  if (process.platform === 'darwin' && tray.setTitle) {
    tray.setTitle(p.title ? ' ' + p.title : '');
  }
}

// ---------------------------------------------------------------------------
// TMDB lookup (done in main to avoid CORS and keep the key out of the page)
// ---------------------------------------------------------------------------
function httpsJSON(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve({ __error: 'http-' + res.statusCode });
        try { resolve(JSON.parse(body)); } catch (_) { resolve({ __error: 'parse' }); }
      });
    }).on('error', () => resolve({ __error: 'network' }));
  });
}

async function tmdbSearch(query) {
  const key = loadSettings().tmdbApiKey;
  if (!key) return { error: 'no-key' };
  const json = await httpsJSON(
    `https://api.themoviedb.org/3/search/multi?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}&include_adult=false`
  );
  if (json.__error) return { error: json.__error };
  const results = (json.results || [])
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => ({
      id: r.id,
      title: r.title || r.name,
      date: r.release_date || r.first_air_date || '',
      type: r.media_type,
      overview: (r.overview || '').slice(0, 140)
    }))
    .filter((r) => r.title);
  return { results };
}

// Fetch the actual next date for a chosen title: a TV show's next episode to
// air (or first-air fallback), or a movie's release date.
async function tmdbDetail(type, id) {
  const key = loadSettings().tmdbApiKey;
  if (!key) return { error: 'no-key' };
  if (type !== 'tv' && type !== 'movie') return { error: 'bad-type' };
  const data = await httpsJSON(`https://api.themoviedb.org/3/${type}/${id}?api_key=${encodeURIComponent(key)}`);
  if (data.__error) return { error: data.__error };
  if (type === 'movie') return { type, name: data.title, date: data.release_date || '' };
  const ne = data.next_episode_to_air;
  const le = data.last_episode_to_air;
  return {
    type,
    name: data.name,
    status: data.status,
    firstAir: data.first_air_date || '',
    next: ne ? { date: ne.air_date, season: ne.season_number, episode: ne.episode_number, epName: ne.name } : null,
    last: le ? { date: le.air_date, season: le.season_number, episode: le.episode_number } : null
  };
}

// ---------------------------------------------------------------------------
// TVmaze lookup (free, no API key) — gives exact episode air times.
// ---------------------------------------------------------------------------
async function tvmazeSearch(query) {
  const json = await httpsJSON(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`);
  if (json && json.__error) return { error: json.__error };
  const results = (Array.isArray(json) ? json : [])
    .map((x) => x.show)
    .filter(Boolean)
    .map((s) => ({
      id: s.id,
      name: s.name,
      premiered: s.premiered || '',
      status: s.status || '',
      network: (s.network && s.network.name) || (s.webChannel && s.webChannel.name) || ''
    }));
  return { results };
}

// The next upcoming episode for a show, including its precise airstamp
// (ISO 8601 with timezone offset, e.g. 2026-06-21T21:00:00-04:00).
async function tvmazeNext(showId) {
  const eps = await httpsJSON(`https://api.tvmaze.com/shows/${encodeURIComponent(showId)}/episodes?specials=0`);
  if (eps && eps.__error) return { error: eps.__error };
  const list = (Array.isArray(eps) ? eps : [])
    .filter((e) => e.airstamp && !isNaN(new Date(e.airstamp).getTime()));
  const now = Date.now();
  const upcoming = list
    .filter((e) => new Date(e.airstamp).getTime() > now)
    .sort((a, b) => new Date(a.airstamp) - new Date(b.airstamp));
  if (upcoming.length) {
    const e = upcoming[0];
    return { airstamp: e.airstamp, season: e.season, episode: e.number, epName: e.name };
  }
  return { none: true };
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
ipcMain.handle('window:setZoom', (_e, f) => {
  if (mainWindow) mainWindow.webContents.setZoomFactor(Math.min(2, Math.max(0.6, Number(f) || 1)));
});
ipcMain.handle('media:save', (_e, payload) => {
  try {
    const { dataURL, ext } = payload || {};
    const m = /^data:([^;]+);base64,(.*)$/s.exec(dataURL || '');
    if (!m) return { error: 'bad-data' };
    const buf = Buffer.from(m[2], 'base64');
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const safeExt = (String(ext || '').replace(/[^a-z0-9]/gi, '').slice(0, 5)) || (m[1].split('/')[1] || 'bin');
    const file = `${id}.${safeExt}`;
    fs.writeFileSync(path.join(mediaDir, file), buf);
    return { url: `cdmedia://media/${file}`, file };
  } catch (err) {
    return { error: String(err && err.message ? err.message : err) };
  }
});
ipcMain.handle('tray:update', (_e, summaries) => updateTray(summaries));
ipcMain.handle('tmdb:search', (_e, query) => tmdbSearch(query));
ipcMain.handle('tmdb:detail', (_e, payload) => tmdbDetail(payload && payload.type, payload && payload.id));
ipcMain.handle('tvmaze:search', (_e, query) => tvmazeSearch(query));
ipcMain.handle('tvmaze:next', (_e, id) => tvmazeNext(id));
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
  mediaDir = path.join(app.getPath('userData'), 'media');
  try { fs.mkdirSync(mediaDir, { recursive: true }); } catch (_) {}
  protocol.registerFileProtocol('cdmedia', (request, callback) => {
    const rel = decodeURIComponent(request.url.replace(/^cdmedia:\/\//, ''));
    callback({ path: path.join(mediaDir, path.basename(rel)) });
  });

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
