// อ่าน/บันทึกการตั้งค่า bot ใน Netlify Blobs (ถ้าใช้ไม่ได้ เช่น ตอนทดสอบในเครื่อง จะใช้ค่าเริ่มต้น)
import { getStore } from '@netlify/blobs';
import { normalizeSettings } from '../../src/lib/settings.js';

const KEY = 'bot-settings';
let storeOverride = null;
// ให้ tests ใส่ store จำลองได้
export const setSettingsStore = (store) => { storeOverride = store; };
const store = () => storeOverride ?? getStore({ name: 'lotto-settings', consistency: 'strong' });

export async function getSettings() {
  try {
    return normalizeSettings((await store().get(KEY, { type: 'json' })) ?? {});
  } catch (err) {
    console.error('settings: ใช้ค่าเริ่มต้น', err.message);
    return normalizeSettings({});
  }
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = normalizeSettings({
    ...current, ...patch,
    picks: { ...current.picks, ...(patch.picks ?? {}) },
    public: { ...current.public, ...(patch.public ?? {}) },
  });
  await store().setJSON(KEY, next);
  return next;
}

// บันทึกการทำงานล่าสุดของ bot (แสดงในหน้า Admin) — เขียนไม่สำเร็จก็ไม่ทำให้การส่งข้อความล้ม
const ACTIVITY_KEY = 'bot-activity';
export async function getActivity() {
  try {
    return (await store().get(ACTIVITY_KEY, { type: 'json' })) ?? {};
  } catch {
    return {};
  }
}
export async function recordActivity(kind, data = {}) {
  try {
    const current = await getActivity();
    await store().setJSON(ACTIVITY_KEY, { ...current, [kind]: { at: new Date().toISOString(), ...data } });
  } catch (err) {
    console.error('activity', err.message);
  }
}

// ค่าทั่วไปใน Blobs (ใช้เก็บแคช) — อ่าน/เขียนไม่ได้ก็คืนค่า null แทนการทำให้ระบบล้ม
export async function readJSON(key) {
  try {
    return (await store().get(key, { type: 'json' })) ?? null;
  } catch {
    return null;
  }
}
export async function writeJSON(key, value) {
  try {
    await store().setJSON(key, value);
  } catch (err) {
    console.error('cache', err.message);
  }
}
