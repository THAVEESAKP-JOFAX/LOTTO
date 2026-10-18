// แปลงข้อมูลผลสลากจากทั้งสองแหล่งให้อยู่ในรูปแบบเดียวกัน (ใช้ทั้งสคริปต์ดึงข้อมูลและ Netlify Functions)

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
