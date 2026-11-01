// ล็อกเลขล่วงหน้าทุกงวด (ถึงสิ้นปีที่กำหนด) โดยสุ่มล้วน: ทุกตัวเลขมีโอกาสเท่ากัน ไม่ถ่วงน้ำหนักตามสถิติ
// (ผล backtest: ไม่มีสูตรใดดีกว่าการสุ่ม) · seed ตามวันที่งวด จึงสร้างซ้ำได้ชุดเดิม
// เลขที่ล็อกไว้จะไม่เปลี่ยนตามผลงวดใหม่ · ส่ง LINE / ตอบคำสั่ง / ตรวจผล ใช้ชุดเดียวกัน
//   npm run lock-picks            → ล่วงหน้า 10 ปี (ถึงสิ้นปี ค.ศ. ปีปัจจุบัน + 10)
//   npm run lock-picks -- 2028    → ถึงสิ้นปี ค.ศ. 2028
import { readFile, writeFile } from 'node:fs/promises';
import { samplePicks, ALERT_PICKS } from '../src/lib/line-messages.js';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';
import { nextDrawDate } from '../src/lib/schedule.js';

const draws = JSON.parse(await readFile(new URL('../public/data/draws.json', import.meta.url), 'utf8')).draws;
const last = draws.at(-1).date;
const untilYear = Number(process.argv[2]) || Number(last.slice(0, 4)) + 10;
const botId = 'random';
const counts = Object.fromEntries(Object.keys(ALERT_PICKS).map((k) => [k, DEFAULT_SETTINGS.picks[k]]));

const out = {};
for (let d = nextDrawDate(last); d.slice(0, 4) <= String(untilYear); d = nextDrawDate(d)) {
  out[d] = samplePicks(d, draws, botId, counts);
}
const data = { lockedAt: new Date().toISOString().slice(0, 10), historyUntil: last, botId, counts, draws: out };
await writeFile(new URL('../src/lib/locked-picks.js', import.meta.url),
  '// สร้างโดย scripts/lock-picks.mjs — ห้ามแก้ด้วยมือ\n' +
  `// ล็อกเมื่อ ${data.lockedAt} จากผล ${draws.length} งวดถึง ${last} · ${Object.keys(out).length} งวด\n` +
  // งวดละบรรทัด ให้ไฟล์เล็กและอ่าน diff ง่าย
  'export const LOCKED_PICKS = {\n' +
  Object.entries({ ...data, draws: undefined }).filter(([, v]) => v !== undefined).map(([k, v]) => ` ${k}: ${JSON.stringify(v)},\n`).join('') +
  ' draws: {\n' + Object.entries(out).map(([d, p]) => `  '${d}': ${JSON.stringify(p)},\n`).join('') + ' },\n};\n');
console.log(`ล็อกเลข ${Object.keys(out).length} งวด: ${Object.keys(out)[0]} → ${Object.keys(out).at(-1)} (ประวัติถึง ${last})`);
