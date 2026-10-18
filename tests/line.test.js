import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { nextDrawDate, isDrawDay, upcomingDraw, todayInThailand } from '../src/lib/schedule.js';
import { picksMessage, resultMessage, botPicksFor, scorePicks } from '../src/lib/line-messages.js';
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
