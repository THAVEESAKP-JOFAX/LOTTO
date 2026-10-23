// โหลดผลสลาก: ประวัติ 10 ปีจากไฟล์ของเว็บ + งวดใหม่ที่ออกหลัง deploy ล่าสุด (ไม่ต้อง deploy ใหม่)
import { parseCsv, fromPrimaryRow, fromArchiveText, checkDraw } from '../../src/lib/parse.js';
import { todayInThailand, nextDrawDate } from '../../src/lib/schedule.js';
import { readJSON, writeJSON } from './settings.mjs';

const PRIMARY = 'https://raw.githubusercontent.com/new4761/Thai_lottery_analysis/main/lottery_results.csv';
const ARCHIVE = (d) => `https://raw.githubusercontent.com/vicha-w/thai-lotto-archive/master/lottonumbers/${d}.txt`;
const mainOk = (d) => !checkDraw(d).some((i) => /^(first|last2|front3|last3)/.test(i));

async function text(url, timeoutMs = 5000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  return res.ok ? res.text() : null;
}

// ไฟล์ประวัติจากเว็บเปลี่ยนเฉพาะตอน deploy: จำไว้ 5 นาทีในหน่วยความจำของ function
const baseCache = new Map();
async function baseFromSite(siteUrl, now) {
  const hit = baseCache.get(siteUrl);
  if (hit && now - hit.at < 5 * 60e3) return hit.draws;
  const draws = JSON.parse(await text(`${siteUrl}/data/draws.json`)).draws;
  baseCache.set(siteUrl, { at: now, draws });
  return draws;
}

// baseDraws: ส่งประวัติมาเองได้ (เช่น สคริปต์ทดสอบที่อ่านจากไฟล์ในเครื่อง) แทนการโหลดจากเว็บ
const RECHECK_MS = 15 * 60e3;

// งวดใหม่ที่ออกหลัง deploy จะเก็บไว้ใน Netlify Blobs เพื่อไม่ต้องดาวน์โหลดไฟล์ผลจาก GitHub (~450KB) ทุกครั้ง
// · ยังไม่ใกล้งวดถัดไป → ใช้ข้อมูลที่มีเลย · ใกล้/ถึงวันออกรางวัล → เช็กแหล่งข้อมูลไม่บ่อยกว่าทุก 15 นาที
export async function loadDraws(siteUrl = process.env.URL, now = new Date(), baseDraws = null) {
  const base = baseDraws ?? await baseFromSite(siteUrl, now);
  const baseLast = base.at(-1).date;
  const cacheKey = `fresh-draws:${siteUrl}`;
  const cached = await readJSON(cacheKey);
  let fresh = (cached?.draws ?? []).filter((d) => d.date > baseLast);
  const merged = () => [...base, ...fresh].sort((a, b) => a.date.localeCompare(b.date));

  const last = merged().at(-1).date;
  const today = todayInThailand(now);
  // ยังไม่ใกล้งวดถัดไป → ไม่มีผลใหม่แน่นอน ไม่ต้องดาวน์โหลด (ตอบ LINE ได้เร็วขึ้น)
  // เผื่อ 3 วันสำหรับงวดที่ออกก่อนกำหนด เช่น 30 ธ.ค. แทน 2 ม.ค.
  const checkFrom = new Date(Date.parse(nextDrawDate(last) + 'T00:00:00Z') - 3 * 864e5).toISOString().slice(0, 10);
  const hasPartial = fresh.some((d) => d.partial);
  if (checkFrom > today && !hasPartial) return merged();
  if (cached?.checkedAt && now - Date.parse(cached.checkedAt) < RECHECK_MS) return merged();

  // งวดที่ข้อมูลครบแล้วไม่ต้องดึงซ้ำ · งวดที่รางวัลย่อยยังไม่ครบ ยอมให้แทนที่ด้วยข้อมูลที่ครบกว่า
  const complete = new Set([...base, ...fresh].filter((d) => !d.partial).map((d) => d.date));
  const upsert = (d) => {
    d.partial = checkDraw(d).length > 0 || undefined;
    const i = fresh.findIndex((x) => x.date === d.date);
    if (i < 0) fresh.push(d);
    else if (fresh[i].partial && !d.partial) fresh[i] = d;
  };
  const csv = await text(PRIMARY).catch(() => null);
  if (csv) {
    for (const d of parseCsv(csv).map(fromPrimaryRow)) {
      if (d.date > baseLast && !complete.has(d.date) && mainOk(d)) upsert({ ...d, source: 'glo' });
    }
  }
  // คลังสำรองมักอัปเดตเร็วกว่า: ลองดูงวดของวันนี้ (เวลาไทย)
  if (today > baseLast && !complete.has(today) && !fresh.some((d) => d.date === today)) {
    const t = await text(ARCHIVE(today)).catch(() => null);
    const d = t && fromArchiveText(today, t);
    if (d && mainOk(d)) upsert({ ...d, source: 'archive' });
  }
  for (const d of fresh) if (!d.partial) delete d.partial;
  await writeJSON(cacheKey, { draws: fresh, checkedAt: now.toISOString() });
  return merged();
}
