// รัน backtest ทุก bot × ทุกเกม แล้วบันทึกผลสรุปไว้ให้หน้าเว็บโหลดได้ทันที
import { readFile, writeFile } from 'node:fs/promises';
import { GAMES } from '../src/lib/analysis.js';
import { BOTS } from '../src/lib/bots.js';
import { runBacktest, monteCarloBaseline, DEFAULTS } from '../src/lib/backtest.js';

const DATA = new URL('../public/data/', import.meta.url);
const { draws } = JSON.parse(await readFile(new URL('draws.json', DATA), 'utf8'));
const runs = Number(process.env.MC_RUNS || 200);

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const report = { generatedAt: new Date().toISOString(), settings: { ...DEFAULTS, mcRuns: runs }, games: {} };

for (const game of Object.values(GAMES)) {
  const t0 = Date.now();
  const mc = monteCarloBaseline(draws, game.key, {}, runs);
  const bots = [];
  for (const mode of ['analyze', 'random']) {
    for (const b of BOTS) {
      if (b.id === 'random' && mode === 'analyze') continue;
      const r = runBacktest(draws, b.id, game.key, { mode });
      bots.push({
        botId: b.id, mode, draws: r.draws, tickets: r.tickets, hits: r.hits,
        expectedHits: r.expectedHits, pValue: r.pValue, cost: r.cost, revenue: r.revenue,
        profit: r.profit, roi: r.roi, luckPercentile: mc.percentileOf(r.hits), equity: r.equity,
        dates: r.rows.map((x) => x.date),
      });
    }
  }
  report.games[game.key] = { label: game.label, baseline: { hits: mc.hits, roi: mc.roi, band: mc.band }, bots };

  console.log(`\n■ ${game.label}  (${bots[0].draws} งวด × ${DEFAULTS.picks} เลข, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  console.log(`  สุ่ม ${runs} รอบ: ถูก p5–p95 = ${mc.hits.p5}–${mc.hits.p95}, ROI กลาง ${pct(mc.roi.p50)}`);
  for (const r of bots) {
    const name = `${BOTS.find((b) => b.id === r.botId).name} [${r.mode}]`.padEnd(26);
    console.log(`  ${name} ถูก ${String(r.hits).padStart(4)} (คาด ${r.expectedHits.toFixed(1)})  ` +
      `p=${r.pValue.toFixed(3)}  ROI ${pct(r.roi).padStart(7)}  เทียบโชค ${pct(r.luckPercentile)}`);
  }
}

await writeFile(new URL('backtest.json', DATA), JSON.stringify(report));
console.log('\n✓ บันทึก public/data/backtest.json');
