// หน้า Admin: เข้าสู่ระบบ → ตั้งค่า bot, ส่ง Alert LINE, Bot / ทดสอบเลข / Backtest
import './styles.css';
import { $, load, renderBots, runBot, renderChecker, renderBacktest } from './app.js';
import { BOTS } from './lib/bots.js';

const TOKEN_KEY = 'lotto-admin-token';

function session() {
  try {
    const s = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
    return s && s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}
const saveSession = (s) => { try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify(s)); } catch {} };
const clearSession = () => { try { sessionStorage.removeItem(TOKEN_KEY); } catch {} };

async function api(path, options = {}) {
  const s = session();
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(s ? { Authorization: `Bearer ${s.token}` } : {}), ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (res.status === 401) { showLogin('หมดเวลาการเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่'); throw new Error(data.error); }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function showLogin(message = '') {
  clearSession();
  $('#admin').hidden = true;
  $('#admin-nav').hidden = true;
  $('#login').hidden = false;
  $('#login-status').textContent = message;
}

// ---------- ตั้งค่า ----------
const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
function fillSettings(form, settings) {
  for (const el of form.elements) {
    if (!el.name) continue;
    const v = get(settings, el.name);
    if (el.type === 'checkbox') el.checked = Boolean(v);
    else if (v !== undefined) el.value = v;
  }
}
function readSettings(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    const keys = el.name.split('.');
    const leaf = keys.pop();
    const target = keys.reduce((o, k) => (o[k] ??= {}), out);
    target[leaf] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
  }
  return out;
}

let settingsBound = false;
async function initSettings() {
  const form = $('#settings-form');
  const status = $('#settings-status');
  $('#settings-bot').innerHTML = BOTS.filter((b) => b.id !== 'random')
    .map((b) => `<option value="${b.id}">${b.icon} ${b.name}</option>`).join('');
  try {
    fillSettings(form, await api('/api/admin/settings'));
  } catch (err) {
    status.textContent = `✗ โหลดการตั้งค่าไม่สำเร็จ: ${err.message}`;
  }
  if (settingsBound) return;
  settingsBound = true;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = 'กำลังบันทึก…';
    try {
      fillSettings(form, await api('/api/admin/settings', { method: 'POST', body: JSON.stringify(readSettings(form)) }));
      status.textContent = '✅ บันทึกแล้ว มีผลกับ bot ทันที';
    } catch (err) {
      status.textContent = `✗ ${err.message}`;
    }
  });
}

// ---------- ส่ง Alert LINE ----------
function initLine() {
  document.querySelector('.line-actions').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-type]');
    if (!b) return;
    const status = $('#line-status');
    b.disabled = true;
    status.textContent = 'กำลังส่ง…';
    try {
      const data = await api('/api/line/send', { method: 'POST', body: JSON.stringify({ type: b.dataset.type }) });
      status.textContent = `✅ ส่งเข้า ${data.groups} กลุ่มแล้ว`;
    } catch (err) {
      status.textContent = `✗ ${err.message}`;
    } finally {
      b.disabled = false;
    }
  });
}

// ---------- เข้าสู่ระบบ ----------
let rendered = false;
async function showAdmin() {
  $('#login').hidden = true;
  $('#admin').hidden = false;
  $('#admin-nav').hidden = false;
  initSettings();
  if (rendered) return;
  rendered = true;
  initLine();
  const { draws, backtest } = await load();
  renderBots(draws);
  runBot(draws);
  renderChecker(draws);
  renderBacktest(draws, backtest);
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = $('#login-status');
  status.textContent = 'กำลังตรวจสอบ…';
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: $('#login-user').value.trim(), password: $('#login-pass').value }),
    });
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) throw new Error(data.error);
    saveSession(data);
    $('#login-pass').value = '';
    status.textContent = '';
    showAdmin();
  } catch (err) {
    status.textContent = `✗ ${err.message}`;
  }
});
$('#logout').addEventListener('click', () => showLogin('ออกจากระบบแล้ว'));

if (session()) showAdmin();
else showLogin();
