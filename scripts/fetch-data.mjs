// ดึงผลสลากกินแบ่งรัฐบาลย้อนหลัง 10 ปีจาก 2 แหล่ง แล้วตรวจสอบข้ามแหล่ง
//   หลัก:     new4761/Thai_lottery_analysis (ดึงจาก GLO API)
//   ตรวจข้าม: vicha-w/thai-lotto-archive (ดึงจาก sanook / kapook)
// ผลลัพธ์: public/data/draws.json และ public/data/validation.json
import { writeFile, mkdir, readFile, readdir, rm, mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const YEARS = Number(process.env.YEARS || 10);
const PRIMARY_URL =
  'https://raw.githubusercontent.com/new4761/Thai_lottery_analysis/main/lottery_results.csv';
const SECONDARY_REPO = 'https://github.com/vicha-w/thai-lotto-archive.git';
const OUT_DIR = new URL('../public/data/', import.meta.url);

async function fetchText(url, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i >= tries - 1) throw new Error(`${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
    }
  }
}

// CSV parser ที่รองรับค่าใน "..." ซึ่งมีจุลภาค
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.length > 1);
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const list = (s) => (s ? s.split(/[,\s]+/).filter(Boolean).sort() : []);

export function fromPrimaryRow(r) {
  return {
    date: r.date,
    first: r.first,
    near: list(r.near1),
    second: list(r.second),
    third: list(r.third),
    fourth: list(r.fourth),
    fifth: list(r.fifth),
    front3: list(r.last3f),
    last3: list(r.last3b),
    last2: r.last2.padStart(2, '0'),
  };
}

export function fromArchiveText(date, text) {
  const map = {};
  for (const line of text.split('\n').slice(1)) {
    const [key, ...nums] = line.trim().split(/\s+/);
    if (key) map[key] = nums.sort();
  }
  return {
    date,
    first: map.FIRST?.[0] ?? '',
    near: map.NEAR_FIRST ?? [],
    second: map.SECOND ?? [],
    third: map.THIRD ?? [],
    fourth: map.FOURTH ?? [],
    fifth: map.FIFTH ?? [],
    front3: map.THREE_FIRST ?? [],
    last3: map.THREE_LAST ?? [],
    last2: map.TWO?.[0] ?? '',
  };
}

const EXPECTED = { near: 2, second: 5, third: 10, fourth: 50, fifth: 100, front3: 2, last3: 2 };

export function checkDraw(d) {
  const problems = [];
  if (!/^\d{6}$/.test(d.first)) problems.push('first');
  if (!/^\d{2}$/.test(d.last2)) problems.push('last2');
  for (const [k, n] of Object.entries(EXPECTED)) {
    if (d[k].length !== n) problems.push(`${k}:${d[k].length}/${n}`);
  }
  return problems;
}

const FIELDS = ['first', 'last2', 'front3', 'last3', 'near', 'second', 'third', 'fourth', 'fifth'];

// รวม 2 แหล่ง: ยึดแหล่งหลัก (GLO) เป็นค่าจริง เติมงวดที่แหล่งหลักไม่มีจากแหล่งรอง
// งวดที่เลื่อนวัน (เช่น 1 เม.ย. 2563 → 16 พ.ค. 2563) จับคู่ด้วยเลขรางวัลที่ 1
export function mergeSources(primary, secondary, cutoff) {
  const p = primary.filter((d) => d.date >= cutoff);
  const s = secondary.filter((d) => d.date >= cutoff);
  const sByDate = new Map(s.map((d) => [d.date, d]));
  const sByFirst = new Map(s.map((d) => [d.first, d]));
  const pFirsts = new Set(p.map((d) => d.first));
  const report = [];
  const draws = [];
  for (const d of p) {
    const other = sByDate.get(d.date) ?? sByFirst.get(d.first);
    const issues = checkDraw(d);
    if (!other) { report.push({ date: d.date, status: 'missing-secondary', issues }); }
    else {
      const diff = FIELDS.filter((f) => JSON.stringify(d[f]) !== JSON.stringify(other[f]));
      const note = other.date !== d.date ? `secondary date ${other.date}` : undefined;
      report.push({ date: d.date, status: diff.length ? 'mismatch' : 'match', diff, issues, note });
    }
    draws.push({ ...d, source: 'glo' });
  }
  for (const d of s) {
    if (p.some((x) => x.date === d.date) || pFirsts.has(d.first)) continue;
    const issues = checkDraw(d);
    report.push({ date: d.date, status: 'secondary-only', issues });
    // รางวัลหลักครบ แต่รางวัลย่อยไม่ครบ → ใช้ได้กับการวิเคราะห์หวย แต่ติดธง partial
    const mainOk = !issues.some((i) => /^(first|last2|front3|last3)/.test(i));
    if (mainOk) draws.push({ ...d, source: 'archive', ...(issues.length ? { partial: true } : {}) });
  }
  draws.sort((a, b) => a.date.localeCompare(b.date));
  report.sort((a, b) => a.date.localeCompare(b.date));
  return { draws, report };
}

async function loadSecondary() {
  const dir = await mkdtemp(join(tmpdir(), 'lotto-archive-'));
  try {
    execFileSync('git', ['clone', '-q', '--depth', '1', SECONDARY_REPO, dir], { stdio: 'inherit' });
    const files = (await readdir(join(dir, 'lottonumbers'))).filter((f) => f.endsWith('.txt'));
    return await Promise.all(files.map(async (f) =>
      fromArchiveText(f.slice(0, 10), await readFile(join(dir, 'lottonumbers', f), 'utf8'))));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  console.log('• ดึงแหล่งหลัก (GLO API → new4761/Thai_lottery_analysis)…');
  const primary = parseCsv(await fetchText(PRIMARY_URL)).map(fromPrimaryRow);
  console.log('• ดึงแหล่งตรวจข้าม (sanook/kapook → vicha-w/thai-lotto-archive)…');
  const secondary = await loadSecondary();

  const latest = [...primary, ...secondary].map((d) => d.date).sort().at(-1);
  const cutoff = new Date(latest);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - YEARS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const { draws, report } = mergeSources(primary, secondary, cutoffStr);

  const by = (st) => report.filter((r) => r.status === st);
  const summary = {
    generatedAt: new Date().toISOString(),
    sources: { primary: PRIMARY_URL, secondary: SECONDARY_REPO },
    range: { from: draws[0].date, to: draws.at(-1).date, draws: draws.length },
    match: by('match').length,
    mismatch: by('mismatch'),
    secondaryOnly: by('secondary-only').map((r) => r.date),
    missingSecondary: by('missing-secondary').map((r) => r.date),
    structuralIssues: report.filter((r) => r.issues.length),
  };
  console.log(`  ${draws.length} งวด (${summary.range.from} → ${summary.range.to})`);
  console.log(`  ตรงกันทุกรางวัล ${summary.match}, ต่างบางรางวัลย่อย ${summary.mismatch.length}, ` +
    `เติมจากแหล่งรอง ${summary.secondaryOnly.length}, โครงสร้างผิด ${summary.structuralIssues.length}`);
  const keyDiff = summary.mismatch.filter((m) => m.diff.some((f) => ['first', 'last2', 'front3', 'last3'].includes(f)));
  console.log(`  งวดที่รางวัลหลัก (ที่1/2ตัว/3ตัว) ไม่ตรง: ${keyDiff.length}`);
  for (const m of keyDiff) console.log(`  ! ${m.date}: ${m.diff.join(', ')}`);

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(new URL('draws.json', OUT_DIR), JSON.stringify({ updatedAt: summary.generatedAt, draws }));
  await writeFile(new URL('validation.json', OUT_DIR), JSON.stringify(summary, null, 2));
  console.log('✓ บันทึก public/data/draws.json, public/data/validation.json');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
