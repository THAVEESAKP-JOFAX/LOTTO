import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDrawDate, drawQuery } from '../src/lib/date-query.js';

const draws = JSON.parse(readFileSync(new URL('../public/data/draws.json', import.meta.url), 'utf8')).draws;
const today = '2026-10-18';

test('parseDrawDate รองรับหลายรูปแบบ ทั้ง ค.ศ. และ พ.ศ.', () => {
  for (const t of ['01/11/26', '1/11/2026', '1/11/2569', '1-11-69', '1.11.26', '1 พ.ย. 69', '1 พย 2569', '1 พฤศจิกายน 2569', '1/11']) {
    assert.equal(parseDrawDate(t, today), '2026-11-01', t);
  }
  assert.equal(parseDrawDate('16 ต.ค.', today), '2026-10-16');
  assert.equal(parseDrawDate('30/02/26', today), null);
  assert.equal(parseDrawDate('สวัสดี', today), null);
  assert.equal(parseDrawDate('1 ทดสอบ 26', today), null);
});

test('drawQuery: งวดในอนาคต → เลข bot, งวดที่ออกแล้ว → ผล, วันที่ไม่มีงวด → บอกงวดถัดไป', () => {
  const kinds = (msgs) => msgs.map((m) => (m.type === 'text' ? 'note' : m.altText.startsWith('🧠') ? 'picks' : 'result'));
  assert.deepEqual(kinds(drawQuery(draws, '2026-11-01', { today })), ['picks']);
  assert.deepEqual(kinds(drawQuery(draws, '2026-10-16', { today })), ['result']);
  const noDraw = drawQuery(draws, '2026-11-02', { today });
  assert.deepEqual(kinds(noDraw), ['note', 'picks']);
  assert.match(noDraw[0].text, /16 พฤศจิกายน 2569/);
  assert.deepEqual(kinds(drawQuery(draws, '2026-12-01', { today })), ['note', 'picks']); // ไม่ใช่งวดถัดไป
  assert.deepEqual(kinds(drawQuery(draws, '2026-11-01', { today: '2026-11-01' })), ['note', 'picks']); // วันนี้ ผลยังไม่ออก
  assert.deepEqual(kinds(drawQuery(draws, '2010-01-01', { today })), ['note']);
});
