'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// ---------------------------------------------------------------------------
// Persistence: store countdowns as JSON in the OS-appropriate userData folder.
// ---------------------------------------------------------------------------
const DATA_FILE = () => path.join(app.getPath('userData'), 'countdowns.json');

function loadCountdowns() {
  try {
    const raw = fs.readFileSync(DATA_FILE(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {
    // No file yet, or unreadable — fall back to defaults below.
  }
  return null;
}

function saveCountdowns(countdowns) {
  try {
    fs.writeFileSync(DATA_FILE(), JSON.stringify(countdowns, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save countdowns:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#0b1020',
    title: 'Countdown Deck',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// IPC: renderer <-> main
// ---------------------------------------------------------------------------
ipcMain.handle('countdowns:load', () => loadCountdowns());
ipcMain.handle('countdowns:save', (_evt, countdowns) => saveCountdowns(countdowns));
ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('updates:check', async () => {
  if (!app.isPackaged) {
    return { status: 'dev', message: 'Update checks run only in the packaged app.' };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    if (result && result.updateInfo) {
      return { status: 'checked', version: result.updateInfo.version };
    }
    return { status: 'checked' };
  } catch (err) {
    return { status: 'error', message: String(err && err.message ? err.message : err) };
  }
});

ipcMain.handle('updates:install', () => {
  autoUpdater.quitAndInstall();
});

// ---------------------------------------------------------------------------
// Auto-update wiring (electron-updater -> GitHub Releases)
// ---------------------------------------------------------------------------
function sendUpdateStatus(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function setupAutoUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => sendUpdateStatus('update:status', { state: 'checking' }));
  autoUpdater.on('update-available', (info) => sendUpdateStatus('update:status', { state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => sendUpdateStatus('update:status', { state: 'none' }));
  autoUpdater.on('download-progress', (p) => sendUpdateStatus('update:status', { state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('error', (err) => sendUpdateStatus('update:status', { state: 'error', message: String(err && err.message ? err.message : err) }));
  autoUpdater.on('update-downloaded', (info) => sendUpdateStatus('update:status', { state: 'ready', version: info.version }));

  // Check shortly after launch, then every 6 hours.
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
  setupAutoUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
