// Walk-forward backtest: งวด t ใช้ข้อมูลก่อนงวด t เท่านั้น (ไม่มองอนาคต)
import { GAMES, binomialUpperTail } from './analysis.js';
import { pick, BOTS } from './bots.js';
import { mulberry32, hashSeed } from './rng.js';
import { TICKET_PRICE, PRIZES, checkTicket, payout } from './prizes.js';

export const DEFAULTS = { warmup: 24, picks: 5, mode: 'analyze', seed: 2569 };

// ใบที่ซื้อเพื่อเล่นแต่ละเกม จ่ายตามรางวัลของรัฐบาล
const PRIZE_OF = { last2: PRIZES.last2.amount, last3: PRIZES.last3.amount, front3: PRIZES.front3.amount };

function hitsAndPayout(game, picks, d) {
  if (game.key === 'first') {
    let hits = 0, money = 0;
    for (const t of picks) {
      const won = checkTicket(t, d);
      if (won.length) hits++;
      money += payout(won);
    }
    return { hits, money };
  }
  const winners = new Set(game.values(d));
  const hits = picks.filter((p) => winners.has(p)).length;
  return { hits, money: hits * PRIZE_OF[game.key] };
}

// โอกาสถูกต่อ 1 ตัวเลือก (ไว้เทียบกับผลจริง)
export function hitProbability(game) {
  if (game.key === 'first') {
    // โอกาสที่สลาก 1 ใบถูกรางวัลใดก็ได้ ≈ จำนวนเลขที่ถูก / 1,000,000
    const winning = 1 + 2 + 5 + 10 + 50 + 100 + 2000 + 2000 + 10000;
    return winning / 1_000_000;
  }
  return game.perDraw / game.space;
}

export function runBacktest(draws, botId, gameKey, opts = {}) {
  const { warmup, picks: k, mode, seed } = { ...DEFAULTS, ...opts };
  const game = GAMES[gameKey];
  let cost = 0, revenue = 0, hits = 0, n = 0;
  const equity = [], rows = [];
  for (let t = warmup; t < draws.length; t++) {
    const d = draws[t];
    const rand = mulberry32(hashSeed(seed, botId, gameKey, mode, d.date));
    const picks = pick(botId, draws.slice(0, t), game, k, mode, rand);
    const r = hitsAndPayout(game, picks, d);
    cost += picks.length * TICKET_PRICE;
    revenue += r.money;
    hits += r.hits;
    n += picks.length;
    equity.push(revenue - cost);
    rows.push({ date: d.date, picks, hits: r.hits, money: r.money, actual: game.values(d) });
  }
  const p = hitProbability(game);
  return {
    botId, gameKey, mode, k,
    draws: rows.length, tickets: n, hits,
    hitRate: hits / n, expectedHits: n * p,
    pValue: binomialUpperTail(hits, n, p),
    cost, revenue, profit: revenue - cost, roi: (revenue - cost) / cost,
    equity, rows,
  };
}

// สุ่มล้วนหลายรอบ เพื่อดูว่าผลของ bot ต่าง ๆ อยู่ในช่วงของ “โชค” หรือไม่
export function monteCarloBaseline(draws, gameKey, opts = {}, runs = 200) {
  const out = [];
  for (let i = 0; i < runs; i++) {
    const r = runBacktest(draws, 'random', gameKey, { ...opts, mode: 'random', seed: 10_000 + i });
    out.push({ hits: r.hits, roi: r.roi, final: r.profit, equity: r.equity });
  }
  const q = (arr, x) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(x * s.length))]; };
  const len = out[0]?.equity.length ?? 0;
  const band = Array.from({ length: len }, (_, i) => {
    const col = out.map((o) => o.equity[i]);
    return { lo: q(col, 0.05), mid: q(col, 0.5), hi: q(col, 0.95) };
  });
  const hitsArr = out.map((o) => o.hits);
  const roiArr = out.map((o) => o.roi);
  return {
    runs,
    hits: { p5: q(hitsArr, 0.05), p50: q(hitsArr, 0.5), p95: q(hitsArr, 0.95) },
    roi: { p5: q(roiArr, 0.05), p50: q(roiArr, 0.5), p95: q(roiArr, 0.95) },
    // percentile ของผลลัพธ์ใด ๆ เทียบกับการสุ่ม
    percentileOf: (hitsValue) => hitsArr.filter((h) => h <= hitsValue).length / runs,
    band,
  };
}

export function runAll(draws, gameKey, opts = {}) {
  return BOTS.map((b) => runBacktest(draws, b.id, gameKey, opts));
}
