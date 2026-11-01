// POST /api/admin/login { username, password } → { token, exp }
import { login, json } from '../lib/auth.mjs';
import { adminVisitorCookie } from '../lib/site-lock.mjs';

export const config = { path: '/api/admin/login' };

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const { username, password } = await req.json().catch(() => ({}));
  const r = login(username, password);
  if (r.error) {
    await new Promise((resolve) => setTimeout(resolve, 600)); // ชะลอการเดารหัส
    return json({ error: r.error }, 401);
  }
  // Admin ที่เข้าสู่ระบบแล้วดูหน้าเว็บที่ล็อกอยู่ได้เลย โดยไม่ต้องกรอกรหัสผู้เข้าชมอีก
  const cookie = await adminVisitorCookie();
  const res = json(r);
  if (cookie) res.headers.append('set-cookie', cookie);
  return res;
};
