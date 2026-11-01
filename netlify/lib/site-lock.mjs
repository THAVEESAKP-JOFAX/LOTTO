// ล็อกหน้าเว็บสำหรับผู้เข้าชม: เปิด/ปิดและตั้งรหัสผ่านจากหน้า Admin
// - เก็บเฉพาะ hash ของรหัสผ่าน (scrypt + salt) ใน Netlify Blobs ไม่เก็บรหัสผ่านจริง
// - ผู้เข้าชมใส่รหัสถูก → ได้คุกกี้ลงลายเซ็น (HMAC) อายุ 7 วัน · เปลี่ยนรหัสผ่านแล้วคุกกี้เดิมใช้ไม่ได้ทันที
// - Edge function (netlify/edge-functions/site-lock.js) ถามสถานะจาก /api/site-lock/check ก่อนแสดงหน้าเว็บ
import { createHmac, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readJSONStrict, writeJSONStrict } from './settings.mjs';

const KEY = 'site-lock';
export const COOKIE = 'lotto_site';
export const TTL_S = 7 * 86400;
export const MIN_LEN = 6;
export const MAX_LEN = 64;

const same = (a, b) => {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
};
const hashPassword = (password, salt) => scryptSync(String(password), salt, 32).toString('base64');

// ค่าที่เก็บไว้: { enabled, hash, salt, updatedAt } · โยนข้อผิดพลาดถ้าอ่าน Blobs ไม่ได้
export async function getLock() {
  const c = (await readJSONStrict(KEY)) ?? {};
  return { enabled: Boolean(c.enabled && c.hash), hash: c.hash ?? null, salt: c.salt ?? null, updatedAt: c.updatedAt ?? null };
}

// ข้อมูลที่ส่งให้หน้า Admin (ไม่มี hash)
export const publicState = (lock) => ({ enabled: lock.enabled, hasPassword: Boolean(lock.hash), updatedAt: lock.updatedAt });

export async function saveLock({ enabled, password }) {
  const cur = await getLock();
  let { hash, salt } = cur;
  if (password !== undefined && password !== null && password !== '') {
    const pw = String(password);
    if (pw.length < MIN_LEN) return { error: `รหัสผ่านต้องยาวอย่างน้อย ${MIN_LEN} ตัวอักษร` };
    if (pw.length > MAX_LEN) return { error: `รหัสผ่านต้องไม่เกิน ${MAX_LEN} ตัวอักษร` };
    salt = randomBytes(16).toString('base64');
    hash = hashPassword(pw, salt);
  }
  const on = Boolean(enabled ?? cur.enabled);
  if (on && !hash) return { error: 'กรุณาตั้งรหัสผ่านก่อนเปิดการล็อก' };
  const next = { enabled: on, hash, salt, updatedAt: new Date().toISOString() };
  await writeJSONStrict(KEY, next);
  return { lock: { ...next, enabled: on } };
}

// คีย์ลงลายเซ็นผูกกับ hash ของรหัสผ่าน → เปลี่ยนรหัสผ่านแล้วคุกกี้เก่าใช้ไม่ได้
const signingKey = (lock) => createHash('sha256')
  .update(`lotto-site:${lock.hash}:${process.env.LINE_CHANNEL_SECRET || ''}:${process.env.ALERT_ADMIN_KEY || ''}`).digest();
const sign = (lock, payload) => createHmac('sha256', signingKey(lock)).update(payload).digest('base64url');

export function makeToken(lock, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ exp: now + TTL_S * 1000 })).toString('base64url');
  return `${payload}.${sign(lock, payload)}`;
}

export function verifyToken(lock, token, now = Date.now()) {
  if (!lock.hash || !token) return false;
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig || !same(sig, sign(lock, payload))) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > now;
  } catch {
    return false;
  }
}

export function cookieValue(header, name = COOKIE) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

export const setCookieHeader = (token) => `${COOKIE}=${token}; Path=/; Max-Age=${TTL_S}; HttpOnly; Secure; SameSite=Lax`;

// ผู้เข้าชมคนนี้เข้าหน้าเว็บได้หรือไม่
export async function checkAccess(req, now = Date.now()) {
  const lock = await getLock();
  if (!lock.enabled) return { locked: false, allowed: true };
  return { locked: true, allowed: verifyToken(lock, cookieValue(req.headers.get('cookie')), now) };
}

// ตรวจรหัสผ่านของผู้เข้าชม → ได้ token ถ้าถูก
export async function loginVisitor(password, now = Date.now()) {
  const lock = await getLock();
  if (!lock.enabled) return { ok: true, token: null };
  if (typeof password !== 'string' || !password || password.length > MAX_LEN) return { error: 'รหัสผ่านไม่ถูกต้อง' };
  if (!same(hashPassword(password, lock.salt), lock.hash)) return { error: 'รหัสผ่านไม่ถูกต้อง' };
  return { ok: true, token: makeToken(lock, now) };
}

// Admin ที่เข้าสู่ระบบแล้วดูหน้าเว็บได้เลย (ใช้ตอน login ของ Admin) — ล็อกไม่เปิดหรืออ่านไม่ได้ก็ไม่ออกคุกกี้
export async function adminVisitorCookie() {
  try {
    const lock = await getLock();
    return lock.enabled ? setCookieHeader(makeToken(lock)) : null;
  } catch {
    return null;
  }
}
