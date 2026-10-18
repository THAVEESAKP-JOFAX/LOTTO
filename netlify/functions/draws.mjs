// ผลสลากล่าสุดสำหรับหน้าเว็บ: ประวัติจากไฟล์ตอน deploy + งวดใหม่ที่ออกหลังจากนั้น
// หน้าเว็บจึงอัปเดตงวดใหม่เองโดยไม่ต้อง deploy ใหม่ (ใช้ตัวโหลดเดียวกับ LINE bot)
import { loadDraws } from '../lib/data.mjs';

export const config = { path: '/api/draws' };

export default async () => {
  try {
    const draws = await loadDraws(process.env.URL);
    return new Response(JSON.stringify({ draws, updatedAt: new Date().toISOString() }), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300',
        // CDN เก็บไว้ 10 นาที ระหว่างนั้นคนเข้าเว็บไม่ต้องรอโหลดจาก GitHub ทุกครั้ง
        'netlify-cdn-cache-control': 'public, durable, max-age=600, stale-while-revalidate=3600',
      },
    });
  } catch (err) {
    console.error('draws', err);
    return new Response(JSON.stringify({ error: 'โหลดผลสลากไม่สำเร็จ' }), { status: 502, headers: { 'content-type': 'application/json' } });
  }
};
