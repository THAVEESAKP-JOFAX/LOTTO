// ทดสอบเลขของผู้ใช้: โอกาสจริง + สถิติย้อนหลัง + มุมมองของ bot + ผลถ้าซื้อทุกงวด
import { GAMES, frequency, gaps, binomialUpperTail } from './analysis.js';
import { BOTS, rankOf } from './bots.js';
import { hitProbability } from './backtest.js';
import { TICKET_PRICE, PRIZES, checkTicket, payout } from './prizes.js';

const PRIZE_OF = { last2: PRIZES.last2.amount, last3: PRIZES.last3.amount, front3: PRIZES.front3.amount };

// เลข 2 หลัก → เลขท้าย 2 ตัว · 3 หลัก → ทั้ง 3 ตัวหน้าและ 3 ตัวท้าย · 6 หลัก → สลากเต็มใบ
export function gamesFor(number) {
  if (!/^\d+$/.test(number)) return null;
  if (number.length === 2) return ['last2'];
  if (number.length === 3) return ['last3', 'front3'];
  if (number.length === 6) return ['first'];
  return null;
}

// สถิติของเลขในเกมขนาดเล็ก (2–3 หลัก)
function history(draws, game, number) {
  const n = Number(number);
  const count = frequency(draws, game)[n];
  const gap = gaps(draws, game)[n];
  const seen = draws.filter((d) => game.values(d).includes(number)).map((d) => d.date);
  const expected = draws.length * game.perDraw / game.space;
  return {
    count, expected,
    lastSeen: seen.at(-1) ?? null,
    gap: gap > draws.length ? null : gap,
    // ความถี่สูงกว่าค่าคาดหวังอย่างมีนัยสำคัญหรือไม่ (ทดสอบทางเดียว)
    pMoreThanChance: binomialUpperTail(count, draws.length * game.perDraw, 1 / game.space),
    dates: seen.slice(-5).reverse(),
  };
}

// ถ้าซื้อเลขนี้ 1 ใบทุกงวดตลอดช่วงข้อมูล
function buyEveryDraw(draws, gameKey, number) {
  let revenue = 0, wins = 0;
  const winDates = [];
  for (const d of draws) {
    let money;
    if (gameKey === 'first') money = payout(checkTicket(number, d));
    else money = GAMES[gameKey].values(d).includes(number) ? PRIZE_OF[gameKey] : 0;
    if (money) { wins++; revenue += money; winDates.push(d.date); }
  }
  const cost = draws.length * TICKET_PRICE;
  return { draws: draws.length, cost, revenue, wins, profit: revenue - cost, roi: (revenue - cost) / cost, winDates: winDates.slice(-5).reverse() };
}

export function analyzeNumber(draws, raw) {
  const number = String(raw).replace(/\D/g, '');
  const keys = gamesFor(number);
  if (!keys) return { error: 'ใส่เลข 2 หลัก, 3 หลัก หรือ 6 หลัก' };
  const games = keys.map((key) => {
    const game = GAMES[key];
    const p = hitProbability(game);
    const bots = BOTS.filter((b) => b.id !== 'random').map((b) => ({
      id: b.id, name: b.name, icon: b.icon, percentile: rankOf(b.id, draws, game, number),
    })).sort((a, b) => b.percentile - a.percentile);
    return {
      key, label: game.label,
      probability: p,
      oneIn: Math.round(1 / p),
      history: key === 'first' ? null : history(draws, game, number),
      bots,
      avgBotPercentile: bots.reduce((s, b) => s + b.percentile, 0) / bots.length,
      buy: buyEveryDraw(draws, key, number),
    };
  });
  // สลาก 6 หลักถูกเลขท้าย 2 ตัว / 3 ตัวหน้า / 3 ตัวท้ายได้ด้วย จึงแสดงสถิติของส่วนย่อยประกอบ
  const parts = number.length === 6 ? [
    { label: 'เลขท้าย 2 ตัว', number: number.slice(4), ...history(draws, GAMES.last2, number.slice(4)) },
    { label: 'เลขหน้า 3 ตัว', number: number.slice(0, 3), ...history(draws, GAMES.front3, number.slice(0, 3)) },
    { label: 'เลขท้าย 3 ตัว', number: number.slice(3), ...history(draws, GAMES.last3, number.slice(3)) },
  ] : [];
  return { number, games, parts, draws: draws.length };
}
