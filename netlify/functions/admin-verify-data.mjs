// POST /api/admin/verify-data — ตรวจงวดที่ 2 แหล่งข้อมูลไม่ตรงกันหรือข้อมูลไม่ครบ กับผลทางการของกองสลาก
// ทำทีละไม่เกิน BATCH งวดต่อครั้ง (ไม่ให้เกินเวลาของ function) · หน้า Admin เรียกซ้ำจนกว่า remaining = 0
import { isAuthorized, json } from '../lib/auth.mjs';
import { verifyWithGlo, OFFICIAL_KEY } from '../lib/data.mjs';
import { readJSON, recordActivity } from '../lib/settings.mjs';

export const config = { path: '/api/admin/verify-data' };
const BATCH = 8;

// งวดที่ควรตรวจ: จาก validation.json ที่สร้างตอน fetch-data
export async function flaggedDates(siteUrl) {
  const res = await fetch(`${siteUrl}/data/validation.json`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`โหลด validation.json ไม่สำเร็จ (${res.status})`);
  const v = await res.json();
  return [...new Set([...(v.mismatch ?? []), ...(v.structuralIssues ?? [])].map((x) => x.date))].sort();
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST เท่านั้น' }, 405);
  if (!isAuthorized(req)) return json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, 401);
  try {
    const siteUrl = process.env.URL;
    const flagged = await flaggedDates(siteUrl);
    const done = (await readJSON(OFFICIAL_KEY))?.draws ?? {};
    const pending = flagged.filter((d) => !done[d]);
    const { draws } = await (await fetch(`${siteUrl}/data/draws.json`, { signal: AbortSignal.timeout(5000) })).json();
    const result = await verifyWithGlo(pending.slice(0, BATCH), draws);
    const remaining = Math.max(0, pending.length - BATCH);
    if (!remaining) await recordActivity('verify', { ok: result.failed === 0, flagged: flagged.length, failed: result.failed });
    return json({ ...result, flagged: flagged.length, alreadyVerified: flagged.length - pending.length, remaining });
  } catch (err) {
    return json({ error: err.message }, 502);
  }
};
