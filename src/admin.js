// หน้า Admin: เข้าสู่ระบบ → ตั้งค่า bot, ส่ง Alert LINE, Bot / ทดสอบเลข / Backtest
import './styles.css';
import { $, load, scrollSpy, renderBots, runBot, renderChecker, renderBacktest } from './app.js';
import { upcomingDraw, todayInThailand, nextDrawDate as nextDrawAfter } from './lib/schedule.js';
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
const dash = { draws: null, settings: null, status: null, summary: null };
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
  $('#dash-cards').innerHTML = `
    <div class="dash-card feature"><span>ผลสลากงวดล่าสุด</span><b class="dash-num">${last.first}</b><small>งวดวันที่ ${thDate(last.date)} · ข้อมูล ${draws.length} งวด</small></div>
    <div class="dash-card"><span>งวดถัดไป</span><b>${thDate(next, { day: 'numeric', month: 'short', year: '2-digit' })}</b><small>${days <= 0 ? 'ออกรางวัลวันนี้' : `อีก ${days} วัน`}</small></div>
    <div class="dash-card"><span>สูตรวิเคราะห์ที่ใช้</span><b>${bot ? bot.name : '—'}</b><small>ใช้กับชุดตัวเลขที่ส่งเข้า LINE</small></div>
    <div class="dash-card"><span>สถานะโดยรวม</span>${dash.summary
    ? `<b class="overall-text ${dash.summary.level}">${dash.summary.text}</b><small>${dash.summary.detail}</small>`
    : '<small>กำลังตรวจสอบ…</small>'}</div>`;
  renderStatus();
}

// ---------- สถานะการทำงานของ Bot ----------
const SVG = (d, w = 1.9) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
// ไอคอนประจำแต่ละหัวข้อ
const ROW_ICON = {
  line: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8 9.4 9.4 0 0 1-3.6-.7L3 20.5l1.5-4.3A7.6 7.6 0 0 1 3 11.5a8.4 8.4 0 0 1 9-8 8.4 8.4 0 0 1 9 8z"/>',
  groups: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.8"/><path d="M16 14.2a5.5 5.5 0 0 1 5.5 5.8"/>',
  picks: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  result: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  reply: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  data: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v6c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8v-6M4.5 11.5v6c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8v-6"/>',
  manual: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11.5V4a1.5 1.5 0 0 1 3 0v7.5M14 11.5V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5.2-3l-2-3.5a1.5 1.5 0 0 1 2.6-1.5L8 15"/>',
};
// ไอคอนสถานะด้านขวา
const STATE_ICON = {
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  warn: '<path d="M12 7v6M12 17h.01"/>',
  error: '<path d="M7 7l10 10M17 7 7 17"/>',
  off: '<path d="M12 3v8"/><path d="M6.3 7.2a8 8 0 1 0 11.4 0"/>',
};
const fmtTime = (iso) => new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date(iso));
const LEVEL_TEXT = { ok: 'ปกติ', warn: 'ควรตรวจสอบ', error: 'ขัดข้อง', off: 'ปิดใช้งาน' };
function lastRun(a, empty = 'ยังไม่มีประวัติการทำงาน') {
  if (!a) return { text: empty, failed: false };
  return a.ok
    ? { text: `ทำงานล่าสุด ${fmtTime(a.at)}${a.groups !== undefined ? ` · ส่งถึง ${a.groups} กลุ่ม` : ''}`, failed: false }
    : { text: `ล้มเหลวเมื่อ ${fmtTime(a.at)} · ${a.error ?? 'ไม่ทราบสาเหตุ'}`, failed: true };
}
function statusRows() {
  const { status: st, draws } = dash;
  if (!st || !draws) return null;
  const { line, settings, activity } = st;
  const today = todayInThailand();
  const last = draws.at(-1);
  const next = upcomingDraw(last.date, today);
  const nextText = thDate(next, { day: 'numeric', month: 'short', year: '2-digit' });
  const lineReady = line.token && line.secret;
  const missing = [!line.token && 'Channel access token', !line.secret && 'Channel secret'].filter(Boolean).join(' และ ');
  const auto = (on, a, schedule) => {
    if (!on) return { level: 'off', value: 'ปิดใช้งาน', detail: 'เปิดได้ที่ส่วนการตั้งค่าระบบ' };
    const r = lastRun(a);
    return { level: !lineReady || r.failed ? 'error' : 'ok', value: r.failed ? 'ส่งไม่สำเร็จ' : 'เปิดใช้งาน', detail: `${schedule} · ${r.text}` };
  };
  const reply = lastRun(activity.reply, 'ยังไม่มีการตอบคำสั่ง');
  const manual = lastRun(activity.manual, 'ยังไม่เคยส่งจากหน้านี้');
  // ผลงวดควรมาหลังวันออกรางวัลไม่เกิน 1 วัน
  const stale = Date.parse(today) - Date.parse(nextDrawAfter(last.date)) > 864e5;
  return [
    { key: 'line', title: 'การเชื่อมต่อ LINE', level: lineReady ? 'ok' : 'error', value: lineReady ? 'พร้อมใช้งาน' : 'ยังไม่พร้อม',
      detail: lineReady ? 'ตั้งค่า Channel access token และ Channel secret เรียบร้อยแล้ว' : `ยังไม่ได้กำหนด ${missing} ใน Netlify` },
    { key: 'groups', title: 'กลุ่มที่รับการแจ้งเตือน', level: line.groups ? 'ok' : 'warn', value: line.groups ? `${line.groups} กลุ่ม` : 'ยังไม่ได้กำหนด',
      detail: line.groups ? 'กำหนดไว้ใน LINE_GROUP_IDS' : 'เพิ่ม Group ID ใน LINE_GROUP_IDS เพื่อรับการแจ้งเตือนอัตโนมัติ' },
    { key: 'picks', title: 'ส่งชุดตัวเลขแนะนำอัตโนมัติ', ...auto(settings.autoPicks, activity.picks, `รอบถัดไป ${nextText} เวลา 09:00 น.`) },
    { key: 'result', title: 'ประกาศผลรางวัลอัตโนมัติ', ...auto(settings.autoResult, activity.result, `รอบถัดไป ${nextText} ช่วง 15:30–18:30 น.`) },
    settings.commands
      ? { key: 'reply', title: 'ตอบกลับคำสั่งในกลุ่ม', level: !lineReady || reply.failed ? 'error' : 'ok', value: reply.failed ? 'ตอบกลับไม่สำเร็จ' : 'เปิดใช้งาน', detail: reply.text }
      : { key: 'reply', title: 'ตอบกลับคำสั่งในกลุ่ม', level: 'off', value: 'ปิดใช้งาน', detail: 'bot จะไม่ตอบคำสั่งในกลุ่ม (ยกเว้น groupid)' },
    { key: 'data', title: 'ข้อมูลผลรางวัล', level: stale ? 'warn' : 'ok', value: stale ? 'รออัปเดต' : 'เป็นปัจจุบัน',
      detail: `งวดล่าสุด ${thDate(last.date)} · ${draws.length} งวด${stale ? ' · ยังไม่พบผลงวดถัดไปจากแหล่งข้อมูล' : ''}` },
    { key: 'manual', title: 'การส่งข้อความด้วยตนเอง', level: manual.failed ? 'warn' : 'ok', value: manual.failed ? 'ครั้งล่าสุดไม่สำเร็จ' : 'พร้อมใช้งาน', detail: manual.text },
  ];
}
function renderStatus() {
  const rows = statusRows();
  if (!rows) return;
  const bad = rows.filter((r) => r.level === 'error').length;
  const warn = rows.filter((r) => r.level === 'warn').length;
  const summary = bad
    ? { level: 'error', text: 'พบปัญหา', detail: `${bad} รายการขัดข้อง${warn ? ` · ${warn} รายการควรตรวจสอบ` : ''}` }
    : warn
      ? { level: 'warn', text: 'ควรตรวจสอบ', detail: `${warn} รายการควรตรวจสอบ` }
      : { level: 'ok', text: 'ทำงานปกติ', detail: 'ทุกระบบพร้อมใช้งาน' };
  const changed = dash.summary?.text !== summary.text;
  dash.summary = summary;
  $('#status-overall').className = `overall ${summary.level}`;
  $('#status-overall').textContent = summary.text;
  $('#status-checked').textContent = `ตรวจสอบล่าสุด ${fmtTime(dash.status.now)}`;
  $('#status-list').innerHTML = rows.map((r) => `
    <li class="st-row ${r.level}">
      <span class="st-ico">${SVG(ROW_ICON[r.key])}</span>
      <div class="st-main"><b>${r.title}</b><small><span class="st-value">${r.value}</span> · ${r.detail}</small></div>
      <span class="st-state" title="${LEVEL_TEXT[r.level]} · ${r.value}" aria-label="${LEVEL_TEXT[r.level]}: ${r.value}">${SVG(STATE_ICON[r.level], 2.6)}</span>
    </li>`).join('');
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const unknown = dash.status.activity.unknown?.list ?? [];
  $('#status-unknown').innerHTML = `
    <h4>ข้อความที่ Bot ไม่เข้าใจล่าสุด</h4>
    <p class="note">Bot ตอบกลับพร้อมแนะนำคำสั่งที่ใกล้เคียงแล้ว · หากพบคำที่ผู้ใช้พิมพ์บ่อย สามารถเพิ่มเป็นคำสั่งได้</p>
    ${unknown.length
    ? `<ul>${unknown.map((u) => `<li><b>${esc(u.text)}</b><small>${fmtTime(u.at)}</small></li>`).join('')}</ul>`
    : '<p class="empty">ยังไม่มีข้อความที่ Bot ไม่เข้าใจ</p>'}`;
  if (changed) renderDash();
}
async function loadStatus() {
  try {
    const data = await api('/api/admin/status');
    if (!data?.line || !data?.settings) throw new Error('ข้อมูลสถานะไม่ครบ');
    dash.status = { activity: {}, ...data };
    renderStatus();
  } catch (err) {
    $('#status-checked').textContent = `✗ ตรวจสอบสถานะไม่สำเร็จ: ${err.message}`;
  }
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
      loadStatus();
    } catch (err) {
      status.textContent = `✗ ${err.message}`;
    }
  });
}

// ---------- ส่ง Alert LINE ----------
function initLine() {
  document.querySelector('.line-actions').addEventListener('click', async (e) => {
    const rm = e.target.closest('button[data-action="rich-menu"]');
    if (rm) return installMenu(rm);
    const b = e.target.closest('button[data-type]');
    if (!b) return;
    const status = $('#line-status');
    b.disabled = true;
    status.textContent = 'กำลังส่งข้อความ…';
    try {
      const data = await api('/api/line/send', { method: 'POST', body: JSON.stringify({ type: b.dataset.type }) });
      status.textContent = `✓ ส่งข้อความเข้า ${data.groups} กลุ่มเรียบร้อยแล้ว`;
      loadStatus();
    } catch (err) {
      status.textContent = `✗ ${err.message}`;
      loadStatus();
    } finally {
      b.disabled = false;
    }
  });
}

async function installMenu(b) {
  const status = $('#line-status');
  b.disabled = true;
  status.textContent = 'กำลังติดตั้งเมนู LINE…';
  try {
    await api('/api/admin/rich-menu', { method: 'POST', body: '{}' });
    status.textContent = '✓ ติดตั้งเมนู LINE เรียบร้อยแล้ว เปิดแชต 1:1 กับ bot เพื่อดูเมนู (ในกลุ่มให้พิมพ์ "คำสั่ง")';
  } catch (err) {
    status.textContent = `✗ ${err.message}`;
  } finally {
    b.disabled = false;
  }
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
  loadStatus();
  $('#status-refresh').addEventListener('click', loadStatus);
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
