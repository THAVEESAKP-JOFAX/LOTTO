// GET /api/settings — ค่าที่หน้าเว็บปกติต้องรู้ (ส่วนไหนเปิดให้ผู้เข้าชมเห็น) ไม่ต้องเข้าสู่ระบบ
import { getSettings } from '../lib/settings.mjs';
import { json } from '../lib/auth.mjs';

export const config = { path: '/api/settings' };

export default async () => json({ public: (await getSettings()).public });
