// แจ้งเตือนอัตโนมัติ: เช้าวันออกรางวัล 09:00 น. (เวลาไทย) ส่งเลขของ bot เข้ากลุ่ม
import { pushToGroups } from '../lib/line.mjs';
import { getSettings, recordActivity } from '../lib/settings.mjs';
import { loadDraws } from '../lib/data.mjs';
import { picksMessage } from '../../src/lib/line-messages.js';
import { isDrawDay, todayInThailand } from '../../src/lib/schedule.js';

export const config = { schedule: '0 2 * * *' }; // 02:00 UTC = 09:00 น.

export default async () => {
  const today = todayInThailand();
  if (!isDrawDay(today)) return new Response(`skip: ${today} ไม่ใช่วันออกรางวัล`);
  const settings = await getSettings();
  if (!settings.autoPicks) return new Response('skip: ปิดการส่งเลขอัตโนมัติไว้ในหน้า Admin');
  const draws = await loadDraws(process.env.URL);
  try {
    const n = await pushToGroups(picksMessage(today, draws, process.env.URL, settings));
    await recordActivity('picks', { ok: true, date: today, groups: n });
    return new Response(`sent picks for ${today} to ${n} group(s)`);
  } catch (err) {
    await recordActivity('picks', { ok: false, date: today, error: err.message });
    throw err;
  }
};
