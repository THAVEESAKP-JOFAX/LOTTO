// สถิติพื้นฐานของผลสลาก — ใช้ร่วมกันทั้งหน้าเว็บ, bot และ backtest

// "เกม" คือรางวัลที่สนใจ: จำนวนหลัก, ขนาดพื้นที่เลข, และเลขที่ออกในแต่ละงวด
export const GAMES = {
  last2: { key: 'last2', label: 'เลขท้าย 2 ตัว', digits: 2, space: 100, perDraw: 1, values: (d) => [d.last2] },
  last3: { key: 'last3', label: 'เลขท้าย 3 ตัว', digits: 3, space: 1000, perDraw: 2, values: (d) => d.last3 },
  front3: { key: 'front3', label: 'เลขหน้า 3 ตัว', digits: 3, space: 1000, perDraw: 2, values: (d) => d.front3 },
  first: { key: 'first', label: 'ล็อตเตอรี่ 6 หลัก (ทุกรางวัล)', digits: 6, space: 1_000_000, perDraw: 1, values: (d) => [d.first] },
};

export const pad = (n, digits) => String(n).padStart(digits, '0');

// นับความถี่ของทุกเลขในพื้นที่ (ใช้กับเกมที่ space ≤ 1000)
export function frequency(draws, game) {
  const counts = new Array(game.space).fill(0);
  for (const d of draws) for (const v of game.values(d)) counts[Number(v)]++;
  return counts;
}

// จำนวนงวดนับจากครั้งล่าสุดที่เลขนั้นออก (ไม่เคยออก = draws.length + 1)
export function gaps(draws, game) {
  const gap = new Array(game.space).fill(draws.length + 1);
  for (let i = draws.length - 1; i >= 0; i--) {
    for (const v of game.values(draws[i])) {
      const n = Number(v);
      if (gap[n] === draws.length + 1) gap[n] = draws.length - i;
    }
  }
  return gap;
}

// ความถี่ของหลัก 0–9 ในแต่ละตำแหน่ง → matrix [position][digit]
export function positional(draws, game) {
  const m = Array.from({ length: game.digits }, () => new Array(10).fill(0));
  for (const d of draws) for (const v of game.values(d)) {
    for (let p = 0; p < game.digits; p++) m[p][v.charCodeAt(p) - 48]++;
  }
  return m;
}

// ระยะห่างของหลักในแต่ละตำแหน่ง → matrix [position][digit]
export function positionalGaps(draws, game) {
  const m = Array.from({ length: game.digits }, () => new Array(10).fill(draws.length + 1));
  for (let i = draws.length - 1; i >= 0; i--) {
    for (const v of game.values(draws[i])) {
      for (let p = 0; p < game.digits; p++) {
        const dgt = v.charCodeAt(p) - 48;
        if (m[p][dgt] === draws.length + 1) m[p][dgt] = draws.length - i;
      }
    }
  }
  return m;
}

// เมทริกซ์การเปลี่ยนหลัก: งวดก่อนหลัก a → งวดถัดไปหลัก b ในตำแหน่งเดียวกัน → [p][a][b]
export function transitions(draws, game) {
  const m = Array.from({ length: game.digits }, () => Array.from({ length: 10 }, () => new Array(10).fill(0)));
  for (let i = 1; i < draws.length; i++) {
    for (const a of game.values(draws[i - 1])) for (const b of game.values(draws[i])) {
      for (let p = 0; p < game.digits; p++) m[p][a.charCodeAt(p) - 48][b.charCodeAt(p) - 48]++;
    }
  }
  return m;
}

// --- สถิติทดสอบ ---

// log-gamma (Lanczos) สำหรับคำนวณ p-value
function lgamma(x) {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// regularized upper incomplete gamma Q(s, x) — ใช้หา p-value ของ chi-square
function gammaQ(s, x) {
  if (x <= 0) return 1;
  if (x < s + 1) {
    let sum = 1 / s, term = sum;
    for (let n = 1; n < 500; n++) { term *= x / (s + n); sum += term; if (term < sum * 1e-14) break; }
    return 1 - Math.exp(-x + s * Math.log(x) - lgamma(s)) * sum;
  }
  let b = x + 1 - s, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - s);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.exp(-x + s * Math.log(x) - lgamma(s)) * h;
}

// ทดสอบว่าความถี่สม่ำเสมอ (สุ่มจริง) หรือไม่ — p สูง = ไม่มีหลักฐานว่าเอนเอียง
export function chiSquareUniform(counts) {
  const n = counts.reduce((a, b) => a + b, 0);
  const e = n / counts.length;
  const stat = counts.reduce((s, c) => s + (c - e) ** 2 / e, 0);
  const df = counts.length - 1;
  return { stat, df, p: gammaQ(df / 2, stat / 2) };
}

// P(X ≥ k) เมื่อ X ~ Binomial(n, p)
export function binomialUpperTail(k, n, p) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  const logP = Math.log(p), logQ = Math.log1p(-p);
  const lnC = (i) => lgamma(n + 1) - lgamma(i + 1) - lgamma(n - i + 1);
  let sum = 0;
  for (let i = k; i <= n; i++) {
    const term = Math.exp(lnC(i) + i * logP + (n - i) * logQ);
    sum += term;
    if (i > n * p && term < sum * 1e-15) break;
  }
  return Math.min(1, sum);
}

// สรุปภาพรวมของเลขท้าย 2 ตัว / รางวัลที่ 1
export function summary(draws) {
  const last2 = draws.map((d) => Number(d.last2));
  const odd = last2.filter((n) => n % 2).length;
  const high = last2.filter((n) => n >= 50).length;
  const doubles = last2.filter((n) => Math.floor(n / 10) === n % 10).length;
  const digitSum = draws.map((d) => [...d.first].reduce((s, c) => s + Number(c), 0));
  const sumHist = new Array(55).fill(0);
  for (const s of digitSum) sumHist[s]++;
  let repeats = 0;
  for (let i = 1; i < draws.length; i++) if (draws[i].last2 === draws[i - 1].last2) repeats++;
  return {
    draws: draws.length,
    odd, even: draws.length - odd, high, low: draws.length - high, doubles,
    meanDigitSum: digitSum.reduce((a, b) => a + b, 0) / digitSum.length,
    sumHist,
    consecutiveRepeats: repeats,
    chiLast2: chiSquareUniform(frequency(draws, GAMES.last2)),
    chiFirstPositions: positional(draws, GAMES.first).map(chiSquareUniform),
  };
}

// จำนวนครั้งที่เลข 0–9 ออกในแต่ละหลัก (สถิติหวยแยกตามหลัก)
// 2 ตัวบน = 2 หลักท้ายรางวัลที่ 1 · 2 ตัวล่าง = เลขท้าย 2 ตัว · 3 ตัวบน = 3 หลักท้ายรางวัลที่ 1
export const PLACE_STATS = [
  { key: 'top2', label: 'เลข 2 ตัวบน', note: '2 หลักท้ายของรางวัลที่ 1', value: (d) => d.first.slice(4) },
  { key: 'bottom2', label: 'เลขท้าย 2 ตัว (2 ตัวล่าง)', note: 'เลขท้าย 2 ตัว', value: (d) => d.last2 },
  { key: 'top3', label: 'เลข 3 ตัวบน', note: '3 หลักท้ายของรางวัลที่ 1', value: (d) => d.first.slice(3) },
];
const PLACE_NAMES = ['ร้อย', 'สิบ', 'หน่วย'];

export function digitsByPlace(draws, value) {
  const len = value(draws[0]).length;
  const rows = Array.from({ length: len }, (_, p) => ({ label: PLACE_NAMES[3 - len + p], counts: new Array(10).fill(0) }));
  for (const d of draws) {
    const v = value(d);
    for (let p = 0; p < len; p++) rows[p].counts[v.charCodeAt(p) - 48]++;
  }
  const total = Array.from({ length: 10 }, (_, dgt) => rows.reduce((s, r) => s + r.counts[dgt], 0));
  return { rows, total, draws: draws.length };
}
