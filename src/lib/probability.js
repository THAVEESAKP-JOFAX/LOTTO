// ความน่าจะเป็นของแต่ละประเภทเลข + สถิติจริงย้อนหลัง (ใช้กับคำสั่ง LINE เช่น "3ตัวบน", "2ตัวล่าง")
// ความน่าจะเป็นคิดจากจำนวนตัวเลขที่เป็นไปได้ (ทุกตัวเลขมีโอกาสเท่ากันทุกงวด)
export const PROB_KINDS = {
  front3: { label: 'เลขหน้า 3 ตัว', note: 'ออกงวดละ 2 ชุด', digits: 3, perDraw: 2, values: (d) => d.front3 },
  last3: { label: 'เลขท้าย 3 ตัว', note: 'ออกงวดละ 2 ชุด', digits: 3, perDraw: 2, values: (d) => d.last3 },
  top3: { label: 'เลข 3 ตัวบน', note: '3 หลักท้ายของรางวัลที่ 1', digits: 3, perDraw: 1, values: (d) => [d.first.slice(3)] },
  top2: { label: 'เลข 2 ตัวบน', note: '2 หลักท้ายของรางวัลที่ 1', digits: 2, perDraw: 1, values: (d) => [d.first.slice(4)] },
  bottom2: { label: 'เลข 2 ตัวล่าง', note: 'เลขท้าย 2 ตัว', digits: 2, perDraw: 1, values: (d) => [d.last2] },
  top4: { label: 'เลข 4 ตัวบน', note: '4 หลักท้ายของรางวัลที่ 1', digits: 4, perDraw: 1, values: (d) => [d.first.slice(2)] },
  top5: { label: 'เลข 5 ตัวบน', note: '5 หลักท้ายของรางวัลที่ 1', digits: 5, perDraw: 1, values: (d) => [d.first.slice(1)] },
};
const PLACE = ['แสน', 'หมื่น', 'พัน', 'ร้อย', 'สิบ', 'หน่วย'];

export function probabilityStats(draws, kind) {
  const k = PROB_KINDS[kind];
  const space = 10 ** k.digits;
  const counts = new Map();
  const pos = Array.from({ length: k.digits }, () => new Array(10).fill(0));
  for (const d of draws) {
    for (const v of k.values(d)) {
      counts.set(v, (counts.get(v) ?? 0) + 1);
      for (let p = 0; p < k.digits; p++) pos[p][v.charCodeAt(p) - 48]++;
    }
  }
  const total = draws.length * k.perDraw;
  // เลขเด่นแต่ละหลัก: เลขที่ออกบ่อยที่สุดในแต่ละตำแหน่ง
  const places = pos.map((row, p) => {
    const digit = row.indexOf(Math.max(...row));
    return { place: PLACE[6 - k.digits + p], digit, rate: row[digit] / total };
  });
  return {
    kind, ...k,
    draws: draws.length,
    space,
    chance: k.perDraw / space,
    oneIn: Math.round(space / k.perDraw),
    expected: total / space, // จำนวนครั้งเฉลี่ยที่แต่ละตัวเลขควรออกในช่วงนี้
    seen: counts.size,
    frequent: [...counts].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5),
    places,
    composite: places.map((x) => x.digit).join(''),
    latest: k.values(draws.at(-1)),
  };
}
