// ถาม bot ตามวันที่งวด เช่น "งวด 01/11/26", "งวด 1/11/2569", "งวด 1 พ.ย. 69"
import { picksMessage, resultMessage } from './line-messages.js';
import { isDrawDay, nextDrawDate, upcomingDraw } from './schedule.js';

const MONTHS = [
  ['มกราคม', 'ม.ค.', 'มค'], ['กุมภาพันธ์', 'ก.พ.', 'กพ'], ['มีนาคม', 'มี.ค.', 'มีค'], ['เมษายน', 'เม.ย.', 'เมย'],
  ['พฤษภาคม', 'พ.ค.', 'พค'], ['มิถุนายน', 'มิ.ย.', 'มิย'], ['กรกฎาคม', 'ก.ค.', 'กค'], ['สิงหาคม', 'ส.ค.', 'สค'],
  ['กันยายน', 'ก.ย.', 'กย'], ['ตุลาคม', 'ต.ค.', 'ตค'], ['พฤศจิกายน', 'พ.ย.', 'พย'], ['ธันวาคม', 'ธ.ค.', 'ธค'],
];

const thDate = (iso) => new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(iso + 'T00:00:00Z'));
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// ปี: 4 หลัก ≥ 2400 = พ.ศ. · 2 หลัก ≥ 60 = พ.ศ. ย่อ (69 → 2569) · 2 หลัก < 60 = ค.ศ. ย่อ (26 → 2026)
function toAdYear(raw) {
  const y = Number(raw);
  if (raw.length === 4) return y >= 2400 ? y - 543 : y;
  return y >= 60 ? 2500 + y - 543 : 2000 + y;
}

function valid(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// ไม่ระบุปี → เลือกครั้งที่ใกล้ที่สุดที่ยังไม่ผ่านไปเกิน 6 เดือน
function guessYear(m, d, today) {
  const y = Number(today.slice(0, 4));
  const cand = [y - 1, y, y + 1].map((yy) => iso(yy, m, d));
  const sixMonthsAgo = new Date(Date.parse(today + 'T00:00:00Z') - 182 * 864e5).toISOString().slice(0, 10);
  return Number((cand.find((c) => c >= sixMonthsAgo) ?? cand[1]).slice(0, 4));
}

// แปลงข้อความเป็นวันที่ ISO หรือ null
export function parseDrawDate(text, today) {
  const t = text.trim();
  let m = t.match(/(\d{1,2})\s*[/\-.]\s*(\d{1,2})(?:\s*[/\-.]\s*(\d{4}|\d{2}))?/);
  let day, month, year;
  if (m) {
    [day, month] = [Number(m[1]), Number(m[2])];
    year = m[3] ? toAdYear(m[3]) : null;
  } else {
    m = t.match(/(\d{1,2})\s*([ก-๙.]+)\s*(\d{4}|\d{2})?/);
    if (!m) return null;
    const name = m[2].replace(/\s/g, '');
    const idx = MONTHS.findIndex((names) => names.some((n) => n === name || n.replace(/\./g, '') === name.replace(/\./g, '')));
    if (idx < 0) return null;
    [day, month] = [Number(m[1]), idx + 1];
    year = m[3] ? toAdYear(m[3]) : null;
  }
  year ??= guessYear(month, day, today);
  return valid(year, month, day) ? iso(year, month, day) : null;
}

// งวดในข้อมูลที่ใกล้วันที่นั้นที่สุด
function nearestPast(draws, date) {
  return draws.reduce((best, d) =>
    Math.abs(Date.parse(d.date) - Date.parse(date)) < Math.abs(Date.parse(best.date) - Date.parse(date)) ? d : best);
}

const note = (t) => ({ type: 'text', text: t });

// ตอบคำถามตามวันที่: งวดที่ออกแล้ว → ผล + ตรวจเลข bot · งวดในอนาคต → เลข bot
export function drawQuery(draws, date, { today, siteUrl, settings } = {}) {
  const latest = draws.at(-1).date;
  const found = draws.find((d) => d.date === date);
  if (found) return [resultMessage(found, draws, siteUrl, settings)];

  if (date > latest) {
    if (isDrawDay(date)) {
      const upcoming = upcomingDraw(latest, today);
      const msgs = [];
      if (date === today) msgs.push(note(`งวด ${thDate(date)} ออกวันนี้ ผลยังไม่ออก — นี่คือเลขแนะนำจาก LOTTO-THAI`));
      else if (date > upcoming) msgs.push(note(`งวด ${thDate(date)} ยังไม่ใช่งวดถัดไป (งวดถัดไปคือ ${thDate(upcoming)}) bot คำนวณจากข้อมูลถึงงวดล่าสุด`));
      msgs.push(picksMessage(date, draws, siteUrl, settings));
      return msgs;
    }
    const prev = new Date(Date.parse(date + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
    const next = nextDrawDate(prev);
    return [note(`วันที่ ${thDate(date)} ไม่มีออกรางวัล งวดถัดไปคือ ${thDate(next)}`), picksMessage(next, draws, siteUrl, settings)];
  }

  if (date < draws[0].date) {
    return [note(`มีข้อมูลตั้งแต่ ${thDate(draws[0].date)} ถึง ${thDate(latest)} เท่านั้น`)];
  }
  const near = nearestPast(draws, date);
  return [note(`ไม่มีงวดวันที่ ${thDate(date)} — งวดที่ใกล้ที่สุดคือ ${thDate(near.date)}`), resultMessage(near, draws, siteUrl, settings)];
}

const MONTH_NAMES = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const thShort = (iso) => new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

// ทุกงวดในเดือนนั้น: "งวดเดือนธันวา" → งวด 1 และ 16 ธ.ค. (ออกแล้ว = ผลรางวัล · ยังไม่ออก = เลขแนะนำ)
// ไม่ระบุปี = ปีปัจจุบัน (พ.ศ.)
export function monthQuery(draws, month, yearBE, { today, siteUrl, settings } = {}) {
  const be = yearBE ?? Number(today.slice(0, 4)) + 543;
  const prefix = `${be - 543}-${String(month).padStart(2, '0')}`;
  const latest = draws.at(-1).date;
  const dates = new Set(draws.filter((d) => d.date.startsWith(prefix)).map((d) => d.date));
  // งวดตามปฏิทินที่ยังไม่มีผล
  let d = nextDrawDate(new Date(Date.parse(`${prefix}-01T00:00:00Z`) - 864e5).toISOString().slice(0, 10));
  for (; d.startsWith(prefix); d = nextDrawDate(d)) if (d > latest) dates.add(d);
  const list = [...dates].sort();
  const title = `งวดเดือน${MONTH_NAMES[month - 1]} ${be}`;
  if (!list.length) return [note(`${title} ไม่มีข้อมูล · มีข้อมูลตั้งแต่ ${thDate(draws[0].date)} ถึง ${thDate(latest)}`)];
  const future = list.filter((x) => x > latest);
  const header = `${title} มี ${list.length} งวด: ${list.map(thShort).join(' · ')}` +
    (future.length ? `\n${future.length === list.length ? 'ยังไม่ออกรางวัล' : `งวด ${future.map(thShort).join(' · ')} ยังไม่ออกรางวัล`} — เลขแนะนำจาก LOTTO-THAI คำนวณจากข้อมูลถึงงวด ${thDate(latest)}` : '');
  const cards = list.flatMap((x) => drawQuery(draws, x, { today, siteUrl, settings }).filter((m) => m.type === 'flex'));
  return [note(header), ...cards].slice(0, 5);
}
