'use strict';

const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

const auth = require('./auth');
const store = require('./store');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 640,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/** Dam bao token con han truoc khi goi API; tu refresh neu can. */
async function ensureFreshTokens(accountId) {
  const tokens = store.getAccountTokens(accountId);
  if (!tokens) throw new Error('Khong tim thay tai khoan.');

  const willExpireSoon = !tokens.expiresAt || Date.now() > tokens.expiresAt - 60_000;
  if (!willExpireSoon || !tokens.refreshToken) return tokens;

  const refreshed = await auth.refreshAccessToken(tokens.remoteUrl, tokens.refreshToken);
  store.updateAccountTokens(accountId, refreshed);
  return { ...tokens, ...refreshed };
}

ipcMain.handle('accounts:list', () => {
  return { accounts: store.listAccounts(), activeId: store.getActiveAccountId() };
});

ipcMain.handle('accounts:switch', (_e, id) => {
  store.setActiveAccountId(id);
  return { activeId: id };
});

ipcMain.handle('accounts:remove', (_e, id) => {
  store.removeAccount(id);
  return { accounts: store.listAccounts(), activeId: store.getActiveAccountId() };
});

ipcMain.handle('accounts:add', async (event, remoteUrl) => {
  const { tokens, profile } = await auth.loginFlow(remoteUrl, {
    onProgress: (progress) => {
      event.sender.send('accounts:loginProgress', progress);
    },
  });
  const id = store.addOrUpdateAccount({ remoteUrl, tokens, profile });
  return { accounts: store.listAccounts(), activeId: store.getActiveAccountId(), newId: id };
});

ipcMain.handle('accounts:usage', async (_e, id) => {
  const tokens = await ensureFreshTokens(id);
  const usage = await auth.fetchUsage(tokens.remoteUrl, tokens.accessToken);
  return usage;
});
