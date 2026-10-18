// เลขลอย (เลขวิ่ง): หลักเดียวที่คาดว่าจะปรากฏในตำแหน่งใดก็ได้
//   ลอยบน  = 3 ตัวท้ายของรางวัลที่ 1 (3 ตัวบน)
//   ลอยล่าง = เลขท้าย 2 ตัว (2 ตัวล่าง)
const HALF_LIFE = 24;
const SOURCES = {
  top: { label: 'เลขลอยบน', where: '3 ตัวบน (ท้ายรางวัลที่ 1)', digits: (d) => d.first.slice(3) },
  bottom: { label: 'เลขลอยล่าง', where: '2 ตัวล่าง (เลขท้าย 2 ตัว)', digits: (d) => d.last2 },
};

// คะแนน = ความถี่ที่หลักนั้นปรากฏ ถ่วงน้ำหนักให้งวดล่าสุดมากกว่า (ใช้เฉพาะประวัติที่ส่งเข้ามา)
export function floatingDigits(history, kind, k = 3) {
  const src = SOURCES[kind];
  const n = src.digits(history[0] ?? { first: '000000', last2: '00' }).length;
  const score = new Array(10).fill(1);
  const recent = new Array(10).fill(0);
  const window = history.slice(-60);
  history.forEach((d, i) => {
    const w = 0.5 ** ((history.length - 1 - i) / HALF_LIFE);
    for (const c of new Set(src.digits(d))) score[Number(c)] += w;
  });
  for (const d of window) for (const c of new Set(src.digits(d))) recent[Number(c)]++;
  const picks = [...score.keys()].sort((a, b) => score[b] - score[a] || a - b).slice(0, k);
  return {
    kind, label: src.label, where: src.where,
    // โอกาสที่หลักหนึ่ง ๆ ปรากฏอย่างน้อย 1 ครั้งเมื่อทุกหลักสุ่มเท่ากัน
    chance: 1 - 0.9 ** n,
    picks: picks.map((digit) => ({ digit: String(digit), rate: window.length ? recent[digit] / window.length : 0 })),
    window: window.length,
  };
}
