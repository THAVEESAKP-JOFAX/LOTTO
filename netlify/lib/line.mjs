// LINE Messaging API (LINE Notify ปิดบริการแล้วตั้งแต่ 31 มี.ค. 2025)
import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.line.me/v2/bot/message';

export function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('base64'));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

async function call(path, body, token = process.env.LINE_CHANNEL_ACCESS_TOKEN) {
  if (!token) throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN');
  const res = await fetch(`${API}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LINE ${path} ${res.status}: ${await res.text()}`);
}

export const reply = (replyToken, messages) => call('reply', { replyToken, messages: [].concat(messages) });

// ส่งเข้าทุกกลุ่มใน LINE_GROUP_IDS (คั่นด้วยจุลภาค)
export async function pushToGroups(messages, groups = groupIds()) {
  if (!groups.length) throw new Error('ยังไม่ได้ตั้งค่า LINE_GROUP_IDS');
  for (const to of groups) await call('push', { to, messages: [].concat(messages) });
  return groups.length;
}

export const groupIds = () => (process.env.LINE_GROUP_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
