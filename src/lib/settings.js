// การตั้งค่าการทำงานของ bot ที่แก้ได้จากหน้า Admin (เก็บใน Netlify Blobs)
import { BOTS } from './bots.js';

export const DEFAULT_SETTINGS = {
  autoPicks: true,   // ส่งเลข bot เข้ากลุ่มอัตโนมัติ 09:00 น. วันออกรางวัล
  autoResult: true,  // ส่งผลรางวัลอัตโนมัติหลังผลออก
  commands: true,    // ตอบคำสั่งที่พิมพ์ในกลุ่ม (เลขเด็ด, เลข2ตัว ฯลฯ)
  botId: 'adaptive', // กลยุทธ์ที่ใช้เลือกเลขส่ง LINE
  picks: { last2: 5, last3: 3, front3: 3, first: 2, float: 3 },
  // ส่วนที่ซ่อนจากหน้าปกติ (เปิดให้ผู้เข้าชมทั่วไปเห็นได้จากหน้า Admin)
  public: { bot: false, check: false, backtest: false },
};

const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);

// รวมค่าที่บันทึกไว้กับค่าเริ่มต้น และกันค่าผิดรูปแบบ
export function normalizeSettings(raw = {}) {
  const d = DEFAULT_SETTINGS;
  const p = raw.picks ?? {};
  const pub = raw.public ?? {};
  return {
    autoPicks: bool(raw.autoPicks, d.autoPicks),
    autoResult: bool(raw.autoResult, d.autoResult),
    commands: bool(raw.commands, d.commands),
    botId: BOTS.some((b) => b.id === raw.botId) ? raw.botId : d.botId,
    picks: {
      last2: clampInt(p.last2, 1, 10, d.picks.last2),
      last3: clampInt(p.last3, 1, 10, d.picks.last3),
      front3: clampInt(p.front3, 1, 10, d.picks.front3),
      first: clampInt(p.first, 1, 5, d.picks.first),
      float: clampInt(p.float, 1, 5, d.picks.float),
    },
    public: {
      bot: bool(pub.bot, d.public.bot),
      check: bool(pub.check, d.public.check),
      backtest: bool(pub.backtest, d.public.backtest),
    },
  };
}
