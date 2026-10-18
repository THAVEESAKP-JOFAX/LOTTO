// Bot วิเคราะห์ & สุ่มเลข: ให้คะแนนทุกเลขจากประวัติ แล้วเลือก K เลข
//   mode 'analyze' → เลือกคะแนนสูงสุด (สุ่มเฉพาะตอนคะแนนเท่ากัน)
//   mode 'random'  → สุ่มถ่วงน้ำหนักตามคะแนน
import { frequency, gaps, positional, positionalGaps, transitions, pad } from './analysis.js';
import { weightedSample } from './rng.js';

const WINDOW = 60; // ประมาณ 2.5 ปีล่าสุด

const fullSpace = (game) => game.space <= 1000;
const digitsOf = (n, game) => [...pad(n, game.digits)].map(Number);

// แปลงคะแนนรายตำแหน่ง [p][digit] → คะแนนเต็มพื้นที่ (ผลคูณ)
function posToFull(pos, game) {
  const out = new Float64Array(game.space);
  for (let n = 0; n < game.space; n++) {
    out[n] = digitsOf(n, game).reduce((s, dg, p) => s * pos[p][dg], 1);
  }
  return out;
}

// แปลงคะแนนเป็นอันดับ 0..1 (ใช้รวมหลายกลยุทธ์)
function rankNormalize(arr) {
  const idx = [...arr.keys()].sort((a, b) => arr[a] - arr[b]);
  const out = new Float64Array(arr.length);
  idx.forEach((i, r) => { out[i] = (r + 1) / arr.length; });
  return out;
}

const recent = (H) => H.slice(-WINDOW);

// แต่ละ bot คืน { full } (คะแนนต่อเลข) สำหรับเกมเล็ก หรือ { pos } (คะแนน [ตำแหน่ง][หลัก]) สำหรับ 6 หลัก
export const BOTS = [
  {
    id: 'random', name: 'สุ่มล้วน', icon: '🎲',
    desc: 'ทุกเลขมีโอกาสเท่ากัน — ใช้เป็นเกณฑ์เปรียบเทียบ (baseline)',
    score: (H, game) => fullSpace(game)
      ? { full: new Float64Array(game.space).fill(1) }
      : { pos: Array.from({ length: game.digits }, () => new Array(10).fill(1)) },
  },
  {
    id: 'hot', name: 'เลขร้อน', icon: '🔥',
    desc: `เลขที่ออกบ่อยที่สุดใน ${WINDOW} งวดล่าสุด`,
    score: (H, game) => fullSpace(game)
      ? { full: Float64Array.from(frequency(recent(H), game), (c) => c + 0.5) }
      : { pos: positional(recent(H), game).map((r) => r.map((c) => c + 0.5)) },
  },
  {
    id: 'cold', name: 'เลขเย็น', icon: '❄️',
    desc: `เลขที่ออกน้อยที่สุดใน ${WINDOW} งวดล่าสุด`,
    score: (H, game) => fullSpace(game)
      ? { full: Float64Array.from(frequency(recent(H), game), (c) => 1 / (c + 0.5)) }
      : { pos: positional(recent(H), game).map((r) => r.map((c) => 1 / (c + 0.5))) },
  },
  {
    id: 'overdue', name: 'เลขค้าง', icon: '⏳',
    desc: 'เลขที่ไม่ออกมานานที่สุด (ทฤษฎี “ถึงคิวต้องออก”)',
    score: (H, game) => fullSpace(game)
      ? { full: Float64Array.from(gaps(H, game)) }
      : { pos: positionalGaps(H, game) },
  },
  {
    id: 'positional', name: 'หลักต่อตำแหน่ง', icon: '🧮',
    desc: 'ความถี่ของหลัก 0–9 ในแต่ละตำแหน่งตลอด 10 ปี นำมาคูณกัน',
    score: (H, game) => {
      const pos = positional(H, game).map((r) => {
        const n = r.reduce((a, b) => a + b, 0);
        return r.map((c) => (c + 1) / (n + 10));
      });
      return fullSpace(game) ? { full: posToFull(pos, game) } : { pos };
    },
  },
  {
    id: 'markov', name: 'มาร์คอฟ', icon: '🔗',
    desc: 'โอกาสของหลักถัดไป เมื่อรู้หลักของงวดล่าสุดในตำแหน่งเดียวกัน',
    score: (H, game) => {
      const T = transitions(H, game);
      const last = H.length ? game.values(H.at(-1)) : [];
      const pos = T.map((rows, p) => {
        const out = new Array(10).fill(0);
        for (const v of last) {
          const row = rows[v.charCodeAt(p) - 48];
          const n = row.reduce((a, b) => a + b, 0);
          row.forEach((c, b) => { out[b] += (c + 1) / (n + 10); });
        }
        return last.length ? out : out.fill(1);
      });
      return fullSpace(game) ? { full: posToFull(pos, game) } : { pos };
    },
  },
  {
    id: 'ensemble', name: 'รวมพลัง', icon: '👑',
    desc: 'เฉลี่ยอันดับจาก เลขร้อน + เลขค้าง + หลักต่อตำแหน่ง',
    score: (H, game) => {
      const parts = ['hot', 'overdue', 'positional'].map((id) => getBot(id).score(H, game));
      if (fullSpace(game)) {
        const ranks = parts.map((s) => rankNormalize(s.full));
        return { full: Float64Array.from(ranks[0], (_, i) => ranks.reduce((s, r) => s + r[i], 0) / ranks.length) };
      }
      const pos = parts[0].pos.map((_, p) => {
        const ranks = parts.map((s) => rankNormalize(s.pos[p]));
        return Array.from({ length: 10 }, (_, d) => ranks.reduce((s, r) => s + r[d], 0) / ranks.length);
      });
      return { pos };
    },
  },
];

export const getBot = (id) => BOTS.find((b) => b.id === id);

// เลือกเลข K ตัวจากคะแนนเต็มพื้นที่
function pickFull(scores, game, k, mode, rand) {
  const items = [...scores.keys()];
  if (mode === 'random') return weightedSample(items, scores, k, rand).map((n) => pad(n, game.digits));
  const jitter = items.map(() => rand() * 1e-9);
  items.sort((a, b) => scores[b] + jitter[b] - (scores[a] + jitter[a]));
  return items.slice(0, k).map((n) => pad(n, game.digits));
}

// อันดับของชุดหลักในช่วงตำแหน่ง [from, to) ตามผลคูณคะแนน (เช่น 3 ตัวหน้า = 1000 แบบ)
function rankSegment(pos, from, to, rand) {
  const len = to - from;
  const scored = [];
  for (let n = 0; n < 10 ** len; n++) {
    const s = pad(n, len);
    let v = 0;
    for (let i = 0; i < len; i++) {
      const w = pos[from + i];
      v += Math.log(w[s.charCodeAt(i) - 48] / (w.reduce((a, b) => a + b, 0) || 1) + 1e-12);
    }
    scored.push({ s, v: v + rand() * 1e-9 });
  }
  return scored.sort((a, b) => b.v - a.v).map((x) => x.s);
}

// เลือกเลข 6 หลัก K ใบจากคะแนนรายตำแหน่ง
// โหมดวิเคราะห์: แต่ละใบมี 3 ตัวหน้า / หลักที่ 4 / 2 ตัวท้าย ตามอันดับถัดลงไป
// เพื่อไม่ให้ทุกใบมีเลขท้ายเดียวกัน (ถูกพร้อมกันทั้งชุด = ผล backtest เอนเอียง)
function pickPositional(pos, k, mode, rand) {
  const out = new Set();
  if (mode === 'random') {
    for (let guard = 0; out.size < k && guard < k * 50; guard++) {
      out.add(pos.map((w) => weightedSample([...w.keys()], w, 1, rand)[0]).join(''));
    }
    return [...out];
  }
  const front = rankSegment(pos, 0, 3, rand);
  const mid = rankSegment(pos, 3, 4, rand);
  const back = rankSegment(pos, 4, 6, rand);
  for (let i = 0; out.size < k && i < 100; i++) out.add(front[i] + mid[i % 10] + back[i]);
  return [...out];
}

export function pick(botId, history, game, k, mode, rand) {
  const s = getBot(botId).score(history, game);
  return s.full ? pickFull(s.full, game, k, mode, rand) : pickPositional(s.pos, k, mode, rand);
}

// เหตุผลประกอบเลขที่ bot เลือก (แสดงบนหน้าเว็บ)
export function explain(number, history, game) {
  if (!fullSpace(game)) {
    const pos = positional(history, game);
    return [...number].map((d, p) => `ตำแหน่ง ${p + 1}: หลัก ${d} ออก ${pos[p][d]} ครั้ง`).join(' · ');
  }
  const n = Number(number);
  const all = frequency(history, game)[n];
  const hot = frequency(recent(history), game)[n];
  const gap = gaps(history, game)[n];
  const gapText = gap > history.length ? 'ยังไม่เคยออกในช่วงนี้' : `ออกล่าสุด ${gap} งวดก่อน`;
  return `ออก ${all} ครั้งใน 10 ปี · ${hot} ครั้งใน ${WINDOW} งวดล่าสุด · ${gapText}`;
}
