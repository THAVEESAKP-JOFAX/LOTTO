// แจ้งเตือนอัตโนมัติ: ทุก 30 นาที ช่วง 15:00–22:30 น. (เวลาไทย) ตรวจว่ามีผลงวดใหม่หรือยัง
// ผลที่ออกช้า (หลังรอบสุดท้าย) จะส่งในรอบแรกของวันถัดไป
// ส่งครั้งเดียวต่องวด (จำงวดที่ส่งแล้วใน Netlify Blobs) — รองรับงวดที่เลื่อนวันด้วย
import { getStore } from '@netlify/blobs';
import { pushToGroups } from '../lib/line.mjs';
import { getSettings, recordActivity } from '../lib/settings.mjs';
import { loadDraws } from '../lib/data.mjs';
import { resultMessage } from '../../src/lib/line-messages.js';
import { todayInThailand } from '../../src/lib/schedule.js';

export const config = { schedule: '*/30 8-15 * * *' }; // 08:00–15:30 UTC

export default async () => {
  const settings = await getSettings();
  if (!settings.autoResult) return new Response('skip: ปิดการส่งผลอัตโนมัติไว้ในหน้า Admin');
  const store = getStore('line-alerts');
  const draws = await loadDraws(process.env.URL);
  const latest = draws.at(-1);
  const today = todayInThailand();
  const yesterday = todayInThailand(new Date(Date.now() - 864e5));
  if (latest.date < yesterday) return new Response(`no result for ${today} yet`);
  if ((await store.get('last-result')) === latest.date) return new Response('already sent');
  let n;
  try {
    n = await pushToGroups(resultMessage(latest, draws, process.env.URL, settings));
  } catch (err) {
    await recordActivity('result', { ok: false, date: latest.date, error: err.message });
    throw err;
  }
  await store.set('last-result', latest.date);
  await recordActivity('result', { ok: true, date: latest.date, groups: n });
  return new Response(`sent result ${latest.date} to ${n} group(s)`);
};
