// ล็อกหน้าเว็บสำหรับผู้เข้าชม (เปิด/ปิดและตั้งรหัสผ่านจากหน้า Admin)
// ทำงานเฉพาะหน้าแรก (/ และ /index.html) — หน้า Admin ไม่ถูกล็อก เพื่อให้เข้าไปปิดการล็อกได้เสมอ
// ถามสถานะจาก /api/site-lock/check (จำผลไว้ 30 วินาที) · ผิดพลาดอย่างไรก็ไม่ทำให้หน้าเว็บล่ม (เปิดให้ดูตามเดิม)
export const config = { path: ['/', '/index.html'] };

const CHECK_PATH = '/api/site-lock/check';
const TTL_MS = 30_000;
const cache = new Map(); // คุกกี้ → { at, state }
let lastLocked = false; // ครั้งล่าสุดที่ตอบได้ ล็อกอยู่หรือไม่ (ใช้ตอนเช็กไม่สำเร็จ)

async function lookup(request) {
  const cookie = request.headers.get('cookie') || '';
  const hit = cache.get(cookie);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.state;
  try {
    const res = await fetch(new URL(CHECK_PATH, request.url), { headers: { cookie }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`check ${res.status}`);
    const state = await res.json();
    if (cache.size > 200) cache.clear();
    cache.set(cookie, { at: Date.now(), state });
    lastLocked = Boolean(state.locked);
    return state;
  } catch (err) {
    console.error('site-lock:', err.message);
    if (hit) return hit.state;
    return lastLocked ? { locked: true, allowed: false } : { locked: false, allowed: true };
  }
}

export const lockPage = () => `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>LOTTO Analytics · เข้าสู่ระบบ</title>
<link rel="icon" href="/favicon.svg" />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600&family=Noto+Serif+Thai:wght@600;700&display=swap" rel="stylesheet" />
<style>
  :root { --bg: #f4f5fb; --card: #fff; --text: #1d2033; --muted: #6a6f87; --line: #dfe2ee; --a: #4b63e8; --b: #7d4de0; --err: #c93a3a; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0f1224; --card: #181c33; --text: #eef0fa; --muted: #98a0c0; --line: #2a2f4e; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; background: var(--bg); color: var(--text); font: 16px/1.6 'IBM Plex Sans Thai', system-ui, sans-serif; }
  main { width: 100%; max-width: 400px; background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 32px 28px 28px; box-shadow: 0 18px 50px rgba(40, 50, 110, .12); text-align: center; position: relative; overflow: hidden; }
  main::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 4px; background: linear-gradient(90deg, var(--a), var(--b)); }
  .ico { width: 56px; height: 56px; margin: 0 auto 14px; border-radius: 16px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, var(--a), var(--b)); }
  .ico svg { width: 28px; height: 28px; }
  h1 { margin: 0 0 4px; font: 700 22px/1.3 'Noto Serif Thai', serif; }
  p { margin: 0 0 20px; color: var(--muted); font-size: 14.5px; }
  form { display: grid; gap: 12px; }
  input { width: 100%; padding: 13px 14px; font: 500 17px 'IBM Plex Sans Thai', sans-serif; letter-spacing: .08em; text-align: center; color: var(--text); background: transparent; border: 1px solid var(--line); border-radius: 12px; outline: none; }
  input:focus { border-color: var(--a); box-shadow: 0 0 0 3px rgba(75, 99, 232, .18); }
  button { padding: 13px 16px; font: 600 16px 'IBM Plex Sans Thai', sans-serif; color: #fff; background: linear-gradient(135deg, var(--a), var(--b)); border: 0; border-radius: 12px; cursor: pointer; }
  button:disabled { opacity: .6; cursor: default; }
  .msg { min-height: 22px; margin: 12px 0 0; color: var(--err); font-size: 14px; }
</style>
</head>
<body>
<main>
  <div class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg></div>
  <h1>LOTTO Analytics</h1>
  <p>เว็บไซต์นี้เปิดให้เฉพาะผู้ที่มีรหัสผ่าน<br />กรุณากรอกรหัสผ่านเพื่อเข้าชม</p>
  <form id="f">
    <input id="pw" type="password" autocomplete="current-password" placeholder="รหัสผ่าน" maxlength="64" required autofocus />
    <button id="go" type="submit">เข้าสู่เว็บไซต์</button>
  </form>
  <p class="msg" id="msg" role="alert" aria-live="polite"></p>
</main>
<script>
  const f = document.getElementById('f'), pw = document.getElementById('pw'), go = document.getElementById('go'), msg = document.getElementById('msg');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    go.disabled = true; msg.textContent = '';
    try {
      const r = await fetch('/api/site-lock/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw.value }), credentials: 'same-origin' });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { location.reload(); return; }
      msg.textContent = d.error || 'เข้าสู่ระบบไม่สำเร็จ';
      pw.select();
    } catch {
      msg.textContent = 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง';
    }
    go.disabled = false;
  });
</script>
</body>
</html>`;

export default async (request, context) => {
  try {
    if (request.method === 'GET' || request.method === 'HEAD') {
      const state = await lookup(request);
      if (state.locked && !state.allowed) {
        return new Response(request.method === 'HEAD' ? null : lockPage(), {
          status: 401,
          headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' },
        });
      }
    }
  } catch (err) {
    console.error('site-lock:', err.message);
  }
  return context.next();
};
