// ตีเลขจากข่าวดัง: อ่านหัวข้อข่าวจาก RSS แล้วดึงตัวเลขที่อยู่ในข่าว (อายุ ทะเบียนรถ บ้านเลขที่ จำนวน ฯลฯ)
// มาจัดอันดับเป็นเลข 2 ตัว / 3 ตัว — เพื่อความบันเทิงตามความเชื่อ ไม่ได้เพิ่มโอกาสถูกรางวัล
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&(\w+);/g, (m, e) => ENTITIES[e] ?? m)
  .trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]) : ''; };

// RSS (Google News) → [{ title, source, link }] · หัวข้อของ Google News ลงท้ายด้วย " - ชื่อสำนักข่าว"
export function parseRss(xml) {
  return [...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/g)].map(([item]) => {
    const source = tag(item, 'source');
    let title = tag(item, 'title');
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -source.length - 3);
    return { title, source, link: tag(item, 'link') };
  }).filter((x) => x.title);
}

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
// วันที่ในหัวข้อข่าว เช่น "18 ต.ค." / "18 ตุลาคม" / "18/10" — เป็นวันที่ของข่าว ไม่ใช่ตัวเลขในเนื้อข่าว
const MONTH_WORDS = 'ม\\.ค\\.|ก\\.พ\\.|มี\\.ค\\.|เม\\.ย\\.|พ\\.ค\\.|มิ\\.ย\\.|ก\\.ค\\.|ส\\.ค\\.|ก\\.ย\\.|ต\\.ค\\.|พ\\.ย\\.|ธ\\.ค\\.|มกรา|กุมภา|มีนา|เมษา|พฤษภา|มิถุนา|กรกฎา|สิงหา|กันยา|ตุลา|พฤศจิกา|ธันวา';
const DATE_RE = new RegExp(`(?<!\\d)\\d{1,2}\\s*(?:${MONTH_WORDS})|(?<!\\d)\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?(?!\\d)`, 'g');
// ตัวเลขในหัวข้อข่าว — ไม่นับปี (พ.ศ. 25xx / ค.ศ. 19xx–20xx) เพราะเกือบทุกข่าวมี และไม่นับเลข 0 ล้วน
export function numbersIn(title) {
  const t = String(title).replace(/[๐-๙]/g, (d) => THAI_DIGITS.indexOf(d)).replace(/(\d),(?=\d{3})/g, '$1')
    .replace(DATE_RE, ' ');
  return (t.match(/\d+/g) ?? []).filter((n) => {
    if (/^0+$/.test(n)) return false;
    const v = Number(n);
    return !(n.length === 4 && ((v >= 2500 && v <= 2600) || (v >= 1950 && v <= 2100)));
  });
}

const top = (counts, k) => [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, k).map(([n]) => n);
const bump = (map, key, w) => map.set(key, (map.get(key) ?? 0) + w);

// ข่าวอันดับต้นมีน้ำหนักมากกว่า (ข่าวดังกว่า) · ข่าวที่มีเลขซ้ำกันหลายสำนักจะได้คะแนนสะสม
export function newsNumbers(items, { maxNews = 5 } = {}) {
  const digits = new Map(); const two = new Map(); const three = new Map();
  const withNumbers = [];
  items.forEach((item, i) => {
    const nums = numbersIn(item.title);
    if (!nums.length) return;
    const w = 1 / (1 + i / 10);
    withNumbers.push({ ...item, numbers: nums });
    for (const n of nums) {
      for (const d of new Set(n)) bump(digits, d, w);
      if (n.length === 1) continue;
      bump(two, n.slice(-2), w);
      if (n.length >= 3) bump(three, n.slice(-3), w);
    }
  });
  return {
    news: withNumbers.slice(0, maxNews),
    scanned: items.length,
    main: top(digits, 3),
    two: top(two, 6),
    three: top(three, 4),
  };
}
