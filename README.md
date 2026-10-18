# LOTTO Analytics — วิเคราะห์หวยไทยย้อนหลัง 10 ปี

ดูแผนเต็มใน [PLAN.md](PLAN.md) · ตั้งค่า LINE bot: [docs/LINE_SETUP.md](docs/LINE_SETUP.md)

```bash
npm install
npm run fetch-data   # ดึงข้อมูล 10 ปี + ตรวจข้าม 2 แหล่ง
npm run backtest     # backtest ทุก bot
npm test
npm run dev          # http://localhost:5173
npm run bot:test     # ทดสอบรัน bot: เลขงวดหน้า + ตรวจผลงวดล่าสุด (เพิ่ม --send เพื่อส่งเข้า LINE จริง)
npm run deploy       # ถามยืนยันก่อน deploy ขึ้น Netlify ทุกครั้ง
```
