// เข้าสู่ระบบหน้า Admin: ชื่อผู้ใช้ + รหัสผ่านจาก env แล้วออก token ลงลายเซ็น (HMAC) อายุ 12 ชั่วโมง
//   ADMIN_USERNAME (ค่าเริ่มต้น "admin") · ADMIN_PASSWORD (ถ้าไม่ตั้ง ใช้ ALERT_ADMIN_KEY)
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const TTL_MS = 12 * 3600e3;
const username = () => process.env.ADMIN_USERNAME || 'admin';
const password = () => process.env.ADMIN_PASSWORD || process.env.ALERT_ADMIN_KEY || '';
// เปลี่ยนรหัสผ่านแล้ว token เดิมใช้ไม่ได้ทันที
const signingKey = () => createHash('sha256').update(`lotto-admin:${password()}:${process.env.LINE_CHANNEL_SECRET || ''}`).digest();
const b64 = (s) => Buffer.from(s).toString('base64url');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
}

const sign = (payload) => createHmac('sha256', signingKey()).update(payload).digest('base64url');

export function login(user, pass, now = Date.now()) {
  if (!password()) return { error: 'ยังไม่ได้ตั้งรหัสผ่าน (ADMIN_PASSWORD หรือ ALERT_ADMIN_KEY) ใน Netlify' };
  if (!safeEqual(user, username()) || !safeEqual(pass, password())) return { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  const exp = now + TTL_MS;
  const payload = b64(JSON.stringify({ u: username(), exp }));
  return { token: `${payload}.${sign(payload)}`, exp };
}

export function verifyToken(token, now = Date.now()) {
  if (!token || !password()) return false;
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > now;
  } catch {
    return false;
  }
}

// อนุญาตด้วย token (หน้า Admin) หรือ x-admin-key (ALERT_ADMIN_KEY แบบเดิม)
export function isAuthorized(req) {
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (bearer && verifyToken(bearer)) return true;
  const key = req.headers.get('x-admin-key');
  return Boolean(key && process.env.ALERT_ADMIN_KEY && safeEqual(key, process.env.ALERT_ADMIN_KEY));
}

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
