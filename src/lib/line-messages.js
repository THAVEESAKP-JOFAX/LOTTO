// สร้างข้อความ LINE (Flex Message พื้นฟ้า + ข้อความสำรอง) จากผลสลากและเลขของ bot
import { GAMES } from './analysis.js';
import { BOTS, pick } from './bots.js';
import { mulberry32, hashSeed } from './rng.js';
import { checkTicket, payout, PRIZES } from './prizes.js';
import { analyzeNumber } from './checker.js';
import { floatingDigits } from './floating.js';
import { checkTickets } from './ticket-check.js';
import { DEFAULT_SETTINGS } from './settings.js';

const C = {
  top: '#2196f3', bottom: '#1565c0', text: '#ffffff', muted: '#d3e8ff', hi: '#ffe082', good: '#b9f6ca', line: '#64b5f6',
};
// จำนวนเลขที่ bot ส่งเข้ากลุ่มต่อประเภท (ค่าเริ่มต้น — แก้ได้จากหน้า Admin)
export const ALERT_PICKS = (({ last2, last3, front3, first }) => ({ last2, last3, front3, first }))(DEFAULT_SETTINGS.picks);

const thDate = (iso) => new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(iso + 'T00:00:00Z'));
const botName = (id) => { const b = BOTS.find((x) => x.id === id); return `${b.icon} ${b.name}`; };

// เลขของ bot สำหรับงวด drawDate — ใช้ประวัติก่อนงวดนั้นเท่านั้น และ seed จากวันที่
// จึงคำนวณซ้ำได้เหมือนเดิมเสมอ (ใช้ตรวจผลหลังออกรางวัลได้)
export function botPicksFor(drawDate, draws, settings = DEFAULT_SETTINGS) {
  const history = draws.filter((d) => d.date < drawDate);
  const botId = settings.botId ?? DEFAULT_SETTINGS.botId;
  const counts = { ...ALERT_PICKS, ...(settings.picks ?? {}) };
  const picks = {};
  for (const key of Object.keys(ALERT_PICKS)) {
    picks[key] = pick(botId, history, GAMES[key], counts[key], 'analyze', mulberry32(hashSeed('line', drawDate, key)));
  }
  return { drawDate, picks, botId, history };
}

const text = (t, o = {}) => ({ type: 'text', text: t, color: C.text, size: 'sm', wrap: true, ...o });
const row = (label, value, o = {}) => ({
  type: 'box', layout: 'horizontal', margin: 'md',
  contents: [text(label, { color: C.muted, flex: 3 }), text(value, { flex: 5, align: 'end', weight: 'bold', ...o })],
});
const blue = { type: 'linearGradient', angle: '180deg', startColor: C.top, endColor: C.bottom };
// การ์ดพื้นฟ้า: หัวเล็ก "LOTTO ANALYTICS" + บรรทัดรอง + เนื้อหา (ไม่มีปุ่ม/ข้อความท้าย)
const bubble = (subtitle, body, title) => ({
  type: 'bubble',
  body: {
    type: 'box', layout: 'vertical', background: blue, paddingAll: '18px',
    contents: [
      text('LOTTO ANALYTICS', { color: C.hi, size: 'xs', weight: 'bold' }),
      ...(title ? [text(title, { size: 'lg', weight: 'bold', margin: 'sm' })] : []),
      text(subtitle, { color: C.muted, size: 'xs', margin: title ? 'none' : 'sm' }),
      { type: 'separator', margin: 'md', color: C.line },
      ...body,
    ],
  },
});
const flex = (altText, contents) => ({ type: 'flex', altText: altText.slice(0, 400), contents });

// ข้อความเลขเด็ดก่อนออกรางวัล
export function picksMessage(drawDate, draws, siteUrl, settings = DEFAULT_SETTINGS) {
  const { picks, botId } = botPicksFor(drawDate, draws, settings);
  const body = [
    row('เลขท้าย 2 ตัว', picks.last2.join('  '), { color: C.hi, size: 'md' }),
    row('เลขท้าย 3 ตัว', picks.last3.join('  ')),
    row('เลขหน้า 3 ตัว', picks.front3.join('  ')),
    row('สลาก 6 หลัก', picks.first.join('  ')),
  ];
  const alt = `🧠 เลข bot งวด ${thDate(drawDate)}\n2 ตัว: ${picks.last2.join(' ')}\n3 ตัวท้าย: ${picks.last3.join(' ')}\n` +
    `3 ตัวหน้า: ${picks.front3.join(' ')}\n6 หลัก: ${picks.first.join(' ')}`;
  return flex(alt, bubble(`งวด ${thDate(drawDate)} · ${botName(botId)}`, body));
}

// คำสั่ง "เลข2ตัว"
export function twoDigitMessage(drawDate, draws, settings = DEFAULT_SETTINGS) {
  const { picks } = botPicksFor(drawDate, draws, settings);
  const body = [row('เลขท้าย 2 ตัว', picks.last2.join('  '), { color: C.hi, size: 'lg' })];
  return flex(`เลขท้าย 2 ตัว งวด ${thDate(drawDate)}: ${picks.last2.join(' ')}`, bubble(`เลขท้าย 2 ตัว · งวด ${thDate(drawDate)}`, body));
}

// คำสั่ง "เลข3ตัว"
export function threeDigitMessage(drawDate, draws, settings = DEFAULT_SETTINGS) {
  const { picks } = botPicksFor(drawDate, draws, settings);
  const body = [
    row('เลขท้าย 3 ตัว', picks.last3.join('  '), { color: C.hi, size: 'md' }),
    row('เลขหน้า 3 ตัว', picks.front3.join('  '), { size: 'md' }),
  ];
  return flex(`เลข 3 ตัว งวด ${thDate(drawDate)}\nท้าย: ${picks.last3.join(' ')}\nหน้า: ${picks.front3.join(' ')}`,
    bubble(`เลข 3 ตัว · งวด ${thDate(drawDate)}`, body));
}

// คำสั่ง "เลขลอยบน" / "เลขลอยล่าง"
export function floatMessage(kind, drawDate, draws, settings = DEFAULT_SETTINGS) {
  const history = draws.filter((d) => d.date < drawDate);
  const f = floatingDigits(history, kind, settings.picks?.float ?? DEFAULT_SETTINGS.picks.float);
  const body = [
    text(f.picks.map((p) => p.digit).join('   '), { color: C.hi, size: '3xl', weight: 'bold', align: 'center', margin: 'md' }),
    text(f.where, { color: C.muted, size: 'xs', align: 'center' }),
    ...f.picks.map((p) => row(`เลข ${p.digit}`, `ออก ${Math.round(p.rate * 100)}% ใน ${f.window} งวดล่าสุด`, { size: 'xs', weight: 'regular' })),
  ];
  return flex(`${f.label} งวด ${thDate(drawDate)}: ${f.picks.map((p) => p.digit).join(' ')}`,
    bubble(`${f.label} · งวด ${thDate(drawDate)}`, body));
}

// วันที่แบบสั้นที่ parseDrawDate อ่านกลับได้ เช่น 2026-10-16 → 16/10/69
const shortDate = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${String(Number(y) + 543).slice(2)}`; };
const shortLabel = (iso) => new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })
  .format(new Date(iso + 'T00:00:00Z'));

// ปุ่มเลือกงวดอื่น (Quick Reply) — กดแล้วส่งคำสั่งตรวจรางวัลของงวดนั้นเข้าแชตให้อัตโนมัติ
export function drawQuickReply(draws, tickets, exclude, n = 6) {
  const recent = draws.slice(-(n + 1)).reverse().filter((d) => d.date !== exclude).slice(0, n);
  return {
    items: recent.map((d) => ({
      type: 'action',
      action: { type: 'message', label: `งวด ${shortLabel(d.date)}`.slice(0, 20), text: `ตรวจรางวัล ${tickets.join(' ')} งวด ${shortDate(d.date)}` },
    })),
  };
}

// คำสั่ง "ตรวจรางวัล 011781 [งวด 16/10/69]"
export function ticketCheckMessage(draws, tickets, date = null) {
  const r = checkTickets(draws, tickets, date);
  if (r.error) return { type: 'text', text: r.error };
  const lines = r.results.map((x) => ({
    type: 'box', layout: 'vertical', margin: 'md',
    contents: [
      text(x.number, { size: 'xl', weight: 'bold', color: x.amount ? C.hi : C.text }),
      text(x.amount ? `🎉 ${x.prizes.join(' + ')} · ฿${x.amount.toLocaleString('th-TH')}` : 'ไม่ถูกรางวัล',
        { size: 'xs', color: x.amount ? C.good : C.muted }),
    ],
  }));
  const body = [
    ...lines,
    { type: 'separator', margin: 'lg', color: C.line },
    text(r.total ? `รวมเงินรางวัล ฿${r.total.toLocaleString('th-TH')}` : `ตรวจ ${r.results.length} ใบ ไม่ถูกรางวัล`,
      { margin: 'md', weight: 'bold', color: r.total ? C.good : C.muted }),
    ...(r.partial ? [text('งวดนี้ข้อมูลรางวัลที่ 4–5 ไม่ครบ ตรวจได้เฉพาะรางวัลหลัก', { size: 'xxs', color: C.muted })] : []),
    text('เลือกงวดอื่นได้จากปุ่มด้านล่าง', { size: 'xxs', color: C.muted, margin: 'sm' }),
  ];
  const alt = `ตรวจรางวัลงวด ${thDate(r.draw.date)}\n` + r.results.map((x) => `${x.number}: ${x.amount ? x.prizes.join('+') : 'ไม่ถูก'}`).join('\n');
  return { ...flex(alt, bubble(`งวด ${thDate(r.draw.date)}`, body, 'ตรวจรางวัล')), quickReply: drawQuickReply(draws, tickets, r.draw.date) };
}

export const TICKET_HELP = 'พิมพ์ "ตรวจรางวัล" ตามด้วยเลข 6 หลัก (ครั้งละไม่เกิน 10 ใบ)\nเช่น ตรวจรางวัล 011781 123456\nเลือกงวด: ตรวจรางวัล 011781 งวด 16/10/69';

// สรุปว่าเลขของ bot งวดนั้นถูกอะไรบ้าง
export function scorePicks(d, picks) {
  const hit = {
    last2: picks.last2.filter((n) => n === d.last2),
    last3: picks.last3.filter((n) => d.last3.includes(n)),
    front3: picks.front3.filter((n) => d.front3.includes(n)),
    first: picks.first.map((t) => ({ t, won: checkTicket(t, d) })).filter((x) => x.won.length),
  };
  const money = hit.last2.length * PRIZES.last2.amount + hit.last3.length * PRIZES.last3.amount +
    hit.front3.length * PRIZES.front3.amount + hit.first.reduce((s, x) => s + payout(x.won), 0);
  return { hit, money };
}

// ข้อความผลรางวัลหลังออก พร้อมตรวจเลขของ bot
export function resultMessage(d, draws, siteUrl, settings = DEFAULT_SETTINGS) {
  const { picks } = botPicksFor(d.date, draws, settings);
  const { hit, money } = scorePicks(d, picks);
  const any = money > 0;
  const body = [
    text('รางวัลที่ 1', { color: C.muted, size: 'xs', margin: 'md' }),
    text(d.first, { color: C.hi, size: '3xl', weight: 'bold', align: 'center' }),
    row('เลขหน้า 3 ตัว', d.front3.join('  ')),
    row('เลขท้าย 3 ตัว', d.last3.join('  ')),
    row('เลขท้าย 2 ตัว', d.last2, { color: C.hi, size: 'lg' }),
    { type: 'separator', margin: 'lg', color: C.line },
    text(any ? `✅ Bot ถูกรางวัล รวม ฿${money.toLocaleString('th-TH')}` : '❌ เลขของ Bot งวดนี้ไม่ถูกรางวัล',
      { margin: 'lg', weight: 'bold', color: any ? C.good : C.muted }),
    text(`Bot เลือก 2 ตัว: ${picks.last2.join(' ')}${hit.last2.length ? ` (ถูก ${hit.last2.join(', ')})` : ''}`, { size: 'xs', color: C.muted }),
  ];
  const alt = `🏆 ผลสลาก ${thDate(d.date)}\nรางวัลที่ 1: ${d.first}\n3 ตัวหน้า: ${d.front3.join(' ')}\n` +
    `3 ตัวท้าย: ${d.last3.join(' ')}\n2 ตัว: ${d.last2}\n${any ? `Bot ถูก ฿${money}` : 'Bot ไม่ถูก'}`;
  return flex(alt, bubble(`งวด ${thDate(d.date)}`, body, 'ผลสลากกินแบ่งรัฐบาล'));
}

// ผลทดสอบเลขแบบข้อความสั้น (คำสั่ง "เช็ค 48" ในกลุ่ม)
export function checkText(draws, raw) {
  const r = analyzeNumber(draws, raw);
  if (r.error) return `❓ ${r.error} เช่น "เช็ค 48"`;
  const lines = [`🔎 ทดสอบเลข ${r.number}`];
  for (const g of r.games) {
    const avg = Math.round(g.avgBotPercentile * 100);
    lines.push('', `▸ ${g.label}`);
    lines.push(g.key === 'first'
      ? `โอกาสถูกรางวัลใดก็ได้ 1 ใน ${g.oneIn.toLocaleString('th-TH')} (รางวัลที่ 1 คือ 1 ใน 1,000,000)`
      : `โอกาสออกงวดหน้า ${(g.probability * 100).toFixed(1)}% (1 ใน ${g.oneIn.toLocaleString('th-TH')})`);
    if (g.history) {
      const h = g.history;
      lines.push(`10 ปีออก ${h.count} ครั้ง (คาดหวัง ${h.expected.toFixed(1)})${h.lastSeen ? ` · ล่าสุด ${thDate(h.lastSeen)}` : ''}`);
    }
    lines.push(`คะแนนจาก bot เฉลี่ย ${avg}/100 · สูงสุด ${g.bots[0].icon} ${g.bots[0].name} ${Math.round(g.bots[0].percentile * 100)}`);
    lines.push(`ถ้าซื้อทุกงวด: ${g.buy.profit >= 0 ? '+' : '−'}฿${Math.abs(g.buy.profit).toLocaleString('th-TH')} (ถูก ${g.buy.wins} ครั้ง)`);
  }
  return lines.join('\n');
}

export const HELP_TEXT =
  'คำสั่ง LOTTO Bot\n• "เลขเด็ด" — เลขของ bot สำหรับงวดถัดไป\n• "เลข2ตัว" — เลขท้าย 2 ตัว\n• "เลข3ตัว" — เลขท้าย 3 ตัว + เลขหน้า 3 ตัว\n' +
  '• "เลขลอยบน" / "เลขลอยล่าง" — เลขวิ่งหลักเดียว\n• "ผลหวย" — ผลงวดล่าสุด\n• "ตรวจรางวัล 011781" — ตรวจสลาก (เลือกงวดได้)\n• "เช็ค 48" — ทดสอบเลขของคุณ\n• "งวด 01/11/26" — เลขหรือผลของงวดนั้น\n• "groupid" — แสดง ID ของกลุ่มนี้';
