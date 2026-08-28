'use strict';

const accountListEl = document.getElementById('accountList');
const emptyStateEl = document.getElementById('emptyState');
const usageBoxEl = document.getElementById('usageBox');
const addModal = document.getElementById('addModal');
const progressText = document.getElementById('progressText');

let state = { accounts: [], activeId: null };

function fmtNumber(n) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('vi-VN').format(n);
}

function renderAccounts() {
  accountListEl.innerHTML = '';
  emptyStateEl.hidden = state.accounts.length > 0;

  for (const acc of state.accounts) {
    const li = document.createElement('li');
    li.className = 'account-row' + (acc.id === state.activeId ? ' active' : '');

    const info = document.createElement('div');
    info.className = 'account-info';
    info.innerHTML = `
      <span class="account-label">${escapeHtml(acc.label ?? acc.email ?? acc.id)}</span>
      <span class="account-sub">${escapeHtml(acc.remoteUrl)}</span>
    `;

    const actions = document.createElement('div');
    actions.className = 'account-actions';

    if (acc.id === state.activeId) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'Đang dùng';
      actions.appendChild(badge);
    } else {
      const switchBtn = document.createElement('button');
      switchBtn.className = 'btn';
      switchBtn.textContent = 'Chuyển';
      switchBtn.onclick = () => switchAccount(acc.id);
      actions.appendChild(switchBtn);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-ghost';
    removeBtn.textContent = 'Xóa';
    removeBtn.onclick = () => removeAccount(acc.id);
    actions.appendChild(removeBtn);

    li.appendChild(info);
    li.appendChild(actions);
    accountListEl.appendChild(li);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function refreshList() {
  state = await window.accountsApi.list();
  renderAccounts();
  if (state.activeId) loadUsage(state.activeId);
  else usageBoxEl.innerHTML = '<p class="muted">Chọn một tài khoản để xem quota.</p>';
}

async function switchAccount(id) {
  await window.accountsApi.switchTo(id);
  await refreshList();
}

async function removeAccount(id) {
  state = await window.accountsApi.remove(id);
  renderAccounts();
  if (state.activeId) loadUsage(state.activeId);
  else usageBoxEl.innerHTML = '<p class="muted">Chọn một tài khoản để xem quota.</p>';
}

async function loadUsage(id) {
  usageBoxEl.innerHTML = '<p class="muted">Đang tải quota…</p>';
  try {
    const usage = await window.accountsApi.usage(id);
    renderUsage(usage);
  } catch (err) {
    usageBoxEl.innerHTML = `<p class="error-text">Không lấy được quota: ${escapeHtml(err.message)}</p>`;
  }
}

function renderUsage(usage) {
  // Cau truc du lieu tra ve tu /api/v1/usage co the khac nhau tuy phien ban
  // server; hien thi linh hoat cac truong pho bien, con lai dump raw JSON.
  const known = [
    ['messageCount', 'Số tin nhắn'],
    ['tokenUsage', 'Token đã dùng'],
    ['quotaLimit', 'Giới hạn quota'],
    ['quotaRemaining', 'Quota còn lại'],
  ];

  const cards = known
    .filter(([key]) => usage?.[key] !== undefined)
    .map(
      ([key, label]) => `
        <div class="usage-card">
          <div class="label">${label}</div>
          <div class="value">${fmtNumber(usage[key])}</div>
        </div>`,
    )
    .join('');

  usageBoxEl.innerHTML = `
    <div class="usage-grid">${cards || '<p class="muted">Không có trường quota quen thuộc, xem raw bên dưới.</p>'}</div>
    <details>
      <summary class="muted small">Xem dữ liệu gốc</summary>
      <pre class="small">${escapeHtml(JSON.stringify(usage, null, 2))}</pre>
    </details>
  `;
}

document.getElementById('addBtn').onclick = () => {
  progressText.textContent = '';
  addModal.hidden = false;
};

document.getElementById('cancelAddBtn').onclick = () => {
  addModal.hidden = true;
};

document.getElementById('confirmAddBtn').onclick = async () => {
  const remoteUrl = document.getElementById('serverUrlInput').value.trim();
  if (!remoteUrl) return;

  progressText.textContent = 'Đang mở trình duyệt để bạn đăng nhập…';
  try {
    state = await window.accountsApi.add(remoteUrl);
    addModal.hidden = true;
    renderAccounts();
    if (state.newId) loadUsage(state.newId);
  } catch (err) {
    progressText.textContent = '';
    alert('Đăng nhập thất bại: ' + err.message);
  }
};

document.getElementById('refreshBtn').onclick = () => {
  if (state.activeId) loadUsage(state.activeId);
};

window.accountsApi.onLoginProgress((progress) => {
  if (progress.phase === 'browser_opened') {
    progressText.textContent = 'Trình duyệt đã mở — hoàn tất đăng nhập trên đó.';
  } else if (progress.phase === 'waiting_for_auth') {
    const secs = Math.round((progress.max - progress.elapsed) / 1000);
    progressText.textContent = `Đang chờ bạn đăng nhập… (còn ${secs}s)`;
  } else if (progress.phase === 'verifying') {
    progressText.textContent = 'Đang xác thực…';
  }
});

refreshList();
