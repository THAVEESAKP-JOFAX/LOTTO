// เลขมงคลตามเดือนเกิด (ราศี + ดาวเจ้าเรือน) และตามปีเกิด (ปีนักษัตร + เลขปี พ.ศ.)
// เลขดาวแบบไทย: อาทิตย์ 1 จันทร์ 2 อังคาร 3 พุธ 4 พฤหัสบดี 5 ศุกร์ 6 เสาร์ 7 ราหู 8
const PLANET = { 1: 'อาทิตย์', 2: 'จันทร์', 3: 'อังคาร', 4: 'พุธ', 5: 'พฤหัสบดี', 6: 'ศุกร์', 7: 'เสาร์', 8: 'ราหู' };
// ราศีแบบไทย (นิรายนะ) วันที่ดวงอาทิตย์ย้ายเข้าโดยประมาณ และดาวเจ้าเรือน
const SIGNS = [
  { name: 'มังกร', month: 1, day: 14, lord: 7 }, { name: 'กุมภ์', month: 2, day: 13, lord: 7 },
  { name: 'มีน', month: 3, day: 14, lord: 5 }, { name: 'เมษ', month: 4, day: 13, lord: 3 },
  { name: 'พฤษภ', month: 5, day: 14, lord: 6 }, { name: 'มิถุน', month: 6, day: 14, lord: 4 },
  { name: 'กรกฎ', month: 7, day: 16, lord: 2 }, { name: 'สิงห์', month: 8, day: 16, lord: 1 },
  { name: 'กันย์', month: 9, day: 16, lord: 4 }, { name: 'ตุลย์', month: 10, day: 17, lord: 6 },
  { name: 'พิจิก', month: 11, day: 16, lord: 3 }, { name: 'ธนู', month: 12, day: 16, lord: 5 },
];
export const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const MONTH_ALIASES = [
  ['ม.ค.', 'มค', 'มกรา'], ['ก.พ.', 'กพ', 'กุมภา'], ['มี.ค.', 'มีค', 'มีนา'], ['เม.ย.', 'เมย', 'เมษา'],
  ['พ.ค.', 'พค', 'พฤษภา'], ['มิ.ย.', 'มิย', 'มิถุนา'], ['ก.ค.', 'กค', 'กรกฎา'], ['ส.ค.', 'สค', 'สิงหา'],
  ['ก.ย.', 'กย', 'กันยา'], ['ต.ค.', 'ตค', 'ตุลา'], ['พ.ย.', 'พย', 'พฤศจิกา'], ['ธ.ค.', 'ธค', 'ธันวา'],
];
export const ANIMALS = ['ชวด (หนู)', 'ฉลู (วัว)', 'ขาล (เสือ)', 'เถาะ (กระต่าย)', 'มะโรง (งูใหญ่)', 'มะเส็ง (งูเล็ก)',
  'มะเมีย (ม้า)', 'มะแม (แพะ)', 'วอก (ลิง)', 'ระกา (ไก่)', 'จอ (สุนัข)', 'กุน (หมู)'];

const signFor = (month, day) => {
  const i = SIGNS.findIndex((s) => s.month === month);
  return day >= SIGNS[i].day ? SIGNS[i] : SIGNS[(i + 11) % 12];
};
const pairs = (digits) => {
  const u = [...new Set(digits)];
  return [...new Set(u.flatMap((a) => u.map((b) => `${a}${b}`)).filter((p) => p[0] !== p[1] || u.length === 1))];
};

// "ต.ค." / "ตุลาคม" / "10" / "25/10" / "25 ต.ค." → { month, day|null }
export function parseBirthMonth(text) {
  // ตัดปีท้ายออก ("25/10/2530", "ต.ค. 2530") — เดือนเกิดไม่ใช้ปี
  const t = String(text).replace(/[๐-๙]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'.indexOf(d)).replace(/\s+|เดือน|เกิด|วันที่|พ\.?ศ\.?|ค\.?ศ\.?/g, '')
    .replace(/^(\d{1,2}[/\-.]\d{1,2})[/\-.]\d{2,4}$/, '$1').replace(/^(\d{0,2}[ก-๙.]+?)\d{2,4}$/, '$1');
  if (!t) return null;
  let m = t.match(/^(\d{1,2})[/\-.](\d{1,2})$/);
  if (m) return valid(Number(m[2]), Number(m[1]));
  m = t.match(/^(\d{1,2})?([ก-๙.]+)$/);
  if (m) {
    const name = m[2].replace(/\./g, '');
    const idx = MONTHS.findIndex((full, i) => full.startsWith(name) || name.startsWith(full) ||
      MONTH_ALIASES[i].some((a) => a.replace(/\./g, '') === name));
    return idx < 0 ? null : valid(idx + 1, m[1] ? Number(m[1]) : null);
  }
  m = t.match(/^(\d{1,2})$/);
  return m ? valid(Number(m[1]), null) : null;
}
const valid = (month, day) => (month >= 1 && month <= 12 && (day === null || (day >= 1 && day <= 31)) ? { month, day } : null);

export function monthLucky({ month, day }) {
  const signs = day ? [signFor(month, day)] : [signFor(month, 1), signFor(month, 31)];
  const monthDigits = String(month).split('').map(Number);
  const digits = [...monthDigits, ...signs.map((s) => s.lord)];
  return {
    month, day, monthName: MONTHS[month - 1],
    signs: signs.map((s) => ({ name: s.name, lord: s.lord, planet: PLANET[s.lord], from: `${s.day} ${MONTHS[s.month - 1]}` })),
    // เกิดเดือนนี้แต่ไม่ระบุวัน: ครึ่งแรกของเดือนเป็นราศีก่อนหน้า ครึ่งหลังเป็นราศีของเดือน
    splitDay: day ? null : SIGNS.find((s) => s.month === month).day,
    main: [...new Set(digits)],
    two: pairs(digits).slice(0, 6),
  };
}

// "2530" / "1987" / "30" → ปี พ.ศ.
export function parseBirthYear(text, currentBE = 2569) {
  // รับวันเกิดเต็มได้ด้วย เช่น "25/10/2530" หรือ "25 ต.ค. 2530" → ใช้ตัวเลขชุดสุดท้าย
  const t = String(text).replace(/[๐-๙]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'.indexOf(d)).replace(/\s+|ปี|เกิด|พ\.?ศ\.?|ค\.?ศ\.?/g, '')
    .replace(/^.*?(?:[/\-.]|[ก-๙]\.?)(\d{2,4})$/, '$1');
  if (!/^\d{2}$|^\d{4}$/.test(t)) return null;
  const n = Number(t);
  if (t.length === 2) return n <= currentBE % 100 ? 2500 + n : 2400 + n;
  const be = n < 2400 ? n + 543 : n;
  return be > 2400 && be <= currentBE ? be : null;
}

export function yearLucky(be) {
  const ad = be - 543;
  const idx = (((ad - 4) % 12) + 12) % 12; // ค.ศ. 2020 = ชวด
  const order = idx + 1;
  const tail3 = String(be).slice(-3);
  const digits = [...String(order).split('').map(Number), Number(String(be).at(-1))];
  return {
    be, ad, animal: ANIMALS[idx], order,
    main: [...new Set(digits)],
    two: [...new Set([String(be).slice(-2), ...pairs(digits)])].slice(0, 6),
    three: [...new Set([tail3, tail3.split('').reverse().join('')])],
  };
}
