// GET /api/admin/status — สถานะการทำงานของ bot สำหรับแดชบอร์ด (ต้องเข้าสู่ระบบ)
// บอกเฉพาะว่าตั้งค่าแล้วหรือยัง ไม่ส่งค่า token/secret ออกไป
import { isAuthorized, json } from '../lib/auth.mjs';
import { getSettings, getActivity, readJSON } from '../lib/settings.mjs';
import { groupIds } from '../lib/line.mjs';
import { checkGlo, OFFICIAL_KEY } from '../lib/data.mjs';
import { getLock } from '../lib/site-lock.mjs';

export const config = { path: '/api/admin/status' };

export default async (req) => {
  if (!isAuthorized(req)) return json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, 401);
  const [settings, activity, glo, official, siteLock] = await Promise.all([
    getSettings(), getActivity(), checkGlo(), readJSON(OFFICIAL_KEY),
    getLock().then((l) => ({ enabled: l.enabled })).catch(() => null),
  ]);
  return json({
    line: {
      token: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN),
      secret: Boolean(process.env.LINE_CHANNEL_SECRET),
      groups: groupIds().length,
    },
    glo,
    siteLock,
    // งวดที่ยืนยันกับผลทางการของกองสลากแล้ว
    official: { dates: Object.keys(official?.draws ?? {}).sort(), last: official?.last ?? null },
    settings,
    activity,
    now: new Date().toISOString(),
  });
};
