// แจ้งเตือนอัตโนมัติ: ทุก 30 นาที ช่วง 15:30–18:30 น. (เวลาไทย) ตรวจว่ามีผลงวดใหม่หรือยัง
// ส่งครั้งเดียวต่องวด (จำงวดที่ส่งแล้วใน Netlify Blobs) — รองรับงวดที่เลื่อนวันด้วย
import { getStore } from '@netlify/blobs';
import { pushToGroups } from '../lib/line.mjs';
import { loadDraws } from '../lib/data.mjs';
import { resultMessage } from '../../src/lib/line-messages.js';
import { todayInThailand } from '../../src/lib/schedule.js';

export const config = { schedule: '*/30 8-11 * * *' }; // 08:00–11:30 UTC

export default async () => {
  const store = getStore('line-alerts');
  const draws = await loadDraws(process.env.URL);
  const latest = draws.at(-1);
  const today = todayInThailand();
  if (latest.date !== today) return new Response(`no result for ${today} yet`);
  if ((await store.get('last-result')) === latest.date) return new Response('already sent');
  const n = await pushToGroups(resultMessage(latest, draws, process.env.URL));
  await store.set('last-result', latest.date);
  return new Response(`sent result ${latest.date} to ${n} group(s)`);
};
