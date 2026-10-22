// Rich Menu ของ LOTTO-THAI (แผงปุ่ม 3 × 2 ใต้ช่องพิมพ์ในแชต 1:1) — ใช้ร่วมกันระหว่างสคริปต์และปุ่มในหน้า Admin
const NAME = 'LOTTO-THAI menu';
const W = 2500, H = 1686;
// เรียงซ้ายไปขวา บนลงล่าง ตรงกับรูป brand/line-rich-menu.jpg
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

async function call(token, method, url, body, type = 'application/json') {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': type } : {}) },
    body: body && type === 'application/json' ? JSON.stringify(body) : body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LINE ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

// ลบเมนูเดิมของ LOTTO-THAI → สร้างใหม่ → อัปโหลดรูป → ตั้งเป็นเมนูหลักของทุกคน
export async function installRichMenu(token, image) {
  const { richmenus = [] } = await call(token, 'GET', 'https://api.line.me/v2/bot/richmenu/list');
  const removed = [];
  for (const m of richmenus.filter((m) => m.name === NAME)) {
    await call(token, 'DELETE', `https://api.line.me/v2/bot/richmenu/${m.richMenuId}`);
    removed.push(m.richMenuId);
  }
  const { richMenuId } = await call(token, 'POST', 'https://api.line.me/v2/bot/richmenu', richMenu);
  await call(token, 'POST', `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, image, 'image/jpeg');
  await call(token, 'POST', `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`);
  return { richMenuId, removed };
}
