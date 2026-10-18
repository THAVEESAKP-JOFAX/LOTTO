// ตัวสุ่มแบบกำหนด seed ได้ เพื่อให้ผล backtest ทำซ้ำได้
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0];
}

export function hashSeed(...parts) {
  let h = 2166136261;
  for (const ch of parts.join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// สุ่มเลือก k รายการโดยไม่ซ้ำ ถ่วงน้ำหนักตาม weights
export function weightedSample(items, weights, k, rand) {
  const pool = items.map((item, i) => ({ item, w: Math.max(weights[i], 0) }));
  const out = [];
  while (out.length < k && pool.length) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let idx = pool.length - 1;
    if (total > 0) {
      let r = rand() * total;
      for (let i = 0; i < pool.length; i++) { r -= pool[i].w; if (r < 0) { idx = i; break; } }
    } else idx = Math.floor(rand() * pool.length);
    out.push(pool.splice(idx, 1)[0].item);
  }
  return out;
}
