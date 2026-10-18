import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeSettings, DEFAULT_SETTINGS } from '../src/lib/settings.js';
import { parseTickets, checkTickets } from '../src/lib/ticket-check.js';
import { floatingDigits } from '../src/lib/floating.js';
import { login, verifyToken, isAuthorized } from '../netlify/lib/auth.mjs';
import { setSettingsStore, getSettings, saveSettings } from '../netlify/lib/settings.mjs';
import adminLogin from '../netlify/functions/admin-login.mjs';
import adminSettings from '../netlify/functions/admin-settings.mjs';
import publicSettings from '../netlify/functions/settings.mjs';

const draws = JSON.parse(readFileSync(new URL('../public/data/draws.json', import.meta.url), 'utf8')).draws;

// Netlify Blobs จำลอง
function memoryStore() {
  const m = new Map();
  return { get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); } };
}
beforeEach(() => {
  setSettingsStore(memoryStore());
  Object.assign(process.env, { ADMIN_USERNAME: 'boss', ADMIN_PASSWORD: 'pass-1234', LINE_CHANNEL_SECRET: 'sec', ALERT_ADMIN_KEY: 'admin-key' });
});

test('normalizeSettings: เติมค่าเริ่มต้นและกันค่าผิด', () => {
  assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS);
  const s = normalizeSettings({ botId: 'hack', picks: { last2: 99, float: 0 }, public: { bot: 'yes' }, commands: false });
  assert.equal(s.botId, 'adaptive');
  assert.equal(s.picks.last2, 10);
  assert.equal(s.picks.float, 1);
  assert.equal(s.public.bot, false);
  assert.equal(s.commands, false);
});

test('saveSettings รวมค่าบางส่วนกับของเดิม', async () => {
  await saveSettings({ autoPicks: false, picks: { last2: 3 } });
  const s = await getSettings();
  assert.equal(s.autoPicks, false);
  assert.equal(s.picks.last2, 3);
  assert.equal(s.picks.last3, DEFAULT_SETTINGS.picks.last3);
});

test('login/verifyToken: รหัสถูก ได้ token · ผิด/หมดอายุ/ปลอม ใช้ไม่ได้', () => {
  assert.ok(login('boss', 'wrong').error);
  assert.ok(login('admin', 'pass-1234').error);
  const { token, exp } = login('boss', 'pass-1234', 1000);
  assert.ok(verifyToken(token, 2000));
  assert.ok(!verifyToken(token, exp + 1));
  assert.ok(!verifyToken(token.slice(0, -2) + 'xx', 2000));
  process.env.ADMIN_PASSWORD = 'changed';
  assert.ok(!verifyToken(token, 2000), 'เปลี่ยนรหัสแล้ว token เดิมต้องใช้ไม่ได้');
});

test('isAuthorized: Bearer token หรือ x-admin-key', () => {
  const { token } = login('boss', 'pass-1234');
  assert.ok(isAuthorized(new Request('https://x', { headers: { authorization: `Bearer ${token}` } })));
  assert.ok(isAuthorized(new Request('https://x', { headers: { 'x-admin-key': 'admin-key' } })));
  assert.ok(!isAuthorized(new Request('https://x', { headers: { authorization: 'Bearer nope' } })));
  assert.ok(!isAuthorized(new Request('https://x')));
});

test('API: login → อ่าน/บันทึกการตั้งค่า, หน้าเว็บเห็นแค่ public', async () => {
  const post = (url, body, headers = {}) => new Request(url, { method: 'POST', body: JSON.stringify(body), headers });
  assert.equal((await adminLogin(post('https://x/api/admin/login', { username: 'boss', password: 'x' }))).status, 401);
  const { token } = await (await adminLogin(post('https://x/api/admin/login', { username: 'boss', password: 'pass-1234' }))).json();
  assert.equal((await adminSettings(new Request('https://x/api/admin/settings'))).status, 401);
  const auth = { authorization: `Bearer ${token}` };
  const saved = await (await adminSettings(post('https://x/api/admin/settings', { public: { backtest: true } }, auth))).json();
  assert.equal(saved.public.backtest, true);
  const pub = await (await publicSettings(new Request('https://x/api/settings'))).json();
  assert.deepEqual(Object.keys(pub), ['public']);
  assert.equal(pub.public.backtest, true);
});

test('ตรวจรางวัล: หลายใบ เลือกงวดได้', () => {
  assert.deepEqual(parseTickets('011781, 12345 123456\n011781'), ['011781', '123456']);
  const last = draws.at(-1);
  const r = checkTickets(draws, [last.first, '999999']);
  assert.equal(r.draw.date, last.date);
  assert.ok(r.results[0].won.includes('first'));
  assert.ok(r.total >= 6_000_000);
  const prev = draws.at(-2);
  assert.ok(checkTickets(draws, [prev.first], prev.date).results[0].won.includes('first'));
  assert.ok(checkTickets(draws, ['123456'], '1999-01-01').error);
});

test('เลขลอย: คืนหลักเดียวไม่ซ้ำ และใช้เฉพาะประวัติที่ให้', () => {
  const h = draws.slice(0, 100);
  for (const kind of ['top', 'bottom']) {
    const f = floatingDigits(h, kind, 3);
    assert.equal(f.picks.length, 3);
    assert.equal(new Set(f.picks.map((p) => p.digit)).size, 3);
    for (const p of f.picks) assert.match(p.digit, /^\d$/);
  }
  assert.ok(Math.abs(floatingDigits(h, 'top').chance - 0.271) < 0.001);
});

test('ปิดการตอบคำสั่งจากหน้า Admin → bot ไม่ตอบ (ยกเว้น groupid)', async () => {
  const { handleEvent } = await import('../netlify/functions/line-webhook.mjs');
  const off = normalizeSettings({ commands: false });
  const ev = (text) => ({ type: 'message', source: { type: 'group', groupId: 'Cabc' }, message: { type: 'text', text } });
  assert.equal(await handleEvent(ev('เลขเด็ด'), 'https://x', off), null);
  assert.match((await handleEvent(ev('groupid'), 'https://x', off))[0].text, /Cabc/);
});
