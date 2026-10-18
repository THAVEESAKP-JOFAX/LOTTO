// เงินรางวัลสลากกินแบ่งรัฐบาล (ต่อสลาก 1 ใบ ราคา 80 บาท)
export const TICKET_PRICE = 80;

export const PRIZES = {
  first: { label: 'รางวัลที่ 1', amount: 6_000_000 },
  near: { label: 'ข้างเคียงรางวัลที่ 1', amount: 100_000 },
  second: { label: 'รางวัลที่ 2', amount: 200_000 },
  third: { label: 'รางวัลที่ 3', amount: 80_000 },
  fourth: { label: 'รางวัลที่ 4', amount: 40_000 },
  fifth: { label: 'รางวัลที่ 5', amount: 20_000 },
  front3: { label: 'เลขหน้า 3 ตัว', amount: 4_000 },
  last3: { label: 'เลขท้าย 3 ตัว', amount: 4_000 },
  last2: { label: 'เลขท้าย 2 ตัว', amount: 2_000 },
};

// ตรวจสลาก 1 ใบ (เลข 6 หลัก) กับผลงวด d → รายการรางวัลที่ถูก (ถูกได้หลายรางวัลพร้อมกัน)
export function checkTicket(ticket, d) {
  const won = [];
  if (ticket === d.first) won.push('first');
  for (const k of ['near', 'second', 'third', 'fourth', 'fifth']) {
    if (d[k].includes(ticket)) won.push(k);
  }
  if (d.front3.includes(ticket.slice(0, 3))) won.push('front3');
  if (d.last3.includes(ticket.slice(3))) won.push('last3');
  if (ticket.slice(4) === d.last2) won.push('last2');
  return won;
}

export const payout = (won) => won.reduce((s, k) => s + PRIZES[k].amount, 0);

// อัตราจ่ายคืนตามทฤษฎีต่อ 1 ล้านใบ (ทุกเลขมีโอกาสเท่ากัน)
export function theoreticalReturn() {
  const total =
    PRIZES.first.amount + 2 * PRIZES.near.amount + 5 * PRIZES.second.amount +
    10 * PRIZES.third.amount + 50 * PRIZES.fourth.amount + 100 * PRIZES.fifth.amount +
    2 * 1000 * PRIZES.front3.amount + 2 * 1000 * PRIZES.last3.amount + 10_000 * PRIZES.last2.amount;
  return total / (1_000_000 * TICKET_PRICE);
}
