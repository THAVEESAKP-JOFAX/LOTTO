// GET /api/site-lock/check — Edge function ถามว่าผู้เข้าชมคนนี้เข้าหน้าเว็บได้หรือไม่ (ดูจากคุกกี้)
// ไม่ส่งข้อมูลลับ ตอบแค่ locked/allowed · อ่านค่าไม่ได้ตอบ 503 ให้ฝั่ง Edge ใช้สถานะล่าสุดที่รู้
import { checkAccess } from '../lib/site-lock.mjs';

export const config = { path: '/api/site-lock/check' };

export default async (req) => {
  try {
    return new Response(JSON.stringify(await checkAccess(req)), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch (err) {
    console.error('site-lock check', err.message);
    return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
};
