'use strict';

// Preload for the auxiliary windows (mini widget + tray popover panel).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aux', {
  onMini: (cb) => ipcRenderer.on('mini:data', (_e, d) => cb(d)),
  onPanel: (cb) => ipcRenderer.on('panel:data', (_e, d) => cb(d)),
  openApp: () => ipcRenderer.invoke('window:show'),
  closeMini: () => ipcRenderer.invoke('mini:close'),
  focus: (id) => ipcRenderer.invoke('panel:focus', id)
});
