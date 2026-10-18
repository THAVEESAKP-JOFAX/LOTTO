// GET/POST /api/admin/settings — อ่าน/แก้การตั้งค่า bot (ต้องเข้าสู่ระบบ)
import { isAuthorized, json } from '../lib/auth.mjs';
import { getSettings, saveSettings } from '../lib/settings.mjs';

export const config = { path: '/api/admin/settings' };

export default async (req) => {
  if (!isAuthorized(req)) return json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, 401);
  if (req.method === 'GET') return json(await getSettings());
  if (req.method !== 'POST') return json({ error: 'GET หรือ POST เท่านั้น' }, 405);
  const patch = await req.json().catch(() => null);
  if (!patch || typeof patch !== 'object') return json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400);
  try {
    return json(await saveSettings(patch));
  } catch (err) {
    return json({ error: `บันทึกไม่สำเร็จ: ${err.message}` }, 500);
  }
};
