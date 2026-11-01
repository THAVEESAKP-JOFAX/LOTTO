// POST /api/site-lock/login { password } — ผู้เข้าชมใส่รหัสผ่านเพื่อดูหน้าเว็บ → ตั้งคุกกี้ (HttpOnly) ถ้าถูกต้อง
import { loginVisitor, setCookieHeader } from '../lib/site-lock.mjs';

export const config = { path: '/api/site-lock/login' };

const reply = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

export default async (req) => {
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);
  const { password } = await req.json().catch(() => ({}));
  try {
    const r = await loginVisitor(password);
    if (r.error) {
      await new Promise((resolve) => setTimeout(resolve, 800)); // ชะลอการเดารหัส
      return reply({ error: r.error }, 401);
    }
    return reply({ ok: true }, 200, r.token ? { 'set-cookie': setCookieHeader(r.token) } : {});
  } catch (err) {
    console.error('site-lock login', err.message);
    return reply({ error: 'ระบบไม่พร้อมใช้งานชั่วคราว ลองใหม่อีกครั้ง' }, 503);
  }
};
