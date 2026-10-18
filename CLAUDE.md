# LOTTO — วิเคราะห์หวยไทย 10 ปี

## กฎสำคัญ
- **ห้าม deploy ขึ้น Netlify โดยไม่ได้ถามและได้รับการยืนยันจากผู้ใช้ก่อนทุกครั้ง** (รวมถึง draft/preview)
  การยืนยันครั้งก่อนไม่นับเป็นการยืนยันครั้งถัดไป
- ก่อนขอยืนยัน: รัน `npm test` และ `npm run build` ให้ผ่าน แล้วสรุปให้ผู้ใช้ว่าจะ deploy อะไร (จำนวนงวด, commit, production/draft)
- ห้ามเปิด auto-deploy จาก Git

## คำสั่ง
- `npm run fetch-data` — ดึงข้อมูลใหม่ (2 แหล่ง + ตรวจข้าม) → `public/data/`
- `npm run backtest` — รัน backtest ทุก bot × ทุกเกม → `public/data/backtest.json`
- `npm test` / `npm run dev` / `npm run build`
- `npm run deploy` — test + build + ถามยืนยัน แล้ว deploy

## โครงสร้าง
- `src/lib/` — logic ที่ใช้ร่วมกันทั้ง Node และเบราว์เซอร์ (prizes, rng, analysis, bots, backtest)
- `scripts/` — fetch-data, backtest-report, deploy
- `netlify/functions/` — LINE: `line-webhook` (คำสั่งในกลุ่ม), `line-send` (ส่งจากเว็บ, ต้องมี ALERT_ADMIN_KEY),
  `line-alert-picks` / `line-alert-result` (scheduled) · `netlify/lib/` — LINE client + โหลดผลงวดใหม่
- Env บน Netlify: `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `LINE_GROUP_IDS`, `ALERT_ADMIN_KEY` — ห้าม commit ค่าเหล่านี้
- Backtest ต้องเป็น walk-forward เสมอ (งวด t ใช้ข้อมูลก่อน t เท่านั้น) — มี test ครอบคลุม
