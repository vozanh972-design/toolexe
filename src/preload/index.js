'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('accountsApi', {
  list: () => ipcRenderer.invoke('accounts:list'),
  add: (remoteUrl) => ipcRenderer.invoke('accounts:add', remoteUrl),
  switchTo: (id) => ipcRenderer.invoke('accounts:switch', id),
  remove: (id) => ipcRenderer.invoke('accounts:remove', id),
  usage: (id) => ipcRenderer.invoke('accounts:usage', id),
  onLoginProgress: (callback) => {
    ipcRenderer.on('accounts:loginProgress', (_e, progress) => callback(progress));
  },
});
