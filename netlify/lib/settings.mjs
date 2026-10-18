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
