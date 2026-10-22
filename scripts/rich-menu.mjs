// ติดตั้ง Rich Menu (แผงปุ่มใต้ช่องพิมพ์) ให้ LINE OA — แสดงในแชต 1:1 กับ bot เท่านั้น (LINE ไม่แสดง Rich Menu ในกลุ่ม)
// ใช้:  LINE_CHANNEL_ACCESS_TOKEN=xxx npm run rich-menu            ติดตั้งและตั้งเป็นเมนูหลัก
//       npm run rich-menu -- --dry-run                               แสดงข้อมูลเมนูโดยไม่ส่งไป LINE
import { readFileSync } from 'node:fs';

const IMAGE = new URL('../brand/line-rich-menu.jpg', import.meta.url);
const NAME = 'LOTTO-THAI menu';
const W = 2500, H = 1686;
// ปุ่ม 3 × 2 เรียงซ้ายไปขวา บนลงล่าง ตรงกับรูป brand/line-rich-menu.jpg
const BUTTONS = ['เลขเด็ด', 'ผลหวย', 'ตรวจรางวัล', '3ตัวบน', 'ทำนายฝัน', 'คำสั่ง'];

export const richMenu = {
  size: { width: W, height: H },
  selected: true,
  name: NAME,
  chatBarText: 'เมนู LOTTO-THAI',
  areas: BUTTONS.map((text, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = Math.round((W / 3) * col), y = (H / 2) * row;
    return {
      bounds: { x, y, width: Math.round((W / 3) * (col + 1)) - x, height: H / 2 },
      action: { type: 'message', label: text, text },
    };
  }),
};

async function line(method, url, body, type = 'application/json') {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`, ...(body ? { 'Content-Type': type } : {}) },
    body: body && type === 'application/json' ? JSON.stringify(body) : body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify(richMenu, null, 2));
    process.exit(0);
  }
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    console.error('ต้องกำหนด LINE_CHANNEL_ACCESS_TOKEN ก่อน เช่น LINE_CHANNEL_ACCESS_TOKEN=xxx npm run rich-menu');
    process.exit(1);
  }
  // ลบเมนูเดิมของ LOTTO-THAI ก่อน เพื่อไม่ให้ซ้อนกัน
  const { richmenus = [] } = await line('GET', 'https://api.line.me/v2/bot/richmenu/list');
  for (const m of richmenus.filter((m) => m.name === NAME)) {
    await line('DELETE', `https://api.line.me/v2/bot/richmenu/${m.richMenuId}`);
    console.log('ลบเมนูเดิม', m.richMenuId);
  }
  const { richMenuId } = await line('POST', 'https://api.line.me/v2/bot/richmenu', richMenu);
  await line('POST', `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, readFileSync(IMAGE), 'image/jpeg');
  await line('POST', `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`);
  console.log(`✅ ติดตั้ง Rich Menu แล้ว (${richMenuId}) — เปิดแชต 1:1 กับ bot เพื่อดูเมนู`);
}
