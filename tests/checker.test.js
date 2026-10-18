import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeNumber, gamesFor } from '../src/lib/checker.js';
import { checkText } from '../src/lib/line-messages.js';

const draws = JSON.parse(readFileSync(new URL('../public/data/draws.json', import.meta.url), 'utf8')).draws;

test('gamesFor แยกประเภทตามจำนวนหลัก', () => {
  assert.deepEqual(gamesFor('48'), ['last2']);
  assert.deepEqual(gamesFor('171'), ['last3', 'front3']);
  assert.deepEqual(gamesFor('011781'), ['first']);
  assert.equal(gamesFor('1234'), null);
  assert.equal(gamesFor('4'), null);
});

test('analyzeNumber: โอกาสจริงและสถิติตรงกับข้อมูล', () => {
  const r = analyzeNumber(draws, ' 4-8 ');
  assert.equal(r.number, '48');
  const g = r.games[0];
  assert.equal(g.probability, 0.01);
  assert.equal(g.history.count, draws.filter((d) => d.last2 === '48').length);
  assert.equal(g.history.lastSeen, draws.findLast((d) => d.last2 === '48')?.date ?? null);
  assert.equal(g.bots.length, 8); // ไม่รวมสุ่มล้วน
  for (const b of g.bots) assert.ok(b.percentile >= 0 && b.percentile <= 1);
  assert.equal(g.buy.cost, draws.length * 80);
  assert.equal(g.buy.revenue, g.history.count * 2000);
});

test('analyzeNumber: 3 หลักวิเคราะห์ทั้งหน้าและท้าย, 6 หลักมีส่วนย่อย', () => {
  assert.deepEqual(analyzeNumber(draws, '171').games.map((g) => g.key), ['last3', 'front3']);
  const six = analyzeNumber(draws, draws.at(-1).first);
  assert.equal(six.games[0].key, 'first');
  assert.ok(six.games[0].buy.revenue >= 6_000_000); // เคยถูกรางวัลที่ 1 จริง
  assert.deepEqual(six.parts.map((p) => p.number), [draws.at(-1).first.slice(4), draws.at(-1).first.slice(0, 3), draws.at(-1).first.slice(3)]);
  assert.ok(analyzeNumber(draws, '12345').error);
});

test('checkText สำหรับ LINE', () => {
  const t = checkText(draws, '48');
  assert.match(t, /ทดสอบเลข 48/);
  assert.match(t, /1\.0%/);
  assert.match(checkText(draws, '1'), /❓/);
});
