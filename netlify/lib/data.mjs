// โหลดผลสลาก: ประวัติ 10 ปีจากไฟล์ของเว็บ + งวดใหม่ที่ออกหลัง deploy ล่าสุด (ไม่ต้อง deploy ใหม่)
import { parseCsv, fromPrimaryRow, fromArchiveText, fromGloResult, checkDraw } from '../../src/lib/parse.js';
import { todayInThailand, nextDrawDate } from '../../src/lib/schedule.js';
import { readJSON, writeJSON } from './settings.mjs';

const PRIMARY = 'https://raw.githubusercontent.com/new4761/Thai_lottery_analysis/main/lottery_results.csv';
const ARCHIVE = (d) => `https://raw.githubusercontent.com/vicha-w/thai-lotto-archive/master/lottonumbers/${d}.txt`;
const mainOk = (d) => !checkDraw(d).some((i) => /^(first|last2|front3|last3)/.test(i));

async function text(url, timeoutMs = 5000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  return res.ok ? res.text() : null;
}

// ผลงวดล่าสุดจากสำนักงานสลากกินแบ่งรัฐบาลโดยตรง (POST เท่านั้น)
export const GLO_LATEST = 'https://www.glo.or.th/api/lottery/getLatestLottery';
export const GLO_BY_DATE = 'https://www.glo.or.th/api/checking/getLotteryResult';
async function gloPost(url, body, timeoutMs) {
  const res = await fetch(url, {
    method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    headers: { 'content-type': 'application/json', accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json())?.response;
}

export async function latestFromGlo(timeoutMs = 6000) {
  const r = await gloPost(GLO_LATEST, {}, timeoutMs);
  if (!r?.date) throw new Error('รูปแบบข้อมูลไม่ตรง');
  return fromGloResult(r);
}

// ผลทางการของงวดที่ระบุ (ใช้แก้งวดที่ 2 แหล่งข้อมูลไม่ตรงกันหรือข้อมูลไม่ครบ)
export async function officialDraw(date, timeoutMs = 6000) {
  const [year, month, day] = date.split('-');
  const r = (await gloPost(GLO_BY_DATE, { date: day, month, year }, timeoutMs))?.result;
  if (!r?.data?.first) throw new Error('ไม่พบผลของงวดนี้');
  const d = fromGloResult({ ...r, date });
  const issues = checkDraw(d);
  if (issues.length) throw new Error(`ข้อมูลไม่ครบ (${issues.join(', ')})`);
  return d;
}

// ผลทางการที่ตรวจแล้ว เก็บใน Netlify Blobs และใช้แทนข้อมูลจากคลังบน GitHub ของงวดเดียวกัน
export const OFFICIAL_KEY = 'official-draws';
const PRIZE_KEYS = ['first', 'near', 'second', 'third', 'fourth', 'fifth', 'front3', 'last3', 'last2'];
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

export async function verifyWithGlo(dates, current = [], { concurrency = 4 } = {}) {
  const saved = (await readJSON(OFFICIAL_KEY)) ?? { draws: {} };
  const byDate = new Map(current.map((d) => [d.date, d]));
  const report = [];
  const queue = [...new Set(dates)];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    for (let date; (date = queue.shift());) {
      try {
        const d = await officialDraw(date);
        const old = byDate.get(date);
        const fixed = old ? PRIZE_KEYS.filter((k) => !same([].concat(old[k] ?? []), [].concat(d[k]))) : PRIZE_KEYS;
        saved.draws[date] = { ...d, source: 'glo-official' };
        report.push({ date, ok: true, fixed });
      } catch (err) {
        report.push({ date, ok: false, error: err.name === 'TimeoutError' ? 'หมดเวลาเชื่อมต่อ' : err.message });
      }
    }
  }));
  report.sort((a, b) => a.date.localeCompare(b.date));
  const summary = { checkedAt: new Date().toISOString(), checked: report.length,
    verified: report.filter((r) => r.ok).length, corrected: report.filter((r) => r.ok && r.fixed.length).length,
    failed: report.filter((r) => !r.ok).length };
  await writeJSON(OFFICIAL_KEY, { draws: saved.draws, last: { ...summary, report } });
  return { ...summary, report };
}

// ใช้ในแผงสถานะหน้า Admin: ทดสอบว่าเรียก API ของกองสลากจาก Netlify ได้จริงหรือไม่
export async function checkGlo() {
  try {
    const d = await latestFromGlo(5000);
    return { ok: Boolean(d.first), date: d.date, first: d.first };
  } catch (err) {
    return { ok: false, error: err.name === 'TimeoutError' ? 'หมดเวลาเชื่อมต่อ' : err.message };
  }
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
  const loaded = baseDraws ?? await baseFromSite(siteUrl, now);
  // งวดที่ตรวจกับกองสลากแล้ว (verifyWithGlo) ใช้ผลทางการแทน
  const official = (await readJSON(OFFICIAL_KEY))?.draws ?? {};
  const base = loaded.map((d) => official[d.date] ?? d);
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
  // 1) API ของกองสลาก: ได้ผลทันทีที่ประกาศ (ระหว่างถ่ายทอดสดรางวัลย่อยอาจยังไม่ครบ → เก็บเป็น partial แล้วอัปเดตรอบถัดไป)
  const glo = await latestFromGlo().catch((err) => { console.warn('GLO API:', err.message); return null; });
  if (glo && glo.date > baseLast && !complete.has(glo.date) && mainOk(glo)) upsert({ ...glo, source: 'glo-api' });
  // 2) คลังข้อมูลบน GitHub: ใช้ตรวจข้าม/สำรองเมื่อ API ของกองสลากเรียกไม่ได้
  const csv = await text(PRIMARY).catch(() => null);
  if (csv) {
    for (const d of parseCsv(csv).map(fromPrimaryRow)) {
      if (d.date > baseLast && !complete.has(d.date) && mainOk(d)) upsert({ ...d, source: 'glo' });
    }
  }
  // 3) คลังสำรองบน GitHub: ลองดูงวดของวันนี้ (เวลาไทย)
  if (today > baseLast && !complete.has(today) && !fresh.some((d) => d.date === today)) {
    const t = await text(ARCHIVE(today)).catch(() => null);
    const d = t && fromArchiveText(today, t);
    if (d && mainOk(d)) upsert({ ...d, source: 'archive' });
  }
  for (const d of fresh) if (!d.partial) delete d.partial;
  await writeJSON(cacheKey, { draws: fresh, checkedAt: now.toISOString() });
  return merged();
}
