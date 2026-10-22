import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeSettings, DEFAULT_SETTINGS } from '../src/lib/settings.js';
import { parseTickets, checkTickets } from '../src/lib/ticket-check.js';
import { floatingDigits } from '../src/lib/floating.js';
import { login, verifyToken, isAuthorized } from '../netlify/lib/auth.mjs';
import { setSettingsStore, getSettings, saveSettings } from '../netlify/lib/settings.mjs';
import adminLogin from '../netlify/functions/admin-login.mjs';
import adminSettings from '../netlify/functions/admin-settings.mjs';
import publicSettings from '../netlify/functions/settings.mjs';

const draws = JSON.parse(readFileSync(new URL('../public/data/draws.json', import.meta.url), 'utf8')).draws;

// Netlify Blobs จำลอง
function memoryStore() {
  const m = new Map();
  return { get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); } };
}
beforeEach(() => {
  setSettingsStore(memoryStore());
  Object.assign(process.env, { ADMIN_USERNAME: 'boss', ADMIN_PASSWORD: 'pass-1234', LINE_CHANNEL_SECRET: 'sec', ALERT_ADMIN_KEY: 'admin-key' });
});

test('normalizeSettings: เติมค่าเริ่มต้นและกันค่าผิด', () => {
  assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS);
  const s = normalizeSettings({ botId: 'hack', picks: { last2: 99, float: 0 }, public: { bot: 'yes' }, commands: false });
  assert.equal(s.botId, 'adaptive');
  assert.equal(s.picks.last2, 10);
  assert.equal(s.picks.float, 1);
  assert.equal(s.public.bot, false);
  assert.equal(s.commands, false);
});

test('saveSettings รวมค่าบางส่วนกับของเดิม', async () => {
  await saveSettings({ autoPicks: false, picks: { last2: 3 } });
  const s = await getSettings();
  assert.equal(s.autoPicks, false);
  assert.equal(s.picks.last2, 3);
  assert.equal(s.picks.last3, DEFAULT_SETTINGS.picks.last3);
});

test('login/verifyToken: รหัสถูก ได้ token · ผิด/หมดอายุ/ปลอม ใช้ไม่ได้', () => {
  assert.ok(login('boss', 'wrong').error);
  assert.ok(login('admin', 'pass-1234').error);
  const { token, exp } = login('boss', 'pass-1234', 1000);
  assert.ok(verifyToken(token, 2000));
  assert.ok(!verifyToken(token, exp + 1));
  assert.ok(!verifyToken(token.slice(0, -2) + 'xx', 2000));
  process.env.ADMIN_PASSWORD = 'changed';
  assert.ok(!verifyToken(token, 2000), 'เปลี่ยนรหัสแล้ว token เดิมต้องใช้ไม่ได้');
});

test('isAuthorized: Bearer token หรือ x-admin-key', () => {
  const { token } = login('boss', 'pass-1234');
  assert.ok(isAuthorized(new Request('https://x', { headers: { authorization: `Bearer ${token}` } })));
  assert.ok(isAuthorized(new Request('https://x', { headers: { 'x-admin-key': 'admin-key' } })));
  assert.ok(!isAuthorized(new Request('https://x', { headers: { authorization: 'Bearer nope' } })));
  assert.ok(!isAuthorized(new Request('https://x')));
});

test('API: login → อ่าน/บันทึกการตั้งค่า, หน้าเว็บเห็นแค่ public', async () => {
  const post = (url, body, headers = {}) => new Request(url, { method: 'POST', body: JSON.stringify(body), headers });
  assert.equal((await adminLogin(post('https://x/api/admin/login', { username: 'boss', password: 'x' }))).status, 401);
  const { token } = await (await adminLogin(post('https://x/api/admin/login', { username: 'boss', password: 'pass-1234' }))).json();
  assert.equal((await adminSettings(new Request('https://x/api/admin/settings'))).status, 401);
  const auth = { authorization: `Bearer ${token}` };
  const saved = await (await adminSettings(post('https://x/api/admin/settings', { public: { backtest: true } }, auth))).json();
  assert.equal(saved.public.backtest, true);
  const pub = await (await publicSettings(new Request('https://x/api/settings'))).json();
  assert.deepEqual(Object.keys(pub), ['public']);
  assert.equal(pub.public.backtest, true);
});

test('ตรวจรางวัล: หลายใบ เลือกงวดได้', () => {
  assert.deepEqual(parseTickets('011781, 12345 123456\n011781'), ['011781', '123456']);
  const last = draws.at(-1);
  const r = checkTickets(draws, [last.first, '999999']);
  assert.equal(r.draw.date, last.date);
  assert.ok(r.results[0].won.includes('first'));
  assert.ok(r.total >= 6_000_000);
  const prev = draws.at(-2);
  assert.ok(checkTickets(draws, [prev.first], prev.date).results[0].won.includes('first'));
  assert.ok(checkTickets(draws, ['123456'], '1999-01-01').error);
});

test('เลขลอย: คืนหลักเดียวไม่ซ้ำ และใช้เฉพาะประวัติที่ให้', () => {
  const h = draws.slice(0, 100);
  for (const kind of ['top', 'bottom']) {
    const f = floatingDigits(h, kind, 3);
    assert.equal(f.picks.length, 3);
    assert.equal(new Set(f.picks.map((p) => p.digit)).size, 3);
    for (const p of f.picks) assert.match(p.digit, /^\d$/);
  }
  assert.ok(Math.abs(floatingDigits(h, 'top').chance - 0.271) < 0.001);
});

test('ปิดการตอบคำสั่งจากหน้า Admin → bot ไม่ตอบ (ยกเว้น groupid)', async () => {
  const { handleEvent } = await import('../netlify/functions/line-webhook.mjs');
  const off = normalizeSettings({ commands: false });
  const ev = (text) => ({ type: 'message', source: { type: 'group', groupId: 'Cabc' }, message: { type: 'text', text } });
  assert.equal(await handleEvent(ev('เลขเด็ด'), 'https://x', off), null);
  assert.match((await handleEvent(ev('groupid'), 'https://x', off))[0].text, /Cabc/);
});

test('เลขมงคลตามวันเกิด (ทักษา): กาลกิณีตรงตามตำรา และคำสั่ง LINE', async () => {
  const { DAYS, luckyNumbers, parseDay } = await import('../src/lib/lucky-day.js');
  const kala = Object.fromEntries(DAYS.map((d) => [d.key, luckyNumbers(d).kalakini]));
  assert.deepEqual(kala, { sun: 6, mon: 1, tue: 2, wed: 3, thu: 7, fri: 8, sat: 4, rahu: 5 });
  assert.equal(parseDay('วันพุธกลางคืน').key, 'rahu');
  assert.equal(parseDay('พุธ').key, 'wed');
  assert.equal(parseDay('ัวนศุกร์').key, 'fri'); // พิมพ์ผิดข้างหน้า
  assert.equal(parseDay('วันเกิดวันเสาร์').key, 'sat');
  const l = luckyNumbers(DAYS[0]);
  assert.equal(l.two.length, 6);
  assert.equal(l.three.length, 6);
  const { handleEvent } = await import('../netlify/functions/line-webhook.mjs');
  const ev = (text) => ({ type: 'message', source: { type: 'group', groupId: 'C' }, message: { type: 'text', text } });
  const on = normalizeSettings({});
  const r = await handleEvent(ev('เลขประจำวัน จันทร์'), 'https://x', on);
  assert.match(r[0].altText, /วันจันทร์/);
  assert.equal(r[0].quickReply.items.length, 7);
  assert.ok(r[0].quickReply.items.every((i) => !i.action.label.includes('กลางคืนกลางคืน')));
  assert.match((await handleEvent(ev('เลขประจำวัน'), 'https://x', on))[0].altText, /เลขมงคลคนเกิดวัน/);
  assert.match((await handleEvent(ev('พูธกลางวัน'), 'https://x', on))[0].altText, /วันพุธ \(กลางวัน\)/);
  assert.match((await handleEvent(ev('พุธกลางคืน'), 'https://x', on))[0].altText, /ราหู/);
  assert.match((await handleEvent(ev('วันจันทร์'), 'https://x', on))[0].altText, /วันจันทร์/);
  assert.equal(await handleEvent(ev('วันนี้วันศุกร์ไปกินข้าว'), 'https://x', on), null); // แชตทั่วไปไม่ตอบ
});

test('เลขมงคลตามเดือนเกิด / ปีเกิด และคำสั่ง LINE', async () => {
  const { parseBirthMonth, monthLucky, parseBirthYear, yearLucky } = await import('../src/lib/lucky-birth.js');
  assert.deepEqual(parseBirthMonth('ต.ค.'), { month: 10, day: null });
  assert.deepEqual(parseBirthMonth('ตุลาคม'), { month: 10, day: null });
  assert.deepEqual(parseBirthMonth('25/10'), { month: 10, day: 25 });
  assert.deepEqual(parseBirthMonth('25 ต.ค.'), { month: 10, day: 25 });
  assert.equal(parseBirthMonth('13'), null);
  assert.equal(parseBirthMonth('xyz'), null);
  assert.equal(monthLucky({ month: 10, day: 25 }).signs[0].name, 'ตุลย์');
  assert.equal(monthLucky({ month: 10, day: 5 }).signs[0].name, 'กันย์');
  assert.equal(monthLucky({ month: 10, day: null }).signs.length, 2);
  assert.equal(parseBirthYear('2530', 2569), 2530);
  assert.equal(parseBirthYear('1987', 2569), 2530);
  assert.equal(parseBirthYear('30', 2569), 2530);
  assert.equal(parseBirthYear('80', 2569), 2480);
  assert.equal(parseBirthYear('2600', 2569), null);
  assert.match(yearLucky(2530).animal, /^เถาะ/);
  assert.match(yearLucky(2563).animal, /^ชวด/);
  const { handleEvent } = await import('../netlify/functions/line-webhook.mjs');
  const ev = (text) => ({ type: 'message', source: { type: 'group', groupId: 'C' }, message: { type: 'text', text } });
  const on = normalizeSettings({});
  const m = await handleEvent(ev('เลขเดือนเกิด 25/10'), 'https://x', on);
  assert.match(m[0].altText, /คนเกิดวันที่ 25 ตุลาคม/);
  assert.equal(m[0].quickReply.items.length, 11);
  assert.match((await handleEvent(ev('เลขปีเกิด 1987'), 'https://x', on))[0].altText, /เถาะ/);
  assert.match((await handleEvent(ev('เลขเดือนเกิด'), 'https://x', on))[0].text, /ตามด้วยเดือน/);
  assert.match((await handleEvent(ev('เลขปีเกิด'), 'https://x', on))[0].text, /ตามด้วยปี/);
});

const RSS = `<?xml version="1.0"?><rss><channel><title>Google News</title>
<item><title>หนุ่มวัย 45 ปี ถูกรางวัลที่ 1 ทะเบียนรถ 1กข 4589 - ไทยรัฐ</title><link>https://n/1</link><source url="https://thairath.co.th">ไทยรัฐ</source></item>
<item><title><![CDATA[ราคาทอง 2569 ขึ้น 1,250 บาท &amp; ปิดตลาด - ข่าวสด]]></title><link>https://n/2</link><source url="https://khaosod.co.th">ข่าวสด</source></item>
<item><title>นายกฯ ประชุม ครม. ไม่มีตัวเลข - มติชน</title><link>https://n/3</link><source url="https://matichon.co.th">มติชน</source></item>
<item><title>ไฟไหม้บ้านเลขที่ ๔๕ ซอย 7 - PPTV</title><link>https://n/4</link><source url="https://pptv">PPTV</source></item>
</channel></rss>`;

test('ตีเลขจากข่าวดัง: อ่าน RSS ตัดชื่อสำนักข่าว ไม่นับเลขปี และคำสั่ง LINE', async () => {
  const { parseRss, numbersIn, newsNumbers } = await import('../src/lib/news-numbers.js');
  const items = parseRss(RSS);
  assert.equal(items.length, 4);
  assert.equal(items[0].title, 'หนุ่มวัย 45 ปี ถูกรางวัลที่ 1 ทะเบียนรถ 1กข 4589');
  assert.equal(items[0].source, 'ไทยรัฐ');
  assert.equal(items[1].title, 'ราคาทอง 2569 ขึ้น 1,250 บาท & ปิดตลาด');
  assert.deepEqual(numbersIn(items[1].title), ['1250']);
  assert.deepEqual(numbersIn(items[3].title), ['45', '7']);
  assert.deepEqual(numbersIn('ราคาทอง 18 ต.ค. ขึ้น 500 ประชุม 1/11/69'), ['500']); // ไม่นับวันที่
  const r = newsNumbers(items);
  assert.equal(r.news.length, 3);
  assert.equal(r.two[0], '45'); // 45 อยู่ในข่าวอันดับ 1 และ 4
  assert.ok(r.three.includes('589') && r.three.includes('250'));

  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(RSS);
  try {
    const { handleEvent } = await import('../netlify/functions/line-webhook.mjs');
    const ev = (text) => ({ type: 'message', source: { type: 'group', groupId: 'C' }, message: { type: 'text', text } });
    const m = await handleEvent(ev('ข่าวดัง'), 'https://x', normalizeSettings({}));
    assert.match((await handleEvent(ev('เลขดัง'), 'https://x', normalizeSettings({})))[0].altText, /เลขจากข่าวดัง/);
    assert.equal(m[0].type, 'flex');
    assert.match(m[0].altText, /เลขจากข่าวดัง[\s\S]*2 ตัว: 45/);
  } finally { globalThis.fetch = realFetch; }
});

// LINE ตอบ 400 "must be non-empty text" ถ้ามี text ว่างแม้แต่จุดเดียว → bot เงียบทั้งข้อความ
const emptyTexts = (n, p = '') => (n && typeof n === 'object'
  ? [...(n.type === 'text' && 'text' in n && !String(n.text).trim() ? [p] : []),
    ...Object.entries(n).flatMap(([k, v]) => emptyTexts(v, `${p}/${k}`))]
  : []);

test('เลขประจำวัน / เลขเดือนเกิด / เลขปีเกิด: ไม่มีข้อความว่าง และพิมพ์ได้หลายแบบ', async () => {
  const { handleEvent } = await import('../netlify/functions/line-webhook.mjs');
  const ask = async (text) => handleEvent({ type: 'message', source: { type: 'group', groupId: 'C' }, message: { type: 'text', text } }, 'https://x', normalizeSettings({}));
  const cmds = ['เลขประจำวัน', 'เลขประจำวัน อาทิตย์', 'เลขประจำวัน พุธกลางคืน', 'เลขวันเกิด เสาร์', 'เลขวัน ศุกร์',
    'เลขเดือนเกิด', 'เลขเดือนเกิด ต.ค.', 'เลขเดือนเกิด 25/10/2530', 'เลขเดือน มกราคม', 'เลขประจำเดือน 4',
    'เลขปีเกิด', 'เลขปีเกิด 2530', 'เลขปีเกิด 25/10/2530', 'เลขปี 1987', 'เลขประจำปี 30', 'เลขนักษัตร ๒๕๓๐'];
  for (const c of cmds) {
    const r = await ask(c);
    assert.ok(r?.length, `${c} ต้องมีคำตอบ`);
    assert.deepEqual(r.flatMap((m) => emptyTexts(m)), [], `${c} มีข้อความว่าง`);
  }
  assert.match((await ask('เลขวัน ศุกร์'))[0].altText, /วันศุกร์/);
  assert.match((await ask('เลขประจำเดือน 4'))[0].altText, /เมษายน/);
  assert.match((await ask('เลขปี 1987'))[0].altText, /2530/);
});

test('ตรวจรางวัลใน LINE: เลข 2–3 ตัว และพิมพ์เลข 6 หลักอย่างเดียว', async () => {
  const { parseNumbers, checkTickets } = await import('../src/lib/ticket-check.js');
  assert.deepEqual(parseNumbers('011781 48, 171 1234 ๔๘'), ['011781', '48', '171']);
  const last = draws.at(-1);
  const r = checkTickets(draws, [last.last2, last.front3[0], last.last3[0]]);
  assert.deepEqual(r.results.map((x) => x.prizes), [['เลขท้าย 2 ตัว'], ['เลขหน้า 3 ตัว'], ['เลขท้าย 3 ตัว']]);
  assert.equal(r.total, 2000 + 4000 + 4000);

  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ draws }));
  try {
    const { handleEvent } = await import('../netlify/functions/line-webhook.mjs');
    const ask = async (text) => handleEvent({ type: 'message', source: { type: 'group', groupId: 'C' }, message: { type: 'text', text } }, 'https://x', normalizeSettings({}));
    assert.match((await ask(`ตรวจรางวัล ${last.last2}`))[0].altText, new RegExp(`${last.last2}: เลขท้าย 2 ตัว`));
    assert.match((await ask(last.first))[0].altText, /รางวัลที่ 1/);
    assert.match((await ask('ตรวจรางวัล'))[0].text, /เลข 2–3 ตัว/);
    assert.equal(await ask('โทร 0812345678'), null);
  } finally { globalThis.fetch = realFetch; }
});

test('ทำนายฝัน: คำทำนาย + เลขที่คำนวณจากตัวอักษร และไม่ตอบ "ฝันดี"', async () => {
  const { interpretDream, dreamNumbers, dreamSubject } = await import('../src/lib/dream.js');
  assert.equal(dreamSubject('ฝันเห็น งูรัด'), 'งูรัด');
  assert.equal(dreamSubject('ทำนายฝัน ฝันว่าฟันหลุด'), 'ฟันหลุด');
  assert.deepEqual(dreamNumbers('งู').values, [2, 2]); // ง = 2, ู = 2
  assert.deepEqual(interpretDream('ฝันเห็นงู'), interpretDream('ทำนายฝัน งู')); // ฝันเดียวกันได้เลขเดิม
  assert.deepEqual(interpretDream('ฝันว่าไฟไหม้บ้าน').found.map((d) => d.title), ['ไฟไหม้', 'บ้าน']);
  assert.deepEqual(interpretDream('ทำนายฝัน รถไฟ').found.map((d) => d.title), ['รถไฟ']); // "ไฟ" ในรถไฟ ไม่ใช่ไฟไหม้
  const { handleEvent } = await import('../netlify/functions/line-webhook.mjs');
  const ask = async (text) => handleEvent({ type: 'message', source: { type: 'group', groupId: 'C' }, message: { type: 'text', text } }, 'https://x', normalizeSettings({}));
  for (const c of ['ทำนายฝัน งู', 'ฝันเห็นช้างกับงู', 'ฝันว่าฟันหลุด', 'ทำนายฝัน รถไฟ', 'ทำนายฝัน']) {
    const r = await ask(c);
    assert.ok(r?.length, c);
    assert.deepEqual(r.flatMap((m) => emptyTexts(m)), [], `${c} มีข้อความว่าง`);
  }
  assert.match((await ask('ฝันเห็นงู'))[0].altText, /เนื้อคู่[\s\S]*เลขเด่น/);
  assert.match((await ask('ฝันเห็นหมอ'))[0].altText, /หมอ: /);
  assert.match((await ask('เลขทำนายฝัน งู'))[0].altText, /งู: /);
  assert.match((await ask('เลขทำนานฝัน'))[0].text, /ทำนายฝัน/);
  assert.equal(await ask('ฝันดี'), null);
  assert.equal(await ask('ฝันดีนะทุกคน'), null);
});

test('คำสั่งความน่าจะเป็น: 3ตัวหน้า 3ตัวท้าย 3ตัวบน 2ตัวบน 2ตัวล่าง 4ตัวบน 5ตัวบน', async () => {
  const { probabilityStats } = await import('../src/lib/probability.js');
  const expectOneIn = { front3: 500, last3: 500, top3: 1000, top2: 100, bottom2: 100, top4: 10000, top5: 100000 };
  for (const [k, n] of Object.entries(expectOneIn)) assert.equal(probabilityStats(draws, k).oneIn, n, k);
  const top2 = probabilityStats(draws, 'top2');
  assert.equal(top2.latest[0], draws.at(-1).first.slice(4));
  assert.equal(top2.composite.length, 2);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ draws }));
  try {
    const { handleEvent } = await import('../netlify/functions/line-webhook.mjs');
    const ask = async (text) => handleEvent({ type: 'message', source: { type: 'group', groupId: 'C' }, message: { type: 'text', text } }, 'https://x', normalizeSettings({}));
    for (const c of ['3ตัวหน้า', '3ตัวท้าย', '3ตัวบน', '2ตัวบน', '2ตัวล่าง', '4ตัวบน', '5ตัวบน', 'เลข 3 ตัวบน']) {
      const r = await ask(c);
      assert.match(r[0].altText, /ความน่าจะเป็น/, c);
      assert.deepEqual(r.flatMap((m) => emptyTexts(m)), [], `${c} มีข้อความว่าง`);
    }
    assert.match((await ask('5ตัวบน'))[0].altText, /1 ใน 100,000/);
  } finally { globalThis.fetch = realFetch; }
});

test('/api/admin/status: บอกว่าตั้งค่า LINE แล้วหรือยัง (ไม่ส่งค่าลับ) และประวัติการทำงาน', async () => {
  const { default: status } = await import('../netlify/functions/admin-status.mjs');
  const { recordActivity } = await import('../netlify/lib/settings.mjs');
  const env = { ...process.env };
  process.env.LINE_CHANNEL_ACCESS_TOKEN = 'secret-token-value';
  process.env.LINE_CHANNEL_SECRET = 'secret-value';
  process.env.LINE_GROUP_IDS = 'Ca, Cb';
  process.env.ALERT_ADMIN_KEY = 'k';
  try {
    assert.equal((await status(new Request('https://x/api/admin/status'))).status, 401);
    await recordActivity('picks', { ok: true, date: '2026-11-01', groups: 2 });
    const res = await status(new Request('https://x/api/admin/status', { headers: { 'x-admin-key': 'k' } }));
    const body = await res.json();
    assert.deepEqual(body.line, { token: true, secret: true, groups: 2 });
    assert.equal(body.activity.picks.groups, 2);
    assert.doesNotMatch(JSON.stringify(body), /secret-token-value|secret-value/);
  } finally { process.env = env; }
});

test('LINE ถูกรางวัล: แบนเนอร์ทองพร้อมถ้วยรางวัลจากเว็บ', async () => {
  const { ticketCheckMessage } = await import('../src/lib/line-messages.js');
  const last = draws.at(-1);
  const win = ticketCheckMessage(draws, [last.first, '999999'], null, 'https://site.test/');
  const json = JSON.stringify(win.contents);
  assert.match(json, /https:\/\/site\.test\/line\/trophy\.png/);
  assert.match(json, /ขอแสดงความยินดี · ถูกรางวัล/);
  assert.deepEqual(emptyTexts(win), []);
  const lose = JSON.stringify(ticketCheckMessage(draws, ['999999'].filter((n) => n !== last.first), null, 'https://site.test').contents);
  assert.doesNotMatch(lose, /trophy/);
});

test('คำสั่งที่มี @mention bot หรือคำลงท้ายสุภาพ ยังตอบได้', async () => {
  const { cleanCommand } = await import('../netlify/functions/line-webhook.mjs');
  assert.equal(cleanCommand({ text: '@LOTTO-THAI 3ตัวบน', mention: { mentionees: [{ index: 0, length: 11 }] } }), '3ตัวบน');
  assert.equal(cleanCommand({ text: '@บอท เลขเด็ดครับ' }), 'เลขเด็ด');
  assert.equal(cleanCommand({ text: 'ฝันเห็นหมอค่ะ' }), 'ฝันเห็นหมอ');
  assert.equal(cleanCommand({ text: 'เลขเด็ด?' }), 'เลขเด็ด');
  assert.equal(cleanCommand({ text: '2ตัวล่าง หน่อยครับ' }), '2ตัวล่าง');
  assert.equal(cleanCommand({ text: 'ตรวจรางวัล 011781' }), 'ตรวจรางวัล 011781');
});

test('หลายคำสั่งในข้อความเดียว (หลายบรรทัด) → ตอบครบเป็น carousel', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ draws }));
  try {
    const { handleEvent } = await import('../netlify/functions/line-webhook.mjs');
    const ask = async (text) => handleEvent({ type: 'message', source: { type: 'group', groupId: 'C' }, message: { type: 'text', text } }, 'https://multi.test', normalizeSettings({}));
    const r = await ask('3ตัวหน้า\n3ตัวท้าย\n3ตัวบน\n2ตัวล่าง\n2ตัวบน\n5ตัวบน\n4ตัวบน\n ลอยบน');
    assert.ok(r.length <= 5);
    assert.equal(r[0].contents.type, 'carousel');
    assert.equal(r[0].contents.contents.length, 8);
    assert.deepEqual(r.flatMap((m) => emptyTexts(m)), []);
    const two = await ask('3ตัวบน\n2ตัวล่าง');
    assert.equal(two.length, 2);
    assert.equal(two[0].quickReply, undefined); // quick reply ได้เฉพาะข้อความสุดท้าย
    assert.match((await ask('ตรวจรางวัล\n' + draws.at(-1).first))[0].altText, /รางวัลที่ 1/);
    assert.equal(await ask('สวัสดี\nวันนี้กินอะไรดี'), null);
  } finally { globalThis.fetch = realFetch; }
});

test('ฝันเห็นสัตว์อะไรก็ได้ → มีคำทำนายตามกลุ่มสัตว์และตีเป็นตัวเลขเสมอ', async () => {
  const { interpretDream } = await import('../src/lib/dream.js');
  const { dreamMessage } = await import('../src/lib/line-messages.js');
  const title = (t) => interpretDream(t).found.map((d) => d.title).join(',');
  assert.equal(title('ฝันเห็นผีเสื้อ'), 'ผีเสื้อ'); // ไม่ใช่ "ผี"
  assert.equal(title('ฝันเห็นปลาวาฬ'), 'ปลาวาฬ'); // ไม่ใช่ "ปลา"
  assert.equal(title('ฝันเห็นหมาป่า'), 'หมาป่า');
  assert.match(interpretDream('ฝันเห็นยีราฟ').found[0].meaning, /สัตว์ใหญ่/);
  for (const t of ['ฝันเห็นยีราฟ', 'ฝันเห็นตุ๊กแก', 'ฝันเห็นโลมา', 'ทำนายฝัน รถไฟ']) {
    const r = interpretDream(t);
    assert.ok(r.main.length && r.two.length && r.three.length, t);
    assert.deepEqual(emptyTexts(dreamMessage(t)), [], t);
  }
  assert.doesNotMatch(JSON.stringify(dreamMessage('ทำนายฝัน รถไฟ').contents), /ยังไม่มีคำทำนาย/);
});

test('ฝันเห็นสิ่งไม่มีชีวิต → คำทำนายตามกลุ่มสิ่งของ และตีเป็นตัวเลข', async () => {
  const { interpretDream } = await import('../src/lib/dream.js');
  const r = (t) => interpretDream(t);
  assert.match(r('ฝันเห็นรถไฟ').found[0].meaning, /ยานพาหนะ/);
  assert.match(r('ฝันเห็นเพชร').found[0].meaning, /ของมีค่า/);
  assert.match(r('ฝันเห็นทุเรียน').found[0].meaning, /อาหาร/);
  assert.equal(r('ฝันเห็นไข่มุก').found[0].title, 'ไข่มุก'); // ไม่ใช่ "ไข่"
  assert.equal(r('ฝันว่าตกตึก').found[0].title, 'ตกจากที่สูง'); // ตำราเฉพาะมาก่อนกลุ่มสิ่งของ
  for (const t of ['ฝันเห็นรถไฟ', 'ฝันเห็นมีด', 'ฝันเห็นสายรุ้ง']) assert.ok(r(t).two.length >= 3, t);
});

test('พิมพ์คำสั่งผิด: bot แนะนำคำสั่งที่ใกล้เคียง แต่ไม่ตอบแชตทั่วไป', async () => {
  const { handleEvent, suggestCommand } = await import('../netlify/functions/line-webhook.mjs');
  assert.equal(suggestCommand('3ตัวบอน'), '3ตัวบน');
  assert.equal(suggestCommand('เลขเดด'), 'เลขเด็ด');
  assert.equal(suggestCommand('สวัสดี'), null);
  const ask = async (text, mention) => handleEvent({ type: 'message', source: { type: 'group', groupId: 'C' }, message: { type: 'text', text, mention } }, 'https://x', normalizeSettings({}));
  const r = await ask('2ตัวลาง');
  assert.match(r[0].text, /หมายถึง "2ตัวล่าง"/);
  assert.equal(r[0].quickReply.items[0].action.text, '2ตัวล่าง');
  assert.match((await ask('เลขอะไรดี'))[0].text, /ไม่พบคำสั่ง/);
  assert.match((await ask('@LOTTO-THAI สวัสดี', { mentionees: [{ index: 0, length: 11, isSelf: true }] }))[0].text, /คำสั่ง/);
  for (const chat of ['สวัสดีครับ', 'วันนี้กินอะไรดี', 'ฝันดีนะ', '@เพื่อน ไปไหน']) assert.equal(await ask(chat), null, chat);
  assert.equal(await handleEvent({ type: 'message', source: { type: 'group', groupId: 'C' }, message: { type: 'text', text: '3ตัวบอน' } }, 'https://x', normalizeSettings({ commands: false })), null);
});

test('Rich Menu 3×2 ครอบเต็มรูป และ "คำสั่ง" ในกลุ่มมีปุ่มกดแทนการพิมพ์', async () => {
  const { richMenu } = await import('../scripts/rich-menu.mjs');
  assert.equal(richMenu.areas.length, 6);
  const area = richMenu.areas.reduce((s, a) => s + a.bounds.width * a.bounds.height, 0);
  assert.equal(area, richMenu.size.width * richMenu.size.height);
  for (const a of richMenu.areas) assert.ok(a.action.label.length <= 20);
  const { handleEvent } = await import('../netlify/functions/line-webhook.mjs');
  const r = await handleEvent({ type: 'message', source: { type: 'group', groupId: 'C' }, message: { type: 'text', text: 'คำสั่ง' } }, 'https://x', normalizeSettings({}));
  assert.ok(r[0].quickReply.items.length >= 10 && r[0].quickReply.items.length <= 13);
  assert.ok(r[0].quickReply.items.some((i) => i.action.text === '3ตัวบน'));
});

test('/api/admin/rich-menu: ต้องเข้าสู่ระบบ และติดตั้งผ่าน LINE API ด้วย token ใน Netlify', async () => {
  const { default: fn } = await import('../netlify/functions/admin-rich-menu.mjs');
  const env = { ...process.env };
  const realFetch = globalThis.fetch;
  const calls = [];
  process.env.ALERT_ADMIN_KEY = 'k';
  process.env.LINE_CHANNEL_ACCESS_TOKEN = 'tok';
  process.env.URL = 'https://rm.test';
  globalThis.fetch = async (url, opts = {}) => {
    calls.push(`${opts.method ?? 'GET'} ${url}`);
    if (String(url).endsWith('/line/rich-menu.jpg')) return new Response(new Uint8Array([1, 2, 3]));
    if (String(url).endsWith('/richmenu/list')) return new Response(JSON.stringify({ richmenus: [{ name: 'LOTTO-THAI menu', richMenuId: 'old' }] }));
    if (String(url).endsWith('/v2/bot/richmenu')) return new Response(JSON.stringify({ richMenuId: 'new1' }));
    return new Response('{}');
  };
  try {
    assert.equal((await fn(new Request('https://rm.test/api/admin/rich-menu', { method: 'POST' }))).status, 401);
    const res = await fn(new Request('https://rm.test/api/admin/rich-menu', { method: 'POST', headers: { 'x-admin-key': 'k' } }));
    const body = await res.json();
    assert.equal(body.richMenuId, 'new1');
    assert.deepEqual(body.removed, ['old']);
    assert.ok(calls.includes('POST https://api.line.me/v2/bot/user/all/richmenu/new1'));
    assert.ok(calls.includes('POST https://api-data.line.me/v2/bot/richmenu/new1/content'));
  } finally { globalThis.fetch = realFetch; process.env = env; }
});
