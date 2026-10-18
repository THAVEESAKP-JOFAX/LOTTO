// คำนวณ backtest ใน background เพื่อไม่ให้หน้าเว็บค้าง
import { BOTS } from './lib/bots.js';
import { runBacktest, monteCarloBaseline } from './lib/backtest.js';

self.onmessage = ({ data: { draws, gameKey, mode, k, runs } }) => {
  const mc = monteCarloBaseline(draws, gameKey, { picks: k }, runs);
  const bots = BOTS.map((b) => {
    // bot สุ่มล้วนไม่มีโหมดวิเคราะห์ จึงรันแบบสุ่มเสมอ (ตรงกับผลที่คำนวณไว้ล่วงหน้า)
    const r = runBacktest(draws, b.id, gameKey, { mode: b.id === 'random' ? 'random' : mode, picks: k });
    return {
      botId: b.id, mode: r.mode, draws: r.draws, tickets: r.tickets, hits: r.hits, expectedHits: r.expectedHits,
      pValue: r.pValue, cost: r.cost, revenue: r.revenue, profit: r.profit, roi: r.roi,
      luckPercentile: mc.percentileOf(r.hits), equity: r.equity, dates: r.rows.map((x) => x.date),
    };
  });
  self.postMessage({ baseline: { hits: mc.hits, roi: mc.roi, band: mc.band }, bots, runs });
};
