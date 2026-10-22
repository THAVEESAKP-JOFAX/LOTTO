// หน้า Admin: เข้าสู่ระบบ → ตั้งค่า bot, ส่ง Alert LINE, Bot / ทดสอบเลข / Backtest
import './styles.css';
import { $, load, scrollSpy, renderBots, runBot, renderChecker, renderBacktest } from './app.js';
import { upcomingDraw, todayInThailand } from './lib/schedule.js';
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
  if (res.status === 401) { showLogin('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง'); throw new Error(data.error); }
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

// ---------- ภาพรวมระบบ ----------
const dash = { draws: null, settings: null };
const thDate = (iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) =>
  new Intl.DateTimeFormat('th-TH', { ...opts, timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
function renderDash() {
  const { draws, settings } = dash;
  if (!draws) return;
  const last = draws.at(-1);
  const today = todayInThailand();
  const next = upcomingDraw(last.date, today);
  const days = Math.round((Date.parse(next) - Date.parse(today)) / 864e5);
  const bot = settings && BOTS.find((b) => b.id === settings.botId);
  const pill = (on, label) => `<span class="state ${on ? 'on' : 'off'}">${label}: ${on ? 'เปิด' : 'ปิด'}</span>`;
  $('#dash-cards').innerHTML = `
    <div class="dash-card feature"><span>ผลสลากงวดล่าสุด</span><b class="dash-num">${last.first}</b><small>งวดวันที่ ${thDate(last.date)} · ข้อมูล ${draws.length} งวด</small></div>
    <div class="dash-card"><span>งวดถัดไป</span><b>${thDate(next, { day: 'numeric', month: 'short', year: '2-digit' })}</b><small>${days <= 0 ? 'ออกรางวัลวันนี้' : `อีก ${days} วัน`}</small></div>
    <div class="dash-card"><span>สูตรวิเคราะห์ที่ใช้</span><b>${bot ? bot.name : '—'}</b><small>ใช้กับชุดตัวเลขที่ส่งเข้า LINE</small></div>
    <div class="dash-card"><span>สถานะระบบ</span><div class="states">${settings
    ? pill(settings.autoPicks, 'ส่งเลขอัตโนมัติ') + pill(settings.autoResult, 'ประกาศผล') + pill(settings.commands, 'ตอบคำสั่ง')
    : '<small>กำลังโหลด…</small>'}</div></div>`;
}

let settingsBound = false;
async function initSettings() {
  const form = $('#settings-form');
  const status = $('#settings-status');
  $('#settings-bot').innerHTML = BOTS.filter((b) => b.id !== 'random')
    .map((b) => `<option value="${b.id}">${b.name}</option>`).join('');
  try {
    dash.settings = await api('/api/admin/settings');
    fillSettings(form, dash.settings);
    renderDash();
  } catch (err) {
    status.textContent = `✗ โหลดการตั้งค่าไม่สำเร็จ: ${err.message}`;
  }
  if (settingsBound) return;
  settingsBound = true;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = 'กำลังบันทึกการตั้งค่า…';
    try {
      dash.settings = await api('/api/admin/settings', { method: 'POST', body: JSON.stringify(readSettings(form)) });
      fillSettings(form, dash.settings);
      renderDash();
      status.textContent = '✓ บันทึกการตั้งค่าเรียบร้อยแล้ว มีผลทันที';
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
    status.textContent = 'กำลังส่งข้อความ…';
    try {
      const data = await api('/api/line/send', { method: 'POST', body: JSON.stringify({ type: b.dataset.type }) });
      status.textContent = `✓ ส่งข้อความเข้า ${data.groups} กลุ่มเรียบร้อยแล้ว`;
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
  $('#admin-date').textContent = new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date());
  scrollSpy('.side-nav');
  const { draws, backtest } = await load();
  dash.draws = draws;
  renderDash();
  renderBots(draws);
  runBot(draws);
  renderChecker(draws);
  renderBacktest(draws, backtest);
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = $('#login-status');
  status.textContent = 'กำลังตรวจสอบข้อมูล…';
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
// ยืนยันก่อนออกจากระบบ
const logoutDialog = $('#logout-dialog');
$('#logout').addEventListener('click', () => {
  if (typeof logoutDialog.showModal === 'function') { logoutDialog.returnValue = ''; logoutDialog.showModal(); }
  else if (window.confirm('ยืนยันการออกจากระบบ?')) showLogin('ออกจากระบบเรียบร้อยแล้ว');
});
logoutDialog.addEventListener('close', () => {
  if (logoutDialog.returnValue === 'ok') showLogin('ออกจากระบบเรียบร้อยแล้ว');
});
// คลิกนอกกล่องเพื่อปิด
logoutDialog.addEventListener('click', (e) => { if (e.target === logoutDialog) logoutDialog.close('cancel'); });

if (session()) showAdmin();
else showLogin();
