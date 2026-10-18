// โหลดผลสลาก: ประวัติ 10 ปีจากไฟล์ของเว็บ + งวดใหม่ที่ออกหลัง deploy ล่าสุด (ไม่ต้อง deploy ใหม่)
import { parseCsv, fromPrimaryRow, fromArchiveText, checkDraw } from '../../src/lib/parse.js';
import { todayInThailand } from '../../src/lib/schedule.js';

const PRIMARY = 'https://raw.githubusercontent.com/new4761/Thai_lottery_analysis/main/lottery_results.csv';
const ARCHIVE = (d) => `https://raw.githubusercontent.com/vicha-w/thai-lotto-archive/master/lottonumbers/${d}.txt`;
const mainOk = (d) => !checkDraw(d).some((i) => /^(first|last2|front3|last3)/.test(i));

async function text(url) {
  const res = await fetch(url);
  return res.ok ? res.text() : null;
}

// baseDraws: ส่งประวัติมาเองได้ (เช่น สคริปต์ทดสอบที่อ่านจากไฟล์ในเครื่อง) แทนการโหลดจากเว็บ
export async function loadDraws(siteUrl = process.env.URL, now = new Date(), baseDraws = null) {
  const base = baseDraws ?? JSON.parse(await text(`${siteUrl}/data/draws.json`)).draws;
  const known = new Set(base.map((d) => d.date));
  const last = base.at(-1).date;
  const fresh = [];
  const csv = await text(PRIMARY).catch(() => null);
  if (csv) {
    for (const d of parseCsv(csv).map(fromPrimaryRow)) {
      if (d.date > last && !known.has(d.date) && mainOk(d)) { fresh.push({ ...d, source: 'glo' }); known.add(d.date); }
    }
  }
  // คลังสำรองมักอัปเดตเร็วกว่า: ลองดูงวดของวันนี้ (เวลาไทย)
  const today = todayInThailand(now);
  if (today > last && !known.has(today)) {
    const t = await text(ARCHIVE(today)).catch(() => null);
    const d = t && fromArchiveText(today, t);
    if (d && mainOk(d)) fresh.push({ ...d, source: 'archive' });
  }
  return [...base, ...fresh].sort((a, b) => a.date.localeCompare(b.date));
}
