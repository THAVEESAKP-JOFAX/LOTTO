// Webhook ของ LINE OA: ตอบคำสั่งในกลุ่ม และบอก Group ID เมื่อ bot ถูกเชิญเข้ากลุ่ม
// ตั้ง Webhook URL ใน LINE Developers เป็น https://<เว็บ>/api/line/webhook
import { verifySignature, reply } from '../lib/line.mjs';
import { loadDraws } from '../lib/data.mjs';
import { picksMessage, resultMessage, HELP_TEXT } from '../../src/lib/line-messages.js';
import { upcomingDraw, todayInThailand } from '../../src/lib/schedule.js';

export const config = { path: '/api/line/webhook' };

export async function handleEvent(ev, siteUrl) {
  const groupId = ev.source?.groupId;
  if (ev.type === 'join' && groupId) {
    return [{ type: 'text', text: `สวัสดีครับ 🧠 LOTTO Bot เข้ากลุ่มแล้ว\nGroup ID: ${groupId}\nนำค่านี้ไปใส่ใน LINE_GROUP_IDS บน Netlify เพื่อรับแจ้งเตือนอัตโนมัติ\n\n${HELP_TEXT}` }];
  }
  if (ev.type !== 'message' || ev.message?.type !== 'text') return null;
  const cmd = ev.message.text.trim().toLowerCase();
  if (/^(groupid|group id|ไอดีกลุ่ม)$/.test(cmd)) {
    return [{ type: 'text', text: groupId ? `Group ID: ${groupId}` : 'คำสั่งนี้ใช้ได้ในกลุ่มเท่านั้น' }];
  }
  if (/^(เลขเด็ด|bot|เลขbot|เลข bot)$/.test(cmd)) {
    const draws = await loadDraws(siteUrl);
    return [picksMessage(upcomingDraw(draws.at(-1).date, todayInThailand()), draws, siteUrl)];
  }
  if (/^(ผลหวย|ผล|หวยออก|result)$/.test(cmd)) {
    const draws = await loadDraws(siteUrl);
    return [resultMessage(draws.at(-1), draws, siteUrl)];
  }
  if (/^(help|ช่วยเหลือ|คำสั่ง)$/.test(cmd)) return [{ type: 'text', text: HELP_TEXT }];
  return null; // ข้อความอื่นในกลุ่มไม่ต้องตอบ
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('LINE webhook OK');
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('x-line-signature'), process.env.LINE_CHANNEL_SECRET)) {
    return new Response('invalid signature', { status: 401 });
  }
  const { events = [] } = JSON.parse(raw);
  for (const ev of events) {
    try {
      const messages = await handleEvent(ev, process.env.URL);
      if (messages && ev.replyToken) await reply(ev.replyToken, messages);
    } catch (err) {
      console.error('line-webhook', err);
    }
  }
  return new Response('ok');
};
