// GET /api/admin/status — สถานะการทำงานของ bot สำหรับแดชบอร์ด (ต้องเข้าสู่ระบบ)
// บอกเฉพาะว่าตั้งค่าแล้วหรือยัง ไม่ส่งค่า token/secret ออกไป
import { isAuthorized, json } from '../lib/auth.mjs';
import { getSettings, getActivity } from '../lib/settings.mjs';
import { groupIds } from '../lib/line.mjs';
import { checkGlo } from '../lib/data.mjs';

export const config = { path: '/api/admin/status' };

export default async (req) => {
  if (!isAuthorized(req)) return json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, 401);
  const [settings, activity, glo] = await Promise.all([getSettings(), getActivity(), checkGlo()]);
  return json({
    line: {
      token: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN),
      secret: Boolean(process.env.LINE_CHANNEL_SECRET),
      groups: groupIds().length,
    },
    glo,
    settings,
    activity,
    now: new Date().toISOString(),
  });
};
