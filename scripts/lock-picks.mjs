// ล็อกเลขของ bot ล่วงหน้าทุกงวด (ถึงสิ้นปีที่กำหนด) จากผลที่ออกแล้วทั้งหมด ณ ตอนนี้
// เลขที่ล็อกไว้จะไม่เปลี่ยนตามผลงวดใหม่ · ส่ง LINE / ตอบคำสั่ง / ตรวจผล ใช้ชุดเดียวกัน
//   npm run lock-picks            → ถึงสิ้นปีถัดไป
//   npm run lock-picks -- 2028    → ถึงสิ้นปี ค.ศ. 2028
import { readFile, writeFile } from 'node:fs/promises';
import { samplePicks, ALERT_PICKS } from '../src/lib/line-messages.js';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';
import { nextDrawDate } from '../src/lib/schedule.js';

const draws = JSON.parse(await readFile(new URL('../public/data/draws.json', import.meta.url), 'utf8')).draws;
const last = draws.at(-1).date;
const untilYear = Number(process.argv[2]) || Number(last.slice(0, 4)) + 1;
const botId = DEFAULT_SETTINGS.botId;
const counts = Object.fromEntries(Object.keys(ALERT_PICKS).map((k) => [k, DEFAULT_SETTINGS.picks[k]]));

const out = {};
for (let d = nextDrawDate(last); d.slice(0, 4) <= String(untilYear); d = nextDrawDate(d)) {
  out[d] = samplePicks(d, draws, botId, counts);
}
const data = { lockedAt: new Date().toISOString().slice(0, 10), historyUntil: last, botId, counts, draws: out };
await writeFile(new URL('../src/lib/locked-picks.js', import.meta.url),
  '// สร้างโดย scripts/lock-picks.mjs — ห้ามแก้ด้วยมือ\n' +
  `// ล็อกเมื่อ ${data.lockedAt} จากผล ${draws.length} งวดถึง ${last} · ${Object.keys(out).length} งวด\n` +
  `export const LOCKED_PICKS = ${JSON.stringify(data, null, 1)};\n`);
console.log(`ล็อกเลข ${Object.keys(out).length} งวด: ${Object.keys(out)[0]} → ${Object.keys(out).at(-1)} (ประวัติถึง ${last})`);
