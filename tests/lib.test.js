import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkTicket, payout, theoreticalReturn } from '../src/lib/prizes.js';
import { GAMES, frequency, gaps, chiSquareUniform, binomialUpperTail } from '../src/lib/analysis.js';
import { BOTS, pick } from '../src/lib/bots.js';
import { mulberry32, weightedSample } from '../src/lib/rng.js';
import { runBacktest } from '../src/lib/backtest.js';
import { parseCsv, fromPrimaryRow, fromArchiveText, checkDraw, mergeSources } from '../scripts/fetch-data.mjs';
import { adaptiveReport } from '../src/lib/bots.js';

const draw = (date, first, last2, extra = {}) => ({
  date, first, last2, near: [], second: [], third: [], fourth: [], fifth: [],
  front3: ['111', '222'], last3: ['333', '444'], ...extra,
});

test('checkTicket ตรวจได้หลายรางวัลพร้อมกัน', () => {
  const d = draw('2026-10-16', '011781', '81', { last3: ['781', '255'] });
  assert.deepEqual(checkTicket('011781', d), ['first', 'last3', 'last2']);
  assert.equal(payout(checkTicket('011781', d)), 6_000_000 + 4_000 + 2_000);
  assert.deepEqual(checkTicket('111000', d), ['front3']);
  assert.deepEqual(checkTicket('999999', d), []);
});

test('อัตราจ่ายคืนตามทฤษฎีประมาณ 60%', () => {
  assert.ok(Math.abs(theoreticalReturn() - 0.6) < 0.01);
});

test('frequency และ gaps', () => {
  const ds = [draw('a', '000000', '05'), draw('b', '000000', '07'), draw('c', '000000', '05')];
  const f = frequency(ds, GAMES.last2);
  assert.equal(f[5], 2);
  assert.equal(f[7], 1);
  const g = gaps(ds, GAMES.last2);
  assert.equal(g[5], 1);
  assert.equal(g[7], 2);
  assert.equal(g[0], 4);
});

test('chi-square: ข้อมูลสม่ำเสมอ p สูง, เอนเอียง p ต่ำ', () => {
  assert.ok(chiSquareUniform(new Array(10).fill(20)).p > 0.99);
  assert.ok(chiSquareUniform([200, 0, 0, 0, 0, 0, 0, 0, 0, 0]).p < 1e-6);
});

test('binomialUpperTail', () => {
  assert.equal(binomialUpperTail(0, 10, 0.5), 1);
  assert.ok(Math.abs(binomialUpperTail(10, 10, 0.5) - 1 / 1024) < 1e-12);
  assert.ok(Math.abs(binomialUpperTail(5, 10, 0.5) - 0.623046875) < 1e-9);
});

test('weightedSample ไม่ซ้ำและเคารพน้ำหนัก 0', () => {
  const r = mulberry32(1);
  const out = weightedSample([1, 2, 3, 4], [0, 1, 1, 1], 3, r);
  assert.equal(new Set(out).size, 3);
  assert.ok(!out.includes(1));
});

test('parse ข้อมูลทั้งสองแหล่งได้รูปแบบเดียวกัน', () => {
  const csv = 'date,first,second,third,fourth,fifth,last2,last3f,last3b,near1\n' +
    '2026-10-16,011781,"1,2",,,,48,"392,402","171,255","011780,011782"\n';
  const p = fromPrimaryRow(parseCsv(csv)[0]);
  const s = fromArchiveText('2026-10-16', 'url\nFIRST 011781\nTHREE_FIRST 402 392\nTHREE_LAST 171 255\nTWO 48\nNEAR_FIRST 011780 011782\nSECOND 2 1\n');
  for (const k of ['first', 'last2', 'front3', 'last3', 'near', 'second']) assert.deepEqual(p[k], s[k], k);
  assert.ok(checkDraw(p).includes('third:0/10'));
});

test('mergeSources: งวดเลื่อนวันจับคู่ด้วยรางวัลที่ 1 และเติมงวดที่ขาด', () => {
  const primary = [draw('2020-04-01', '051095', '15'), draw('2020-06-01', '831567', '20')];
  const secondary = [draw('2020-05-16', '051095', '15'), draw('2020-06-01', '831567', '20'), draw('2020-12-30', '123456', '56')];
  const { draws, report } = mergeSources(primary, secondary, '2016-01-01');
  assert.deepEqual(draws.map((d) => d.date), ['2020-04-01', '2020-06-01', '2020-12-30']);
  assert.equal(draws[2].source, 'archive');
  assert.equal(report.find((r) => r.date === '2020-04-01').note, 'secondary date 2020-05-16');
});

const data = JSON.parse(readFileSync(new URL('../public/data/draws.json', import.meta.url), 'utf8')).draws;

test('ข้อมูลจริง: ครอบคลุม ~10 ปี เรียงวันที่ ไม่ซ้ำ รูปแบบถูก', () => {
  assert.ok(data.length >= 230, `มีเพียง ${data.length} งวด`);
  const years = (new Date(data.at(-1).date) - new Date(data[0].date)) / (365.25 * 864e5);
  assert.ok(years > 9.9 && years < 10.1);
  for (let i = 1; i < data.length; i++) assert.ok(data[i - 1].date < data[i].date);
  for (const d of data) {
    assert.match(d.first, /^\d{6}$/);
    assert.match(d.last2, /^\d{2}$/);
    assert.equal(d.front3.length, 2);
    assert.equal(d.last3.length, 2);
  }
});

test('ทุก bot เลือกเลขได้ครบ ไม่ซ้ำ ทุกเกม ทั้งสองโหมด', () => {
  const H = data.slice(0, 100);
  for (const b of BOTS) for (const g of Object.values(GAMES)) for (const mode of ['analyze', 'random']) {
    const out = pick(b.id, H, g, 5, mode, mulberry32(7));
    assert.equal(out.length, 5, `${b.id}/${g.key}/${mode}`);
    assert.equal(new Set(out).size, 5);
    for (const n of out) assert.equal(n.length, g.digits);
  }
});

test('โหมดวิเคราะห์ 6 หลัก: เลขท้าย 2 ตัวไม่ซ้ำกันระหว่างใบ', () => {
  for (const b of BOTS) {
    const out = pick(b.id, data.slice(0, 100), GAMES.first, 5, 'analyze', mulberry32(3));
    assert.equal(new Set(out.map((t) => t.slice(4))).size, 5, b.id);
  }
});

test('backtest ไม่มองอนาคต และทำซ้ำได้ด้วย seed เดิม', () => {
  const small = data.slice(0, 40);
  const a = runBacktest(small, 'hot', 'last2', { warmup: 10 });
  const b = runBacktest(small, 'hot', 'last2', { warmup: 10 });
  assert.deepEqual(a.equity, b.equity);
  assert.equal(a.draws, 30);
  // เปลี่ยนผลงวดในอนาคตต้องไม่กระทบเลขที่เลือกของงวดก่อนหน้า
  const mutated = small.map((d, i) => (i >= 30 ? { ...d, last2: '00' } : d));
  const c = runBacktest(mutated, 'hot', 'last2', { warmup: 10 });
  for (let i = 0; i <= 20; i++) assert.deepEqual(a.rows[i].picks, c.rows[i].picks);
});

test('AI ปรับตัว: ใช้เฉพาะข้อมูลก่อนงวด (เปลี่ยนอนาคตแล้วการเลือกเดิมไม่เปลี่ยน)', () => {
  const H = data.slice(0, 120);
  const a = adaptiveReport(H, GAMES.last2);
  assert.equal(a.length, 6);
  for (const r of a) assert.ok(r.quality > 0 && r.quality < 1);
  const mutated = [...H, ...data.slice(120, 130).map((d) => ({ ...d, last2: '00' }))];
  assert.deepEqual(adaptiveReport(mutated.slice(0, 120), GAMES.last2), a);
  const p1 = pick('adaptive', H, GAMES.last2, 5, 'analyze', mulberry32(1));
  const p2 = pick('adaptive', mutated.slice(0, 120), GAMES.last2, 5, 'analyze', mulberry32(1));
  assert.deepEqual(p1, p2);
});
