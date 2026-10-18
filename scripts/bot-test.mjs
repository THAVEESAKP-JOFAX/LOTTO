// ทดสอบรัน bot ทั้งรอบ แล้วแสดง (หรือส่ง) ค่าที่จะแจ้งเข้ากลุ่ม LINE
//   npm run bot:test                    → รันและแสดงผลอย่างเดียว (ไม่ส่งอะไรออกไป)
//   npm run bot:test -- --check 48      → ทดสอบเลขเพิ่ม
//   npm run bot:test -- --send          → ส่งเลข bot + ผลงวดล่าสุดเข้ากลุ่ม LINE จริง
//                                          (ต้องมี LINE_CHANNEL_ACCESS_TOKEN และ LINE_GROUP_IDS ใน env)
import { readFile } from 'node:fs/promises';
import { loadDraws } from '../netlify/lib/data.mjs';
import { pushToGroups, groupIds } from '../netlify/lib/line.mjs';
import { botPicksFor, scorePicks, picksMessage, resultMessage, checkText, ALERT_PICKS } from '../src/lib/line-messages.js';
import { GAMES } from '../src/lib/analysis.js';
import { BOTS, adaptiveReport } from '../src/lib/bots.js';
import { upcomingDraw, todayInThailand } from '../src/lib/schedule.js';

const args = process.argv.slice(2);
const send = args.includes('--send');
const checkArg = args.includes('--check') ? args[args.indexOf('--check') + 1] : null;
const siteUrl = process.env.URL || 'https://lottothaipro.netlify.app';

const local = JSON.parse(await readFile(new URL('../public/data/draws.json', import.meta.url), 'utf8')).draws;
let draws = local;
try {
  draws = await loadDraws(siteUrl, new Date(), local); // เติมงวดใหม่ที่ออกหลังอัปเดตข้อมูลล่าสุด
} catch (err) {
  console.warn(`! ดึงงวดใหม่ไม่ได้ (${err.message}) — ใช้ข้อมูลในเครื่อง`);
}
const name = (id) => { const b = BOTS.find((x) => x.id === id); return `${b.icon} ${b.name}`; };
const thDate = (iso) => new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'));
const line = '─'.repeat(52);

const latest = draws.at(-1);
const next = upcomingDraw(latest.date, todayInThailand());
console.log(`${line}\n🧠 LOTTO Bot — ทดสอบรัน\n${line}`);
console.log(`ข้อมูล ${draws.length} งวด · ล่าสุด ${thDate(latest.date)}${draws.length > local.length ? ` (ดึงงวดใหม่เพิ่ม ${draws.length - local.length} งวด)` : ''}`);

// 1) เลข bot สำหรับงวดถัดไป
const { picks } = botPicksFor(next, draws);
console.log(`\n① เลข Bot สำหรับงวด ${thDate(next)}`);
const rep = adaptiveReport(draws, GAMES.last2);
console.log(`   กลยุทธ์ที่ AI เลือก: ${name(rep[0].id)}  (${rep.map((r) => `${BOTS.find((b) => b.id === r.id).name} ${(r.quality * 100).toFixed(1)}`).join(' · ')})`);
for (const key of Object.keys(ALERT_PICKS)) console.log(`   ${GAMES[key].label.padEnd(26)} ${picks[key].join('  ')}`);

// 2) ผลงวดล่าสุด + ตรวจเลขที่ bot เลือกไว้สำหรับงวดนั้น
const prev = botPicksFor(latest.date, draws);
const { hit, money } = scorePicks(latest, prev.picks);
console.log(`\n② ผลงวด ${thDate(latest.date)} และเลขที่ bot เลือกไว้ก่อนออก`);
console.log(`   รางวัลที่ 1 ${latest.first} · 3 ตัวหน้า ${latest.front3.join(' ')} · 3 ตัวท้าย ${latest.last3.join(' ')} · 2 ตัว ${latest.last2}`);
console.log(`   bot เลือก 2 ตัว: ${prev.picks.last2.join(' ')}${hit.last2.length ? `  ✅ ถูก ${hit.last2.join(', ')}` : '  ❌'}`);
console.log(`   bot เลือก 3 ตัวท้าย: ${prev.picks.last3.join(' ')}${hit.last3.length ? `  ✅ ถูก ${hit.last3.join(', ')}` : '  ❌'}`);
console.log(`   bot เลือก 3 ตัวหน้า: ${prev.picks.front3.join(' ')}${hit.front3.length ? `  ✅ ถูก ${hit.front3.join(', ')}` : '  ❌'}`);
console.log(`   bot เลือก 6 หลัก: ${prev.picks.first.join(' ')}${hit.first.length ? `  ✅ ${hit.first.map((x) => x.t).join(', ')}` : '  ❌'}`);
console.log(`   รวมเงินรางวัล ฿${money.toLocaleString('th-TH')} จากต้นทุน ฿${(Object.values(ALERT_PICKS).reduce((a, b) => a + b, 0) * 80).toLocaleString('th-TH')}`);

// 3) ทดสอบเลข (ถ้าระบุ)
if (checkArg) console.log(`\n③ ${checkText(draws, checkArg).replace(/\n/g, '\n   ')}`);

// 4) ข้อความที่จะส่งเข้า LINE
const messages = [picksMessage(next, draws, siteUrl), resultMessage(latest, draws, siteUrl)];
console.log(`\n${checkArg ? '④' : '③'} ข้อความที่จะส่งเข้า LINE (ข้อความสำรองของการ์ด)`);
for (const m of messages) console.log('   ┌ ' + m.altText.replace(/\n/g, '\n   │ ') + '\n   └');

if (!send) {
  console.log(`${line}\nโหมดทดสอบ: ยังไม่ได้ส่งเข้า LINE · ใส่ --send เพื่อส่งจริง`);
} else {
  try {
    const n = await pushToGroups(messages);
    console.log(`${line}\n✅ ส่งเข้า LINE แล้ว ${n} กลุ่ม (${groupIds().join(', ')})`);
  } catch (err) {
    console.error(`${line}\n✗ ส่งไม่สำเร็จ: ${err.message}\n  ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN และ LINE_GROUP_IDS ก่อน (ดู docs/LINE_SETUP.md)`);
    process.exit(1);
  }
}
