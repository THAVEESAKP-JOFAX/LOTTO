// Webhook ของ LINE OA: ตอบคำสั่งในกลุ่ม และบอก Group ID เมื่อ bot ถูกเชิญเข้ากลุ่ม
// ตั้ง Webhook URL ใน LINE Developers เป็น https://<เว็บ>/api/line/webhook
import { verifySignature, reply, markAsRead } from '../lib/line.mjs';
import { loadDraws } from '../lib/data.mjs';
import { picksMessage, resultMessage, checkText, twoDigitMessage, threeDigitMessage, floatMessage, ticketCheckMessage, drawQuickReply, luckyDayMessage, TICKET_HELP, HELP_TEXT } from '../../src/lib/line-messages.js';
import { getSettings } from '../lib/settings.mjs';
import { parseTickets } from '../../src/lib/ticket-check.js';
import { parseDay, dayOf } from '../../src/lib/lucky-day.js';
import { upcomingDraw, todayInThailand } from '../../src/lib/schedule.js';
import { parseDrawDate, drawQuery } from '../../src/lib/date-query.js';

export const config = { path: '/api/line/webhook' };

// คำสั่งที่ใช้เลขของงวดถัดไป (เทียบหลังตัดช่องว่าง เช่น "เลข 2 ตัว" = "เลข2ตัว")
const NEXT_DRAW_COMMANDS = [
  [/^(เลขเด็ด|bot|เลขbot)$/, (date, draws, s, url) => [picksMessage(date, draws, url, s)]],
  [/^(เลข2ตัว|2ตัว|เลขสองตัว|สองตัว)$/, (date, draws, s) => [twoDigitMessage(date, draws, s)]],
  [/^(เลข3ตัว|3ตัว|เลขสามตัว|สามตัว)$/, (date, draws, s) => [threeDigitMessage(date, draws, s)]],
  [/^(เลขลอยบน|ลอยบน|เลขวิ่งบน|วิ่งบน)$/, (date, draws, s) => [floatMessage('top', date, draws, s)]],
  [/^(เลขลอยล่าง|ลอยล่าง|เลขวิ่งล่าง|วิ่งล่าง)$/, (date, draws, s) => [floatMessage('bottom', date, draws, s)]],
];

export async function handleEvent(ev, siteUrl, settings = null) {
  const groupId = ev.source?.groupId;
  if (ev.type === 'join' && groupId) {
    return [{ type: 'text', text: `สวัสดีครับ 🧠 LOTTO Bot เข้ากลุ่มแล้ว\nGroup ID: ${groupId}\nนำค่านี้ไปใส่ใน LINE_GROUP_IDS บน Netlify เพื่อรับแจ้งเตือนอัตโนมัติ\n\n${HELP_TEXT}` }];
  }
  if (ev.type !== 'message' || ev.message?.type !== 'text') return null;
  const cmd = ev.message.text.trim().toLowerCase();
  if (/^(groupid|group id|ไอดีกลุ่ม)$/.test(cmd)) {
    return [{ type: 'text', text: groupId ? `Group ID: ${groupId}` : 'คำสั่งนี้ใช้ได้ในกลุ่มเท่านั้น' }];
  }
  settings ??= await getSettings();
  if (!settings.commands) return null; // ปิดการตอบคำสั่งไว้ในหน้า Admin
  const compact = cmd.replace(/\s+/g, '');
  const nextCmd = NEXT_DRAW_COMMANDS.find(([re]) => re.test(compact));
  if (nextCmd) {
    const draws = await loadDraws(siteUrl);
    return nextCmd[1](upcomingDraw(draws.at(-1).date, todayInThailand()), draws, settings, siteUrl);
  }
  // เลขมงคลตามวันเกิด: "เลขประจำวัน" (วันนี้) หรือ "เลขประจำวัน จันทร์"
  const luckyCmd = compact.match(/^(?:เลขประจำวัน|เลขมงคล|เลขวันเกิด|เลขประจำวันเกิด)(.*)$/);
  if (luckyCmd) {
    const day = parseDay(luckyCmd[1]);
    if (luckyCmd[1] && !day) return [{ type: 'text', text: 'ไม่รู้จักวันนี้ ลองพิมพ์ เช่น "เลขประจำวัน จันทร์" หรือ "เลขประจำวัน พุธกลางคืน"' }];
    return [luckyDayMessage(day ?? dayOf(todayInThailand()), !day)];
  }
  // ตรวจรางวัล: "ตรวจรางวัล 011781 123456 [งวด 16/10/69]"
  const ticketCmd = cmd.match(/^(?:ตรวจรางวัล|ตรวจหวย|ตรวจสลาก|ตรวจลอตเตอรี่|ตรวจล็อตเตอรี่)\s*(.*)$/s);
  if (ticketCmd) {
    const rest = ticketCmd[1];
    // วันที่ต้องไม่ติดกับตัวเลขข้างหน้า (กันไปกินหลักท้ายของเลขสลาก) · ลองแบบตัวเลขก่อน แล้วค่อยแบบชื่อเดือน
    const dateMatch = rest.match(/(?:งวด\s*)?(?<!\d)(\d{1,2}\s*[/\-.]\s*\d{1,2}\s*[/\-.]\s*\d{2,4})(?!\d)/)
      ?? rest.match(/(?:งวด\s*)?(?<!\d)(\d{1,2}\s*(?!งวด)[ก-๙.]+\s*\d{2,4})(?!\d)/);
    const tickets = parseTickets(dateMatch ? rest.replace(dateMatch[0], ' ') : rest);
    const draws = await loadDraws(siteUrl);
    if (!tickets.length) return [{ type: 'text', text: TICKET_HELP }];
    let date = null;
    if (dateMatch) {
      date = parseDrawDate(dateMatch[1], todayInThailand());
      if (!date || !draws.some((d) => d.date === date)) {
        return [{ type: 'text', text: 'ไม่พบผลของงวดที่ระบุ เลือกงวดจากปุ่มด้านล่างได้เลย', quickReply: drawQuickReply(draws, tickets, null) }];
      }
    }
    return [ticketCheckMessage(draws, tickets, date)];
  }
  if (/^(ผลหวย|ผล|หวยออก|result)$/.test(cmd)) {
    const draws = await loadDraws(siteUrl);
    return [resultMessage(draws.at(-1), draws, siteUrl, settings)];
  }
  const check = cmd.match(/^(?:เช็ค|เช็ก|ตรวจ|ทดสอบ|check)\s*(\d{1,6})$/);
  if (check) {
    const draws = await loadDraws(siteUrl);
    return [{ type: 'text', text: checkText(draws, check[1]) }];
  }
  // ถามตามวันที่: "งวด 01/11/26", "ผลงวด 16 ต.ค. 69" หรือพิมพ์วันที่อย่างเดียว
  const dateCmd = cmd.match(/^(?:งวด|ผลงวด|เลขงวด|หวยงวด|งวดวันที่)\s*(.+)$/);
  const bareDate = /^\d{1,2}\s*[/\-.]\s*\d{1,2}(?:\s*[/\-.]\s*\d{2,4})?$|^\d{1,2}\s*[ก-๙.]+\s*\d{0,4}$/.test(cmd);
  if (dateCmd || bareDate) {
    const today = todayInThailand();
    const date = parseDrawDate(dateCmd ? dateCmd[1] : cmd, today);
    if (!date) return dateCmd ? [{ type: 'text', text: 'อ่านวันที่ไม่ออก ลองพิมพ์แบบ "งวด 01/11/26" หรือ "งวด 1 พ.ย. 69"' }] : null;
    const draws = await loadDraws(siteUrl);
    return drawQuery(draws, date, { today, siteUrl, settings });
  }
  if (/^(help|ช่วยเหลือ|คำสั่ง)$/.test(cmd)) return [{ type: 'text', text: HELP_TEXT }];
  return null; // ข้อความอื่นในกลุ่มไม่ต้องตอบ
}

export default async (req, context) => {
  if (req.method !== 'POST') return new Response('LINE webhook OK');
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('x-line-signature'), process.env.LINE_CHANNEL_SECRET)) {
    return new Response('invalid signature', { status: 401 });
  }
  const { events = [] } = JSON.parse(raw);
  if (!events.length) console.log('line-webhook verify/empty request');
  const work = (async () => {
    for (const ev of events) {
      const readToken = ev.message?.markAsReadToken;
      if (readToken) await markAsRead(readToken).catch((err) => console.error('line-webhook markAsRead', err.message));
      try {
        const messages = await handleEvent(ev, process.env.URL);
        // log เฉพาะชนิดเหตุการณ์และผลลัพธ์ ไว้ไล่ปัญหาใน Netlify → Logs → Functions
        console.log(`line-webhook ${ev.type}/${ev.message?.type ?? '-'} from ${ev.source?.type ?? '-'} → ${messages ? `reply ${messages.length} msg` : 'no reply (ไม่ใช่คำสั่ง)'}`);
        if (messages && ev.replyToken) {
          await reply(ev.replyToken, messages);
          console.log('line-webhook reply sent');
        }
      } catch (err) {
        console.error('line-webhook', err);
      }
    }
  })();
  // LINE รอคำตอบ webhook ได้ราว 2 วินาที: ตอบ 200 ทันทีแล้วค่อยคำนวณ/ตอบกลับต่อในพื้นหลัง
  // (reply token ใช้ได้ประมาณ 1 นาที)
  if (context?.waitUntil) context.waitUntil(work);
  else await work;
  return new Response('ok');
};
