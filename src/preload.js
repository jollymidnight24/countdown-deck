'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadCountdowns: () => ipcRenderer.invoke('countdowns:load'),
  saveCountdowns: (countdowns) => ipcRenderer.invoke('countdowns:save', countdowns),
  getVersion: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateStatus: (callback) => {
    const listener = (_evt, payload) => callback(payload);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  }
});
