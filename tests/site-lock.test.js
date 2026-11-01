import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setSettingsStore } from '../netlify/lib/settings.mjs';
import {
  getLock, saveLock, publicState, makeToken, verifyToken, cookieValue, checkAccess, loginVisitor, COOKIE, TTL_S,
} from '../netlify/lib/site-lock.mjs';
import check from '../netlify/functions/site-lock-check.mjs';
import visitorLogin from '../netlify/functions/site-lock-login.mjs';
import adminLock from '../netlify/functions/admin-site-lock.mjs';
import adminLogin from '../netlify/functions/admin-login.mjs';
import edge, { lockPage } from '../netlify/edge-functions/site-lock.js';

const realEnv = { ...process.env };
let mem, broken;
beforeEach(() => {
  mem = new Map(); broken = false;
  setSettingsStore({
    get: async (k) => { if (broken) throw new Error('blobs down'); return mem.get(k) ?? null; },
    setJSON: async (k, v) => { if (broken) throw new Error('blobs down'); mem.set(k, JSON.parse(JSON.stringify(v))); },
  });
  Object.assign(process.env, { ALERT_ADMIN_KEY: 'admin-key', LINE_CHANNEL_SECRET: 'line-secret', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'admin-pass' });
});
afterEach(() => {
  process.env = { ...realEnv };
  setSettingsStore({ get: async () => null, setJSON: async () => {} });
});

const req = (url, init = {}) => new Request(`https://site.test${url}`, init);
const adminHeaders = { 'x-admin-key': 'admin-key', 'content-type': 'application/json' };
const setLock = (body) => adminLock(req('/api/admin/site-lock', { method: 'POST', headers: adminHeaders, body: JSON.stringify(body) }));

test('ล็อกเว็บ: ต้องตั้งรหัสผ่านก่อนเปิด · รหัสผ่านสั้นไป/ยาวไปไม่รับ · เก็บเฉพาะ hash', async () => {
  assert.deepEqual(publicState(await getLock()), { enabled: false, hasPassword: false, updatedAt: null });
  assert.match((await saveLock({ enabled: true })).error, /ตั้งรหัสผ่านก่อน/);
  assert.match((await saveLock({ enabled: true, password: '12345' })).error, /อย่างน้อย 6/);
  assert.match((await saveLock({ enabled: true, password: 'x'.repeat(65) })).error, /ไม่เกิน 64/);
  const r = await saveLock({ enabled: true, password: 'family2569' });
  assert.equal(r.lock.enabled, true);
  const stored = JSON.stringify([...mem.values()]);
  assert.doesNotMatch(stored, /family2569/); // ไม่เก็บรหัสผ่านจริง
  assert.match(stored, /"hash":"/);
  // ปิดแล้วเปิดใหม่ได้โดยไม่ต้องกรอกรหัสซ้ำ (hash เดิมยังอยู่)
  await saveLock({ enabled: false });
  assert.equal((await getLock()).enabled, false);
  assert.equal((await saveLock({ enabled: true })).lock.enabled, true);
});

test('ล็อกเว็บ: token ลงลายเซ็น หมดอายุ/ถูกแก้/เปลี่ยนรหัสผ่านแล้วใช้ไม่ได้', async () => {
  await saveLock({ enabled: true, password: 'family2569' });
  const lock = await getLock();
  const now = Date.now();
  const token = makeToken(lock, now);
  assert.equal(verifyToken(lock, token, now + 1000), true);
  assert.equal(verifyToken(lock, token, now + TTL_S * 1000 + 1000), false); // หมดอายุ 7 วัน
  const [payload, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ exp: now + 9e12 })).toString('base64url');
  assert.equal(verifyToken(lock, `${forged}.${sig}`, now), false);
  assert.equal(verifyToken(lock, `${payload}.${sig.slice(0, -2)}xx`, now), false);
  assert.equal(verifyToken(lock, '', now), false);
  await saveLock({ password: 'newpass2570' }); // เปลี่ยนรหัสผ่าน → คุกกี้เก่าใช้ไม่ได้ทันที
  assert.equal(verifyToken(await getLock(), token, now), false);
  assert.equal(cookieValue(`a=1; ${COOKIE}=abc.def; b=2`), 'abc.def');
  assert.equal(cookieValue('a=1'), '');
});

test('/api/site-lock: ผู้เข้าชมใส่รหัสถูก → ได้คุกกี้ HttpOnly แล้วเข้าได้ · รหัสผิดถูกปฏิเสธ', async () => {
  const state = async (cookie) => (await check(req('/api/site-lock/check', { headers: cookie ? { cookie } : {} }))).json();
  assert.deepEqual(await state(), { locked: false, allowed: true }); // ยังไม่เปิดล็อก → ทุกคนเข้าได้
  await setLock({ enabled: true, password: 'family2569' });
  assert.deepEqual(await state(), { locked: true, allowed: false });
  const bad = await visitorLogin(req('/api/site-lock/login', { method: 'POST', body: JSON.stringify({ password: 'wrong-pass' }) }));
  assert.equal(bad.status, 401);
  assert.equal(bad.headers.get('set-cookie'), null);
  assert.equal((await visitorLogin(req('/api/site-lock/login', { method: 'POST', body: '{}' }))).status, 401);
  assert.equal((await visitorLogin(req('/api/site-lock/login', { method: 'GET' }))).status, 405);
  const ok = await visitorLogin(req('/api/site-lock/login', { method: 'POST', body: JSON.stringify({ password: 'family2569' }) }));
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Lax/);
  const pair = cookie.split(';')[0];
  assert.deepEqual(await state(pair), { locked: true, allowed: true });
  assert.deepEqual(await state(`${COOKIE}=bogus.token`), { locked: true, allowed: false });
  // เปลี่ยนรหัสผ่าน → คุกกี้เดิมเข้าไม่ได้
  await setLock({ password: 'another-pass' });
  assert.deepEqual(await state(pair), { locked: true, allowed: false });
  // ปิดล็อก → ทุกคนเข้าได้
  await setLock({ enabled: false });
  assert.deepEqual(await state(), { locked: false, allowed: true });
});

test('/api/site-lock/check: อ่านค่าไม่ได้ → 503 (ให้ฝั่ง Edge ตัดสินเอง) ไม่ใช่ตอบว่าเข้าได้', async () => {
  broken = true;
  const res = await check(req('/api/site-lock/check'));
  assert.equal(res.status, 503);
  await assert.rejects(() => loginVisitor('x'), /blobs down/);
});

test('/api/admin/site-lock: ต้องเข้าสู่ระบบ Admin · ไม่ส่ง hash/รหัสผ่านกลับ · ตรวจรหัสผ่านฝั่งเซิร์ฟเวอร์', async () => {
  assert.equal((await adminLock(req('/api/admin/site-lock'))).status, 401);
  assert.equal((await adminLock(req('/api/admin/site-lock', { method: 'POST', body: '{}' }))).status, 401);
  assert.deepEqual(await (await adminLock(req('/api/admin/site-lock', { headers: adminHeaders }))).json(), { enabled: false, hasPassword: false, updatedAt: null });
  assert.equal((await setLock({ enabled: true })).status, 400);
  assert.equal((await setLock({ enabled: true, password: 'abc' })).status, 400);
  const res = await setLock({ enabled: true, password: 'family2569' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.enabled, true); assert.equal(body.hasPassword, true);
  assert.doesNotMatch(JSON.stringify(body), /hash|salt|family2569/);
  broken = true;
  assert.equal((await setLock({ enabled: false })).status, 500); // เขียนไม่สำเร็จต้องบอก ไม่เงียบ
});

test('Admin เข้าสู่ระบบแล้วดูหน้าเว็บที่ล็อกอยู่ได้เลย (ออกคุกกี้ให้) · ถ้าไม่ได้ล็อกไม่ออกคุกกี้', async () => {
  const login = () => adminLogin(req('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'admin-pass' }) }));
  const free = await login();
  assert.equal(free.status, 200);
  assert.equal(free.headers.get('set-cookie'), null);
  await saveLock({ enabled: true, password: 'family2569' });
  const locked = await login();
  assert.equal(locked.status, 200);
  assert.ok((await locked.json()).token); // ยังได้ token Admin ตามเดิม
  const pair = locked.headers.get('set-cookie').split(';')[0];
  assert.equal((await checkAccess(req('/', { headers: { cookie: pair } }))).allowed, true);
});

// --- Edge function ---
const ctx = () => { const c = { nexts: 0, next: async () => { c.nexts++; return new Response('INDEX'); } }; return c; };
const withFetch = async (impl, fn) => { const real = globalThis.fetch; globalThis.fetch = impl; try { return await fn(); } finally { globalThis.fetch = real; } };
const checkReply = (state) => async () => new Response(JSON.stringify(state));

test('Edge: ตรวจไม่สำเร็จและไม่เคยรู้ว่าล็อก → เปิดให้ดูตามเดิม (หน้าเว็บไม่ล่ม)', async () => {
  const c = ctx();
  const res = await withFetch(async () => { throw new TypeError('fetch failed'); }, () => edge(req('/', { headers: { cookie: 'edge=a' } }), c));
  assert.equal(await res.text(), 'INDEX'); assert.equal(c.nexts, 1);
});

test('Edge: ไม่ได้ล็อก/ผ่านรหัสแล้ว → แสดงหน้าเว็บ · ถูกล็อกและไม่มีสิทธิ์ → หน้ากรอกรหัสผ่าน (401, ไม่แสดงหน้าเว็บ)', async () => {
  let c = ctx();
  let res = await withFetch(checkReply({ locked: false, allowed: true }), () => edge(req('/', { headers: { cookie: 'edge=b' } }), c));
  assert.equal(await res.text(), 'INDEX');
  c = ctx();
  res = await withFetch(checkReply({ locked: true, allowed: true }), () => edge(req('/index.html', { headers: { cookie: 'edge=c' } }), c));
  assert.equal(await res.text(), 'INDEX');

  c = ctx();
  let asked;
  res = await withFetch(async (url, init) => { asked = { url: String(url), cookie: init.headers.cookie }; return new Response(JSON.stringify({ locked: true, allowed: false })); },
    () => edge(req('/', { headers: { cookie: 'edge=d' } }), c));
  assert.equal(res.status, 401);
  assert.equal(c.nexts, 0); // ไม่ส่งหน้าเว็บจริงให้
  assert.equal(asked.url, 'https://site.test/api/site-lock/check');
  assert.equal(asked.cookie, 'edge=d');
  const html = await res.text();
  assert.match(html, /\/api\/site-lock\/login/); assert.match(html, /type="password"/);
  assert.doesNotMatch(html, /INDEX/);
  assert.match(res.headers.get('cache-control'), /no-store/);
  assert.match(res.headers.get('x-robots-tag'), /noindex/);
  assert.equal(html, lockPage());
});

test('Edge: เคยรู้ว่าล็อกอยู่แล้วเช็กไม่สำเร็จ → ไม่เปิดให้ดู (ยกเว้นคนที่เพิ่งผ่านรหัสมาแล้ว) · POST ไม่ถูกขวาง', async () => {
  // รอบก่อนหน้ารู้แล้วว่าล็อกอยู่ (edge=d ถูกปฏิเสธ) → คนใหม่ที่เช็กไม่สำเร็จต้องไม่เห็นหน้าเว็บ
  let c = ctx();
  const down = async () => { throw new TypeError('fetch failed'); };
  let res = await withFetch(down, () => edge(req('/', { headers: { cookie: 'edge=new' } }), c));
  assert.equal(res.status, 401); assert.equal(c.nexts, 0);
  // คนที่เคยเช็กผ่านแล้ว (edge=c) ใช้ผลที่จำไว้
  c = ctx();
  res = await withFetch(down, () => edge(req('/', { headers: { cookie: 'edge=c' } }), c));
  assert.equal(await res.text(), 'INDEX');
  // วิธีอื่นที่ไม่ใช่ GET/HEAD ผ่านไปตามเดิม
  c = ctx();
  await withFetch(down, () => edge(req('/', { method: 'POST' }), c));
  assert.equal(c.nexts, 1);
});
