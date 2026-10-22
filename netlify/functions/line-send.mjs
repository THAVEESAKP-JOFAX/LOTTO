// ส่งแจ้งเตือนเข้ากลุ่ม LINE จากหน้า Admin (ต้องเข้าสู่ระบบ หรือใช้ ALERT_ADMIN_KEY)
import { pushToGroups } from '../lib/line.mjs';
import { loadDraws } from '../lib/data.mjs';
import { isAuthorized, json } from '../lib/auth.mjs';
import { getSettings, recordActivity } from '../lib/settings.mjs';
import { picksMessage, resultMessage } from '../../src/lib/line-messages.js';
import { upcomingDraw, todayInThailand } from '../../src/lib/schedule.js';

export const config = { path: '/api/line/send' };

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!isAuthorized(req)) return json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, 401);
  const { type } = await req.json().catch(() => ({}));
  try {
    const [draws, settings] = await Promise.all([loadDraws(process.env.URL), getSettings()]);
    let message;
    if (type === 'picks') message = picksMessage(upcomingDraw(draws.at(-1).date, todayInThailand()), draws, process.env.URL, settings);
    else if (type === 'result') message = resultMessage(draws.at(-1), draws, process.env.URL, settings);
    else if (type === 'test') message = { type: 'text', text: '✅ ทดสอบการเชื่อมต่อ LOTTO-THAI → LINE สำเร็จ' };
    else return json({ error: 'type ต้องเป็น picks, result หรือ test' }, 400);
    const groups = await pushToGroups(message);
    await recordActivity('manual', { ok: true, type, groups });
    return json({ ok: true, groups });
  } catch (err) {
    await recordActivity('manual', { ok: false, type, error: err.message });
    return json({ error: err.message }, 500);
  }
};
