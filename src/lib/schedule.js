// ปฏิทินออกรางวัลตามกำหนดปกติ: วันที่ 1 และ 16 ของทุกเดือน ยกเว้น
//   1 ม.ค. (ปีใหม่) → 2 ม.ค. · 16 ม.ค. (วันครู) → 17 ม.ค. · 1 พ.ค. (วันแรงงาน) → 2 พ.ค.
// กองสลากอาจเลื่อนวันเพิ่มเติมตามประกาศ จึงเป็นวันโดยประมาณ
const iso = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

export function scheduledDraw(year, month, half) {
  if (half === 0) {
    if (month === 0 || month === 4) return iso(year, month, 2);
    return iso(year, month, 1);
  }
  return month === 0 ? iso(year, 0, 17) : iso(year, month, 16);
}

// งวดถัดไปหลังวันที่ (ไม่รวมวันนั้น)
export function nextDrawDate(afterIso) {
  const d = new Date(afterIso + 'T00:00:00Z');
  for (let i = 0; i < 4; i++) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + Math.floor(i / 2);
    const c = scheduledDraw(y + Math.floor(m / 12), m % 12, i % 2);
    if (c > afterIso) return c;
  }
  throw new Error('unreachable');
}

export function isDrawDay(dateIso) {
  const prev = new Date(Date.parse(dateIso + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
  return nextDrawDate(prev) === dateIso;
}

// วันที่ปัจจุบันตามเวลาไทย (UTC+7)
export const todayInThailand = (now = new Date()) => new Date(now.getTime() + 7 * 3600e3).toISOString().slice(0, 10);

// งวดที่กำลังจะออก: ถ้าวันนี้เป็นวันออกรางวัลและผลยังไม่ออก = วันนี้
export function upcomingDraw(latestResultDate, today) {
  const yesterday = new Date(Date.parse(today + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
  return nextDrawDate(latestResultDate >= today ? latestResultDate : yesterday);
}
