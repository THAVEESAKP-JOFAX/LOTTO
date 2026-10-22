// ติดตั้ง Rich Menu จากเครื่องตัวเอง (หรือกดปุ่มในหน้า Admin → การแจ้งเตือน LINE ก็ได้)
// ใช้:  LINE_CHANNEL_ACCESS_TOKEN=xxx npm run rich-menu   ·   npm run rich-menu -- --dry-run
import { readFileSync } from 'node:fs';
import { richMenu, installRichMenu } from '../netlify/lib/rich-menu.mjs';

export { richMenu };

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify(richMenu, null, 2));
    process.exit(0);
  }
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.error('ต้องกำหนด LINE_CHANNEL_ACCESS_TOKEN ก่อน เช่น LINE_CHANNEL_ACCESS_TOKEN=xxx npm run rich-menu');
    process.exit(1);
  }
  const { richMenuId, removed } = await installRichMenu(token, readFileSync(new URL('../brand/line-rich-menu.jpg', import.meta.url)));
  if (removed.length) console.log('ลบเมนูเดิม', removed.join(', '));
  console.log(`✅ ติดตั้ง Rich Menu แล้ว (${richMenuId}) — เปิดแชต 1:1 กับ bot เพื่อดูเมนู`);
}
