// สร้างข้อความ LINE (Flex Message ธีมดำ-ทอง + ข้อความสำรอง) จากผลสลากและเลขของ bot
import { GAMES } from './analysis.js';
import { BOTS, pick, adaptiveReport } from './bots.js';
import { mulberry32, hashSeed } from './rng.js';
import { checkTicket, payout, PRIZES } from './prizes.js';
import { analyzeNumber } from './checker.js';

const C = { bg: '#0a0b0f', card: '#1a1e28', gold: '#e3bd62', text: '#ece6d6', muted: '#9a9384', good: '#6fcf97' };
const BOT_ID = 'adaptive';
// จำนวนเลขที่ bot ส่งเข้ากลุ่มต่อประเภท
export const ALERT_PICKS = { last2: 5, last3: 3, front3: 3, first: 2 };

const thDate = (iso) => new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(iso + 'T00:00:00Z'));
const botName = (id) => { const b = BOTS.find((x) => x.id === id); return `${b.icon} ${b.name}`; };

// เลขของ bot สำหรับงวด drawDate — ใช้ประวัติก่อนงวดนั้นเท่านั้น และ seed จากวันที่
// จึงคำนวณซ้ำได้เหมือนเดิมเสมอ (ใช้ตรวจผลหลังออกรางวัลได้)
export function botPicksFor(drawDate, draws) {
  const history = draws.filter((d) => d.date < drawDate);
  const picks = {};
  for (const [key, k] of Object.entries(ALERT_PICKS)) {
    picks[key] = pick(BOT_ID, history, GAMES[key], k, 'analyze', mulberry32(hashSeed('line', drawDate, key)));
  }
  const strategy = adaptiveReport(history, GAMES.last2)[0]?.id ?? 'ensemble';
  return { drawDate, picks, strategy };
}

const text = (t, o = {}) => ({ type: 'text', text: t, color: C.text, size: 'sm', wrap: true, ...o });
const row = (label, value, o = {}) => ({
  type: 'box', layout: 'horizontal', margin: 'md',
  contents: [text(label, { color: C.muted, flex: 3 }), text(value, { flex: 5, align: 'end', weight: 'bold', ...o })],
});
const footer = (siteUrl) => ({
  type: 'box', layout: 'vertical', spacing: 'sm', backgroundColor: C.bg,
  contents: [
    ...(siteUrl ? [{ type: 'button', style: 'primary', color: C.gold, height: 'sm', action: { type: 'uri', label: 'ดูบทวิเคราะห์เต็ม', uri: siteUrl } }] : []),
    text('เพื่อความบันเทิง · ผลหวยเป็นการสุ่ม · อายุ 20+', { size: 'xxs', color: C.muted, align: 'center' }),
  ],
});
const bubble = (title, subtitle, body, siteUrl) => ({
  type: 'bubble',
  styles: { header: { backgroundColor: C.bg }, body: { backgroundColor: C.bg }, footer: { backgroundColor: C.bg } },
  header: {
    type: 'box', layout: 'vertical',
    contents: [
      text('LOTTO ANALYTICS', { color: C.gold, size: 'xs', weight: 'bold' }),
      text(title, { size: 'lg', weight: 'bold', margin: 'sm' }),
      text(subtitle, { color: C.muted, size: 'xs' }),
    ],
  },
  body: { type: 'box', layout: 'vertical', contents: body },
  footer: footer(siteUrl),
});

// ข้อความเลขเด็ดก่อนออกรางวัล
export function picksMessage(drawDate, draws, siteUrl) {
  const { picks, strategy } = botPicksFor(drawDate, draws);
  const body = [
    text(`กลยุทธ์ที่ AI เลือกงวดนี้: ${botName(strategy)}`, { color: C.muted, size: 'xs' }),
    row('เลขท้าย 2 ตัว', picks.last2.join('  '), { color: C.gold, size: 'md' }),
    row('เลขท้าย 3 ตัว', picks.last3.join('  ')),
    row('เลขหน้า 3 ตัว', picks.front3.join('  ')),
    row('สลาก 6 หลัก', picks.first.join('  ')),
  ];
  const alt = `🧠 เลข bot งวด ${thDate(drawDate)}\n2 ตัว: ${picks.last2.join(' ')}\n3 ตัวท้าย: ${picks.last3.join(' ')}\n` +
    `3 ตัวหน้า: ${picks.front3.join(' ')}\n6 หลัก: ${picks.first.join(' ')}`;
  return {
    type: 'flex', altText: alt.slice(0, 400),
    contents: bubble('เลข Bot งวดนี้', `งวด ${thDate(drawDate)} · ${botName(BOT_ID)}`, body, siteUrl),
  };
}

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
export function resultMessage(d, draws, siteUrl) {
  const { picks } = botPicksFor(d.date, draws);
  const { hit, money } = scorePicks(d, picks);
  const any = money > 0;
  const body = [
    text('รางวัลที่ 1', { color: C.muted, size: 'xs' }),
    text(d.first, { color: C.gold, size: '3xl', weight: 'bold', align: 'center' }),
    row('เลขหน้า 3 ตัว', d.front3.join('  ')),
    row('เลขท้าย 3 ตัว', d.last3.join('  ')),
    row('เลขท้าย 2 ตัว', d.last2, { color: C.gold, size: 'lg' }),
    { type: 'separator', margin: 'lg', color: '#2a2e38' },
    text(any ? `✅ Bot ถูกรางวัล รวม ฿${money.toLocaleString('th-TH')}` : '❌ เลขของ Bot งวดนี้ไม่ถูกรางวัล',
      { margin: 'lg', weight: 'bold', color: any ? C.good : C.muted }),
    text(`Bot เลือก 2 ตัว: ${picks.last2.join(' ')}${hit.last2.length ? ` (ถูก ${hit.last2.join(', ')})` : ''}`, { size: 'xs', color: C.muted }),
  ];
  const alt = `🏆 ผลสลาก ${thDate(d.date)}\nรางวัลที่ 1: ${d.first}\n3 ตัวหน้า: ${d.front3.join(' ')}\n` +
    `3 ตัวท้าย: ${d.last3.join(' ')}\n2 ตัว: ${d.last2}\n${any ? `Bot ถูก ฿${money}` : 'Bot ไม่ถูก'}`;
  return {
    type: 'flex', altText: alt.slice(0, 400),
    contents: bubble('ผลสลากกินแบ่งรัฐบาล', `งวด ${thDate(d.date)}`, body, siteUrl),
  };
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
  lines.push('', 'ทุกเลขมีโอกาสเท่ากันทุกงวด · เพื่อความบันเทิง');
  return lines.join('\n');
}

export const HELP_TEXT =
  'คำสั่ง LOTTO Bot\n• "เลขเด็ด" — เลขของ AI สำหรับงวดถัดไป\n• "ผลหวย" — ผลงวดล่าสุด + ตรวจเลข bot\n• "เช็ค 48" — ทดสอบเลขของคุณ (2, 3 หรือ 6 หลัก)\n• "groupid" — แสดง ID ของกลุ่มนี้';
