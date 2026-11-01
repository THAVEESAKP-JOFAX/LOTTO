// GET/POST /api/admin/site-lock — เปิด/ปิดการล็อกหน้าเว็บและตั้งรหัสผ่านของผู้เข้าชม (ต้องเข้าสู่ระบบ Admin)
// POST { enabled?: boolean, password?: string } · หน้า Admin เองไม่ถูกล็อกเสมอ
import { isAuthorized, json } from '../lib/auth.mjs';
import { getLock, saveLock, publicState } from '../lib/site-lock.mjs';

export const config = { path: '/api/admin/site-lock' };

export default async (req) => {
  if (!isAuthorized(req)) return json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, 401);
  try {
    if (req.method === 'GET') return json(publicState(await getLock()));
    if (req.method !== 'POST') return json({ error: 'GET หรือ POST เท่านั้น' }, 405);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400);
    const r = await saveLock({ enabled: body.enabled === undefined ? undefined : Boolean(body.enabled), password: body.password });
    if (r.error) return json({ error: r.error }, 400);
    return json(publicState(r.lock));
  } catch (err) {
    return json({ error: `บันทึกไม่สำเร็จ: ${err.message}` }, 500);
  }
};
