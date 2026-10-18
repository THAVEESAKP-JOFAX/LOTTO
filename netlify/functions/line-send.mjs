// ส่งแจ้งเตือนเข้ากลุ่ม LINE จากหน้าเว็บ (ต้องใส่รหัสผู้ดูแล ALERT_ADMIN_KEY)
import { timingSafeEqual } from 'node:crypto';
import { pushToGroups } from '../lib/line.mjs';
import { loadDraws } from '../lib/data.mjs';
import { picksMessage, resultMessage } from '../../src/lib/line-messages.js';
import { upcomingDraw, todayInThailand } from '../../src/lib/schedule.js';

export const config = { path: '/api/line/send' };

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function authorized(key) {
  const expected = process.env.ALERT_ADMIN_KEY;
  if (!expected || !key) return false;
  const a = Buffer.from(expected), b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!authorized(req.headers.get('x-admin-key'))) return json({ error: 'รหัสผู้ดูแลไม่ถูกต้อง' }, 401);
  const { type } = await req.json().catch(() => ({}));
  try {
    const draws = await loadDraws(process.env.URL);
    let message;
    if (type === 'picks') message = picksMessage(upcomingDraw(draws.at(-1).date, todayInThailand()), draws, process.env.URL);
    else if (type === 'result') message = resultMessage(draws.at(-1), draws, process.env.URL);
    else if (type === 'test') message = { type: 'text', text: '✅ ทดสอบการเชื่อมต่อ LOTTO Analytics → LINE สำเร็จ' };
    else return json({ error: 'type ต้องเป็น picks, result หรือ test' }, 400);
    const groups = await pushToGroups(message);
    return json({ ok: true, groups });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
};
