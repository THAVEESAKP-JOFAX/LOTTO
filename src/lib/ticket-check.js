// ตรวจรางวัลสลาก: เลข 6 หลักหลายใบ (หรือเลข 2–3 ตัว) กับงวดที่เลือก (ค่าเริ่มต้น = งวดล่าสุด)
import { checkTicket, payout, PRIZES } from './prizes.js';

export const MAX_TICKETS = 10;

// ดึงเลข 6 หลักจากข้อความ เช่น "011781, 123456 999999"
export function parseTickets(text) {
  return [...new Set((String(text).match(/\d{6}/g) ?? []))].slice(0, MAX_TICKETS);
}

// สำหรับ LINE: รับทั้งสลาก 6 หลัก และเลข 2–3 ตัว เช่น "011781 48 171" (เลขที่ยาวแบบอื่นไม่นับ)
export function parseNumbers(text) {
  const t = String(text).replace(/[๐-๙]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'.indexOf(d));
  return [...new Set((t.match(/\d+/g) ?? []).filter((n) => [2, 3, 6].includes(n.length)))].slice(0, MAX_TICKETS);
}

// เลข 2 ตัว → เลขท้าย 2 ตัว · เลข 3 ตัว → เลขหน้า 3 ตัว / เลขท้าย 3 ตัว
function checkShort(number, d) {
  if (number.length === 2) return number === d.last2 ? ['last2'] : [];
  return ['front3', 'last3'].filter((k) => d[k].includes(number));
}

export function checkTickets(draws, tickets, date = null) {
  const draw = date ? draws.find((d) => d.date === date) : draws.at(-1);
  if (!draw) return { error: 'ไม่พบงวดที่เลือก' };
  if (!tickets.length) return { error: 'กรอกเลขสลาก 6 หลัก' };
  const results = tickets.map((number) => {
    const won = number.length === 6 ? checkTicket(number, draw) : checkShort(number, draw);
    return { number, won, prizes: won.map((k) => PRIZES[k].label), amount: payout(won) };
  });
  return {
    draw,
    results,
    total: results.reduce((s, r) => s + r.amount, 0),
    // งวดที่ข้อมูลรางวัลย่อยไม่ครบ ตรวจได้เฉพาะรางวัลที่ 1 / ข้างเคียง / 3 ตัว / 2 ตัว
    partial: Boolean(draw.partial),
  };
}
