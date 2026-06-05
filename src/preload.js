'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // data
  loadCountdowns: () => ipcRenderer.invoke('countdowns:load'),
  saveCountdowns: (countdowns) => ipcRenderer.invoke('countdowns:save', countdowns),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),

  // app / window
  getVersion: () => ipcRenderer.invoke('app:version'),
  setAlwaysOnTop: (on) => ipcRenderer.invoke('window:setAlwaysOnTop', on),
  updateTray: (summaries) => ipcRenderer.invoke('tray:update', summaries),
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),

  // tmdb (movies) + tvmaze (tv, exact air times)
  tmdbSearch: (query) => ipcRenderer.invoke('tmdb:search', query),
  tmdbDetail: (type, id) => ipcRenderer.invoke('tmdb:detail', { type, id }),
  tvmazeSearch: (query) => ipcRenderer.invoke('tvmaze:search', query),
  tvmazeNext: (id) => ipcRenderer.invoke('tvmaze:next', id),

  // updates
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateStatus: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  }
});
