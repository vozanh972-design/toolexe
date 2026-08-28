'use strict';

const crypto = require('node:crypto');
const querystring = require('node:querystring');
const { shell } = require('electron');

const CLIENT_ID = 'lobehub-desktop'; // client_id cong khai LobeHub dung cho desktop OAuth flow
const MAX_POLL_TIME = 2 * 60 * 1000; // 2 phut
const POLL_INTERVAL = 3000; // 3 giay

function base64url(buffer) {
  return buffer
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function generateCodeVerifier() {
  return base64url(crypto.randomBytes(32));
}

function generateCodeChallenge(codeVerifier) {
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  return base64url(hash);
}

function buildRedirectUri(remoteUrl) {
  return new URL('/oidc/callback/desktop', remoteUrl).toString();
}

/**
 * Buoc 1: mo trinh duyet he thong that (khong phai webview gia) de nguoi dung
 * tu dang nhap dung tai khoan cua ho tren chinh trang OAuth cua server.
 * Tra ve { codeVerifier, state } de dung cho buoc poll + exchange ben duoi.
 */
async function beginLogin(remoteUrl) {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl = new URL('/oidc/auth', remoteUrl);
  authUrl.search = querystring.stringify({
    client_id: CLIENT_ID,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'consent',
    redirect_uri: buildRedirectUri(remoteUrl),
    resource: 'urn:lobehub:chat',
    response_type: 'code',
    scope: 'profile email offline_access',
    state,
  });

  await shell.openExternal(authUrl.toString());

  return { codeVerifier, state };
}

/**
 * Buoc 2: hoi endpoint handoff cua chinh server (khong phai localhost callback)
 * cho toi khi server bao code da san sang, hoac het thoi gian cho.
 */
async function pollForCode(remoteUrl, state, { onTick } = {}) {
  const start = Date.now();

  while (Date.now() - start < MAX_POLL_TIME) {
    const url = new URL('/oidc/handoff', remoteUrl);
    url.searchParams.set('id', state);
    url.searchParams.set('client', 'desktop');

    const res = await fetch(url, { method: 'GET' });

    if (res.status === 200) {
      const data = await res.json();
      if (data.state !== state) {
        throw new Error('State parameter khong khop, tu choi ket qua nay (co the la CSRF).');
      }
      return data.code;
    }

    if (res.status !== 404) {
      throw new Error(`Handoff endpoint tra loi bat thuong: HTTP ${res.status}`);
    }

    if (onTick) onTick(Date.now() - start, MAX_POLL_TIME);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  throw new Error('Het thoi gian cho dang nhap (2 phut). Thu lai.');
}

/**
 * Buoc 3: doi authorization code lay access/refresh token that su.
 */
async function exchangeCodeForToken(remoteUrl, code, codeVerifier) {
  const tokenUrl = new URL('/oidc/token', remoteUrl);
  const body = querystring.stringify({
    client_id: CLIENT_ID,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: buildRedirectUri(remoteUrl),
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Doi token that bai: HTTP ${res.status} ${text}`);
  }

  const json = await res.json();
  return normalizeTokenResponse(json);
}

/**
 * Dung refresh_token de lay access token moi khi het han (khong can nguoi dung
 * dang nhap lai / khong can mo trinh duyet lai).
 */
async function refreshAccessToken(remoteUrl, refreshToken) {
  const tokenUrl = new URL('/oidc/token', remoteUrl);
  const body = querystring.stringify({
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Refresh token that bai: HTTP ${res.status} ${text}`);
  }

  const json = await res.json();
  return normalizeTokenResponse(json, refreshToken);
}

function normalizeTokenResponse(json, previousRefreshToken) {
  const expiresInMs = (json.expires_in ?? 3600) * 1000;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? previousRefreshToken,
    expiresAt: Date.now() + expiresInMs,
  };
}

/**
 * Lay thong tin danh tinh (email/ten) cua tai khoan vua dang nhap, de gan
 * nhan hien thi trong danh sach tai khoan.
 */
async function fetchProfile(remoteUrl, accessToken) {
  const url = new URL('/api/v1/users/me', remoteUrl);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Khong lay duoc thong tin tai khoan: HTTP ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

/**
 * Lay quota / usage cua tai khoan hien tai (chinh chu, dung token cua ho).
 */
async function fetchUsage(remoteUrl, accessToken) {
  const url = new URL('/api/v1/usage', remoteUrl);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Khong lay duoc quota: HTTP ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

/**
 * Luong dang nhap day du: mo browser -> poll -> doi token -> lay profile.
 */
async function loginFlow(remoteUrl, { onProgress } = {}) {
  const { codeVerifier, state } = await beginLogin(remoteUrl);
  onProgress?.({ phase: 'browser_opened' });

  const code = await pollForCode(remoteUrl, state, {
    onTick: (elapsed, max) => onProgress?.({ phase: 'waiting_for_auth', elapsed, max }),
  });
  onProgress?.({ phase: 'verifying' });

  const tokens = await exchangeCodeForToken(remoteUrl, code, codeVerifier);
  const profile = await fetchProfile(remoteUrl, tokens.accessToken);

  return { tokens, profile };
}

module.exports = {
  loginFlow,
  refreshAccessToken,
  fetchUsage,
  fetchProfile,
};
