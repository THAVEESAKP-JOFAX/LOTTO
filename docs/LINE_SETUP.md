# ตั้งค่า LINE Bot แจ้งเตือนเข้ากลุ่ม

ใช้ **LINE Messaging API** (LINE Notify ปิดบริการแล้วตั้งแต่ 31 มี.ค. 2025)

> ขั้น 1–3 ทำได้ทันที · ขั้น 4–6 ต้อง deploy เว็บขึ้น Netlify ก่อน (LINE ต้องเรียกเว็บได้จริง)
> การ deploy ทุกครั้งต้องยืนยันก่อน ตามกฎใน `CLAUDE.md`

---

## ขั้น 1 — สร้าง LINE Official Account
1. เข้า https://manager.line.biz → ล็อกอินด้วย LINE → **สร้างบัญชี**
2. ตั้งชื่อ เช่น “LOTTO Analytics” · รูปโปรไฟล์ใช้ `brand/line-profile-640.png`

## ขั้น 2 — เปิด Messaging API
1. OA Manager → **ตั้งค่า → Messaging API → เปิดใช้ Messaging API** → เลือก/สร้าง Provider
2. **ตั้งค่าการตอบกลับ (Response settings)**
   - ข้อความตอบกลับอัตโนมัติ → **ปิด** (ไม่งั้น bot ตอบซ้ำซ้อน)
   - ข้อความทักทาย → **ปิด**
   - Webhook → **เปิด**
3. **ตั้งค่าบัญชี** → เปิด **“อนุญาตให้เข้าร่วมแชทกลุ่ม”**

## ขั้น 3 — เก็บรหัส 2 ตัว
เข้า https://developers.line.biz/console → เลือก channel ของ bot
- แท็บ **Basic settings** → คัดลอก **Channel secret**
- แท็บ **Messaging API** → **Channel access token (long-lived)** → กด **Issue** → คัดลอก

⚠️ เก็บไว้เอง **ห้ามส่งในแชต ห้าม commit ลง Git** — ใส่ใน Netlify โดยตรงเท่านั้น

## ขั้น 4 — ใส่รหัสใน Netlify
app.netlify.com → **lottothaipro → Site configuration → Environment variables**

| ชื่อ | ค่า |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | token จากขั้น 3 |
| `LINE_CHANNEL_SECRET` | secret จากขั้น 3 |
| `ALERT_ADMIN_KEY` | รหัสผ่านที่ตั้งเอง ยาว ๆ เดายาก — ใช้กดส่งแจ้งเตือนจากหน้าเว็บ |

- ติ๊ก **Contains secret values**
- เพิ่ม/แก้ค่าแล้วต้อง **deploy ใหม่ 1 ครั้ง** ค่าถึงจะมีผล

## ขั้น 5 — เชื่อม Webhook
LINE Developers → แท็บ **Messaging API**
1. **Webhook URL** = `https://lottothaipro.netlify.app/api/line/webhook`
2. เปิด **Use webhook**
3. กด **Verify** → ต้องขึ้น **Success**

## ขั้น 6 — เชิญ bot เข้ากลุ่ม
1. เพิ่ม bot เป็นเพื่อน → เชิญเข้ากลุ่ม LINE
2. bot ตอบกลับพร้อม **Group ID** (ขึ้นต้นด้วย `C…`) — พิมพ์ `groupid` ในกลุ่มเพื่อดูอีกครั้งได้
3. ใส่ใน Netlify เป็น `LINE_GROUP_IDS` (หลายกลุ่มคั่นด้วย `,`) → **deploy อีกครั้ง**

## ขั้น 7 — ทดสอบ
- พิมพ์ในกลุ่ม: `คำสั่ง` · `เลขเด็ด` · `ผลหวย` · `groupid`
- หน้าเว็บส่วน **แจ้งเตือน LINE** → ใส่ `ALERT_ADMIN_KEY` → กด **ทดสอบการเชื่อมต่อ**

---

## ระบบทำอะไรให้อัตโนมัติ
| เวลา (ไทย) | สิ่งที่ส่ง | function |
|---|---|---|
| 09:00 น. วันออกรางวัล | เลขของ 🧠 AI ปรับตัว (2 ตัว, 3 ตัวหน้า/ท้าย, 6 หลัก) | `line-alert-picks` |
| 15:30–18:30 น. ทุก 30 นาที | ผลรางวัล + ตรวจว่าเลข bot ถูกไหม (ส่งครั้งเดียวต่องวด) | `line-alert-result` |
| ทุกเวลา | ตอบคำสั่งที่พิมพ์ในกลุ่ม | `line-webhook` |
| กดจากหน้าเว็บ | ส่งเลข / ผล / ข้อความทดสอบ | `line-send` |

วันออกรางวัลใช้ปฏิทินปกติ (1 และ 16 · ยกเว้น 2 ม.ค., 17 ม.ค., 2 พ.ค.) — ถ้ากองสลากเลื่อนวันพิเศษ
การแจ้งผลยังทำงานถูก เพราะตรวจจากผลที่ออกจริง แต่การส่งเลขตอนเช้าอาจคลาดวัน

## โควตาข้อความ
- แพ็กเกจฟรีของ LINE จำกัดจำนวนข้อความต่อเดือน (ดูใน OA Manager)
- ข้อความ push เข้ากลุ่ม **นับตามจำนวนสมาชิก** เช่น กลุ่ม 20 คน × 2 ข้อความ/งวด × 2 งวด = 80 ข้อความ/เดือน
- การตอบคำสั่งในกลุ่ม (reply) **ไม่เสียโควตา**

## แก้ปัญหา
| อาการ | ตรวจ |
|---|---|
| Verify webhook ไม่ผ่าน | เว็บ deploy แล้วหรือยัง · URL ถูกไหม · site ไม่ได้ตั้งให้ต้องล็อกอินก่อนเข้า |
| พิมพ์คำสั่งแล้ว bot เงียบ | `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` ถูกไหม · deploy หลังใส่ค่าหรือยัง · Use webhook เปิดไหม |
| กดส่งจากเว็บขึ้น “รหัสผู้ดูแลไม่ถูกต้อง” | ใส่ให้ตรงกับ `ALERT_ADMIN_KEY` |
| ขึ้น “ยังไม่ได้ตั้งค่า LINE_GROUP_IDS” | ทำขั้น 6 แล้ว deploy ใหม่ |
| bot ตอบซ้ำ 2 ข้อความ | ปิดข้อความตอบกลับอัตโนมัติใน OA Manager |
| ดู log | Netlify → lottothaipro → Logs → Functions |
