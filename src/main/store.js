'use strict';

const crypto = require('node:crypto');
const { safeStorage } = require('electron');
const Store = require('electron-store');

// electron-store luu file JSON trong userData; token duoc ma hoa truoc khi ghi.
const store = new Store({ name: 'accounts' });

function encrypt(text) {
  if (safeStorage.isEncryptionAvailable()) {
    return { enc: true, value: safeStorage.encryptString(text).toString('base64') };
  }
  // He dieu hanh khong ho tro ma hoa (hiem gap) -> luu tho, canh bao trong UI.
  return { enc: false, value: text };
}

function decrypt(entry) {
  if (!entry) return null;
  if (entry.enc && safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(entry.value, 'base64'));
  }
  return entry.value;
}

function listAccounts() {
  const accounts = store.get('accounts', []);
  // Khong bao gio tra token thuc ra ngoai qua ham nay, chi metadata de hien thi UI.
  return accounts.map(({ id, remoteUrl, label, email, avatar }) => ({
    id,
    remoteUrl,
    label,
    email,
    avatar,
  }));
}

function getActiveAccountId() {
  return store.get('activeAccountId', null);
}

function setActiveAccountId(id) {
  store.set('activeAccountId', id);
}

function addOrUpdateAccount({ remoteUrl, tokens, profile }) {
  const accounts = store.get('accounts', []);
  const id = crypto
    .createHash('sha256')
    .update(`${remoteUrl}::${profile.email ?? profile.id}`)
    .digest('hex')
    .slice(0, 16);

  const existingIndex = accounts.findIndex((a) => a.id === id);
  const record = {
    id,
    remoteUrl,
    label: profile.username || profile.fullName || profile.email || profile.id,
    email: profile.email ?? null,
    avatar: profile.avatar ?? null,
    accessToken: encrypt(tokens.accessToken),
    refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    expiresAt: tokens.expiresAt,
  };

  if (existingIndex >= 0) accounts[existingIndex] = record;
  else accounts.push(record);

  store.set('accounts', accounts);

  // Neu day la tai khoan dau tien, tu dong dat lam active.
  if (!getActiveAccountId()) setActiveAccountId(id);

  return id;
}

function getAccountTokens(id) {
  const accounts = store.get('accounts', []);
  const account = accounts.find((a) => a.id === id);
  if (!account) return null;
  return {
    remoteUrl: account.remoteUrl,
    accessToken: decrypt(account.accessToken),
    refreshToken: account.refreshToken ? decrypt(account.refreshToken) : null,
    expiresAt: account.expiresAt,
  };
}

function updateAccountTokens(id, tokens) {
  const accounts = store.get('accounts', []);
  const idx = accounts.findIndex((a) => a.id === id);
  if (idx < 0) return;
  accounts[idx].accessToken = encrypt(tokens.accessToken);
  if (tokens.refreshToken) accounts[idx].refreshToken = encrypt(tokens.refreshToken);
  accounts[idx].expiresAt = tokens.expiresAt;
  store.set('accounts', accounts);
}

function removeAccount(id) {
  const accounts = store.get('accounts', []).filter((a) => a.id !== id);
  store.set('accounts', accounts);
  if (getActiveAccountId() === id) {
    setActiveAccountId(accounts[0]?.id ?? null);
  }
}

module.exports = {
  listAccounts,
  getActiveAccountId,
  setActiveAccountId,
  addOrUpdateAccount,
  getAccountTokens,
  updateAccountTokens,
  removeAccount,
};
