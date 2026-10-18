// ตรวจรางวัลสลาก: เลข 6 หลักหลายใบ กับงวดที่เลือก (ค่าเริ่มต้น = งวดล่าสุด)
import { checkTicket, payout, PRIZES } from './prizes.js';

export const MAX_TICKETS = 10;

// ดึงเลข 6 หลักจากข้อความ เช่น "011781, 123456 999999"
export function parseTickets(text) {
  return [...new Set((String(text).match(/\d{6}/g) ?? []))].slice(0, MAX_TICKETS);
}

export function checkTickets(draws, tickets, date = null) {
  const draw = date ? draws.find((d) => d.date === date) : draws.at(-1);
  if (!draw) return { error: 'ไม่พบงวดที่เลือก' };
  if (!tickets.length) return { error: 'กรอกเลขสลาก 6 หลัก' };
  const results = tickets.map((number) => {
    const won = checkTicket(number, draw);
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
