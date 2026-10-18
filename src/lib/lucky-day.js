// เลขมงคลตามวันเกิด (หลักทักษา)
// วงทักษาเรียงตามดาว: อาทิตย์ 1 → จันทร์ 2 → อังคาร 3 → พุธ 4 → เสาร์ 7 → พฤหัสบดี 5 → ราหู 8 → ศุกร์ 6
// เริ่มนับจากดาววันเกิด ตำแหน่งที่ 1–8 คือ บริวาร อายุ เดช ศรี มูละ อุตสาหะ มนตรี กาลกิณี
export const DAYS = [
  { key: 'sun', name: 'อาทิตย์', num: 1, aliases: ['อาทิตย์', 'อาทิต'] },
  { key: 'mon', name: 'จันทร์', num: 2, aliases: ['จันทร์', 'จันทร', 'จัน'] },
  { key: 'tue', name: 'อังคาร', num: 3, aliases: ['อังคาร', 'อังคาน'] },
  { key: 'wed', name: 'พุธ (กลางวัน)', num: 4, aliases: ['พุธกลางวัน', 'พุธ', 'พุท'] },
  { key: 'thu', name: 'พฤหัสบดี', num: 5, aliases: ['พฤหัสบดี', 'พฤหัส', 'พฤ'] },
  { key: 'fri', name: 'ศุกร์', num: 6, aliases: ['ศุกร์', 'ศุก'] },
  { key: 'sat', name: 'เสาร์', num: 7, aliases: ['เสาร์', 'เสา'] },
  { key: 'rahu', name: 'พุธกลางคืน (ราหู)', num: 8, aliases: ['พุธกลางคืน', 'ราหู'] },
];
const CYCLE = [1, 2, 3, 4, 7, 5, 8, 6];
const ROLES = ['บริวาร', 'อายุ', 'เดช', 'ศรี', 'มูละ', 'อุตสาหะ', 'มนตรี', 'กาลกิณี'];
const JS_WEEKDAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// หาวันจากข้อความ เช่น "วันจันทร์", "พุธกลางคืน" (เช็คชื่อยาวก่อน กัน "พุธ" ไปจับ "พุธกลางคืน")
export function parseDay(text) {
  const t = String(text).replace(/\s+|วัน|เกิด/g, '');
  if (!t) return null;
  const all = DAYS.flatMap((d) => d.aliases.map((a) => [a, d])).sort((a, b) => b[0].length - a[0].length);
  return all.find(([a]) => t.startsWith(a))?.[1] ?? null;
}

// วันในสัปดาห์ของวันที่ ISO (เวลาไทย)
export const dayOf = (iso) => DAYS.find((d) => d.key === JS_WEEKDAY[new Date(iso + 'T00:00:00Z').getUTCDay()]);

const permutations = (arr) => (arr.length <= 1 ? [arr] : arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p])));

export function luckyNumbers(day) {
  const start = CYCLE.indexOf(day.num);
  const role = Object.fromEntries(ROLES.map((r, i) => [r, CYCLE[(start + i) % 8]]));
  const lucky = [role['บริวาร'], role['ศรี'], role['เดช']];
  return {
    day,
    main: role['บริวาร'], sri: role['ศรี'], dech: role['เดช'], kalakini: role['กาลกิณี'],
    two: [...new Set(permutations(lucky).flatMap(([a, b]) => [`${a}${b}`]))],
    three: permutations(lucky).map((p) => p.join('')),
  };
}
