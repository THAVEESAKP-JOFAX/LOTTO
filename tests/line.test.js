import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { nextDrawDate, isDrawDay, upcomingDraw, todayInThailand } from '../src/lib/schedule.js';
import { picksMessage, resultMessage, botPicksFor, scorePicks } from '../src/lib/line-messages.js';
import { setSettingsStore } from '../netlify/lib/settings.mjs';
setSettingsStore({ get: async () => null, setJSON: async () => {} });
import { verifySignature } from '../netlify/lib/line.mjs';
import webhook from '../netlify/functions/line-webhook.mjs';
import send from '../netlify/functions/line-send.mjs';

const drawsJson = readFileSync(new URL('../public/data/draws.json', import.meta.url), 'utf8');
const draws = JSON.parse(drawsJson).draws;

test('ปฏิทินออกรางวัล รวมวันเลื่อน', () => {
  assert.equal(nextDrawDate('2026-10-16'), '2026-11-01');
  assert.equal(nextDrawDate('2026-12-16'), '2027-01-02');
  assert.equal(nextDrawDate('2027-01-02'), '2027-01-17');
  assert.equal(nextDrawDate('2027-04-16'), '2027-05-02');
  assert.ok(isDrawDay('2026-11-01'));
  assert.ok(!isDrawDay('2027-01-01'));
  assert.equal(upcomingDraw('2026-10-16', '2026-11-01'), '2026-11-01'); // วันออก ผลยังไม่ออก
  assert.equal(upcomingDraw('2026-11-01', '2026-11-01'), '2026-11-16'); // ผลออกแล้ว
  assert.equal(todayInThailand(new Date('2026-10-31T18:00:00Z')), '2026-11-01');
});

test('เลขของ bot สำหรับ LINE คำนวณซ้ำได้ และไม่ใช้ผลงวดนั้นเอง', () => {
  const last = draws.at(-1);
  const a = botPicksFor(last.date, draws);
  const b = botPicksFor(last.date, draws.slice(0, -1));
  assert.deepEqual(a, b);
  assert.equal(a.picks.last2.length, 5);
  assert.equal(a.picks.first.length, 2);
});

test('scorePicks ตรวจรางวัลถูกต้อง', () => {
  const d = draws.at(-1);
  const { hit, money } = scorePicks(d, { last2: [d.last2, '00'], last3: [d.last3[0]], front3: ['zzz'], first: [d.first] });
  assert.deepEqual(hit.last2, [d.last2]);
  assert.ok(money >= 6_000_000 + 2_000 + 4_000);
});

test('Flex message มีโครงสร้างที่ LINE ต้องการ', () => {
  for (const m of [picksMessage('2026-11-01', draws, 'https://example.netlify.app'), resultMessage(draws.at(-1), draws)]) {
    assert.equal(m.type, 'flex');
    assert.ok(m.altText.length > 0 && m.altText.length <= 400);
    assert.equal(m.contents.type, 'bubble');
    assert.ok(JSON.stringify(m).length < 30_000);
  }
});

test('verifySignature', () => {
  const body = '{"events":[]}';
  const sig = createHmac('sha256', 's3cret').update(body).digest('base64');
  assert.ok(verifySignature(body, sig, 's3cret'));
  assert.ok(!verifySignature(body, sig, 'wrong'));
  assert.ok(!verifySignature(body, undefined, 's3cret'));
});

// --- functions กับ LINE API จำลอง ---
let calls;
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  Object.assign(process.env, {
    URL: 'https://site.test', LINE_CHANNEL_ACCESS_TOKEN: 'tok', LINE_CHANNEL_SECRET: 'sec',
    LINE_GROUP_IDS: 'Cgroup1,Cgroup2', ALERT_ADMIN_KEY: 'admin-key',
  });
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), body: opts.body && JSON.parse(opts.body), auth: opts.headers?.Authorization });
    if (String(url) === 'https://site.test/data/draws.json') return new Response(drawsJson);
    if (String(url).startsWith('https://api.line.me/')) return new Response('{}');
    return new Response('not found', { status: 404 });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const signed = (obj) => {
  const body = JSON.stringify(obj);
  return new Request('https://site.test/api/line/webhook', {
    method: 'POST', body, headers: { 'x-line-signature': createHmac('sha256', 'sec').update(body).digest('base64') },
  });
};

test('webhook: ปฏิเสธลายเซ็นผิด', async () => {
  const res = await webhook(new Request('https://site.test/api/line/webhook', { method: 'POST', body: '{}', headers: { 'x-line-signature': 'bad' } }));
  assert.equal(res.status, 401);
  assert.equal(calls.length, 0);
});

test('webhook: เข้ากลุ่มแล้วตอบ Group ID, คำสั่ง "เลขเด็ด" ตอบ Flex', async () => {
  await webhook(signed({ events: [{ type: 'join', replyToken: 'r1', source: { type: 'group', groupId: 'Cabc' } }] }));
  const r1 = calls.find((c) => c.url.endsWith('/reply'));
  assert.equal(r1.auth, 'Bearer tok');
  assert.match(r1.body.messages[0].text, /Cabc/);
  calls = [];
  await webhook(signed({ events: [{ type: 'message', replyToken: 'r2', source: { type: 'group', groupId: 'Cabc' }, message: { type: 'text', text: 'เลขเด็ด' } }] }));
  const r2 = calls.find((c) => c.url.endsWith('/reply'));
  assert.equal(r2.body.messages[0].type, 'flex');
  calls = [];
  await webhook(signed({ events: [{ type: 'message', replyToken: 'r3', source: { type: 'group', groupId: 'Cabc' }, message: { type: 'text', text: 'คุยเล่นทั่วไป' } }] }));
  assert.ok(!calls.some((c) => c.url.startsWith('https://api.line.me/')));
});

test('line-send: ต้องมีรหัสผู้ดูแล แล้ว push เข้าทุกกลุ่ม', async () => {
  const req = (key, type) => new Request('https://site.test/api/line/send', {
    method: 'POST', body: JSON.stringify({ type }), headers: { 'x-admin-key': key },
  });
  assert.equal((await send(req('wrong', 'test'))).status, 401);
  assert.ok(!calls.some((c) => c.url.startsWith('https://api.line.me/')));
  const res = await send(req('admin-key', 'result'));
  assert.equal(res.status, 200);
  const pushes = calls.filter((c) => c.url.endsWith('/push'));
  assert.deepEqual(pushes.map((p) => p.body.to), ['Cgroup1', 'Cgroup2']);
  assert.equal(pushes[0].body.messages[0].type, 'flex');
});

test('webhook: คำสั่ง "เช็ค 48" ตอบผลทดสอบเลข', async () => {
  await webhook(signed({ events: [{ type: 'message', replyToken: 'r4', source: { type: 'group', groupId: 'Cabc' }, message: { type: 'text', text: 'เช็ค 48' } }] }));
  const r = calls.find((c) => c.url.endsWith('/reply'));
  assert.match(r.body.messages[0].text, /ทดสอบเลข 48/);
});

test('webhook: ถามตามวันที่ "งวด 01/11/26" และพิมพ์วันที่อย่างเดียว', async () => {
  for (const text of ['งวด 01/11/26', '1 พ.ย. 69', `งวด ${draws.at(-1).date.split('-').reverse().join('/')}`]) {
    calls = [];
    await webhook(signed({ events: [{ type: 'message', replyToken: 'r5', source: { type: 'group', groupId: 'Cabc' }, message: { type: 'text', text } }] }));
    const r = calls.find((c) => c.url.endsWith('/reply'));
    assert.ok(r, text);
    assert.ok(r.body.messages.some((m) => m.type === 'flex'), text);
  }
  calls = [];
  await webhook(signed({ events: [{ type: 'message', replyToken: 'r6', source: { type: 'group', groupId: 'Cabc' }, message: { type: 'text', text: 'งวด อะไรก็ไม่รู้' } }] }));
  assert.match(calls.find((c) => c.url.endsWith('/reply')).body.messages[0].text, /อ่านวันที่ไม่ออก/);
});

test('webhook: ตอบ 200 ทันทีและทำงานต่อใน waitUntil (LINE รอได้ราว 2 วินาที)', async () => {
  let pending;
  const res = await webhook(
    signed({ events: [{ type: 'message', replyToken: 'r7', source: { type: 'group', groupId: 'Cabc' }, message: { type: 'text', text: 'เลขเด็ด' } }] }),
    { waitUntil: (p) => { pending = p; } },
  );
  assert.equal(res.status, 200);
  assert.ok(pending, 'ต้องส่งงานต่อให้ waitUntil');
  await pending;
  assert.ok(calls.some((c) => c.url.endsWith('/reply')));
});

test('loadDraws: ยังไม่ถึงงวดถัดไปไม่ดาวน์โหลดจาก GitHub', async () => {
  const { loadDraws } = await import('../netlify/lib/data.mjs');
  const base = draws.slice(0, -1); // งวดล่าสุดในข้อมูลนี้คือ 1 ต.ค. 2569
  await loadDraws('https://site.test', new Date('2026-10-05T03:00:00Z'), base);
  assert.ok(!calls.some((c) => c.url.includes('githubusercontent')));
  await loadDraws('https://site.test', new Date('2026-10-16T10:00:00Z'), base);
  assert.ok(calls.some((c) => c.url.includes('githubusercontent')));
});

test('webhook: ทำเครื่องหมาย "อ่านแล้ว" เมื่อ LINE ส่ง markAsReadToken มา', async () => {
  await webhook(signed({ events: [{ type: 'message', replyToken: 'r8', source: { type: 'user', userId: 'U1' }, message: { type: 'text', text: 'สวัสดี', markAsReadToken: 'tok-read' } }] }));
  const read = calls.find((c) => c.url === 'https://api.line.me/v2/bot/chat/markAsRead');
  assert.ok(read);
  assert.deepEqual(read.body, { markAsReadToken: 'tok-read' });
  assert.equal(read.auth, 'Bearer tok');
});

test('การ์ด LINE: พื้นฟ้า ไม่มีปุ่ม/ข้อความท้าย และไม่มีบรรทัดกลยุทธ์', () => {
  const m = picksMessage('2026-11-01', draws, 'https://example.netlify.app');
  const json = JSON.stringify(m);
  assert.equal(m.contents.footer, undefined);
  assert.ok(!json.includes('กลยุทธ์ที่ AI'));
  assert.ok(!json.includes('เลข Bot งวดนี้'));
  assert.ok(!json.includes('ดูบทวิเคราะห์เต็ม'));
  assert.equal(m.contents.body.background.type, 'linearGradient');
});

test('webhook: เลข2ตัว / เลข3ตัว / เลขลอยบน / เลขลอยล่าง / ตรวจรางวัล', async () => {
  const ask = async (text) => {
    calls = [];
    await webhook(signed({ events: [{ type: 'message', replyToken: 'rx', source: { type: 'group', groupId: 'Cabc' }, message: { type: 'text', text } }] }));
    return calls.find((c) => c.url.endsWith('/reply'))?.body.messages;
  };
  assert.match((await ask('เลข 2 ตัว'))[0].altText, /เลขท้าย 2 ตัว/);
  assert.match((await ask('เลข3ตัว'))[0].altText, /เลข 3 ตัว/);
  assert.match((await ask('เลขลอยบน'))[0].altText, /เลขลอยบน/);
  const both = await ask('เลขลอย');
  assert.equal(both.length, 2);
  assert.match(both[0].altText, /เลขลอยบน/);
  assert.match(both[1].altText, /เลขลอยล่าง/);
  assert.match((await ask('ลอยล่าง'))[0].altText, /เลขลอยล่าง/);
  const last = draws.at(-1);
  const prev = draws.at(-2);
  const t = await ask(`ตรวจรางวัล ${last.first}`);
  assert.match(t[0].altText, /รางวัลที่ 1/);
  assert.ok(t[0].quickReply.items.length > 0);
  const [y, mo, d] = prev.date.split('-');
  const t2 = await ask(`ตรวจรางวัล ${prev.first} งวด ${d}/${mo}/${Number(y) + 543 - 2500}`);
  assert.match(t2[0].altText, /รางวัลที่ 1/);
  assert.match((await ask('ตรวจรางวัล'))[0].text, /ตามด้วยเลขสลาก 6 หลัก/);
});

test('การ์ด LINE ใช้หัว LOTTO-THAI และข้อความผลใช้ชื่อ LOTTO-THAI', async () => {
  const { resultMessage } = await import('../src/lib/line-messages.js');
  const m = resultMessage(draws.at(-1), draws, 'https://x');
  const texts = JSON.stringify(m.contents);
  assert.match(texts, /"LOTTO-THAI"/);
  assert.match(texts, /เลขจาก LOTTO-THAI (ไม่)?ถูกรางวัล/);
  assert.match(texts, /เลขที่แนะนำจาก LOTTO-THAI คือเลข/);
  assert.doesNotMatch(texts, /LOTTO ANALYTICS|เลขของ Bot/);
});

test('/api/draws: งวดใหม่ที่ออกหลัง deploy ขึ้นหน้าเว็บเองโดยไม่ต้อง deploy', async () => {
  const { default: drawsApi } = await import('../netlify/functions/draws.mjs');
  const base = draws.filter((d) => d.date < '2026-10-16');
  const csv = 'date,first,second,third,fourth,fifth,last2,last3f,last3b,near1\n' +
    '2026-10-16,011781,"040201,487283",,,,48,"392,402","171,255","011780,011782"\n';
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => new Response(String(url).endsWith('/data/draws.json') ? JSON.stringify({ draws: base }) : String(url).endsWith('.csv') ? csv : '', { status: String(url).includes('archive') ? 404 : 200 });
  const realUrl = process.env.URL; process.env.URL = 'https://draws-api.test'; // URL เฉพาะ ไม่ใช้แคชประวัติร่วมกับ test อื่น
  try {
    const res = await drawsApi(new Request('https://draws-api.test/api/draws'));
    const body = await res.json();
    const last = body.draws.at(-1);
    assert.equal(body.draws.length, base.length + 1);
    assert.equal(last.date, '2026-10-16');
    assert.equal(last.first, '011781');
    assert.equal(last.partial, true); // รางวัลที่ 2–5 ยังไม่ครบ
    assert.match(res.headers.get('netlify-cdn-cache-control'), /max-age=600/);
  } finally { globalThis.fetch = realFetch; process.env.URL = realUrl; }
});
