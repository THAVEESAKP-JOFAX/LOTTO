// POST /api/admin/login { username, password } → { token, exp }
import { login, json } from '../lib/auth.mjs';

export const config = { path: '/api/admin/login' };

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const { username, password } = await req.json().catch(() => ({}));
  const r = login(username, password);
  if (r.error) {
    await new Promise((resolve) => setTimeout(resolve, 600)); // ชะลอการเดารหัส
    return json({ error: r.error }, 401);
  }
  return json(r);
};
