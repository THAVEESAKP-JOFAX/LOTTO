// POST /api/admin/rich-menu — ติดตั้ง Rich Menu ให้ LINE OA จากหน้า Admin (ใช้ token ที่ตั้งไว้ใน Netlify)
import { isAuthorized, json } from '../lib/auth.mjs';
import { installRichMenu } from '../lib/rich-menu.mjs';
import { recordActivity } from '../lib/settings.mjs';

export const config = { path: '/api/admin/rich-menu' };

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST เท่านั้น' }, 405);
  if (!isAuthorized(req)) return json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, 401);
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return json({ error: 'ยังไม่ได้กำหนด LINE_CHANNEL_ACCESS_TOKEN ใน Netlify' }, 400);
  try {
    const img = await fetch(`${process.env.URL}/line/rich-menu.jpg`, { signal: AbortSignal.timeout(8000) });
    if (!img.ok) throw new Error(`โหลดรูปเมนูไม่สำเร็จ (${img.status})`);
    const result = await installRichMenu(token, Buffer.from(await img.arrayBuffer()));
    await recordActivity('richMenu', { ok: true, id: result.richMenuId });
    return json({ ok: true, ...result });
  } catch (err) {
    await recordActivity('richMenu', { ok: false, error: err.message });
    return json({ error: err.message }, 502);
  }
};
