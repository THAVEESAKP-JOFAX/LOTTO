// Deploy ขึ้น Netlify — ต้องยืนยันทุกครั้ง
//   npm run deploy            → test + build + สรุป แล้วถามยืนยัน (พิมพ์ "deploy")
//   npm run deploy -- --draft → deploy แบบ preview (ไม่ขึ้น production)
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

const draft = process.argv.includes('--draft');
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

run('npm test');
run('npm run build');

const { draws } = JSON.parse(readFileSync(new URL('../public/data/draws.json', import.meta.url), 'utf8'));
let commit = 'ไม่มี git commit';
try { commit = execSync('git log -1 --format="%h %s"', { encoding: 'utf8' }).trim(); } catch {}

console.log(`
──────────── สรุปก่อน deploy ────────────
 ปลายทาง : Netlify ${draft ? 'DRAFT (preview)' : 'PRODUCTION'}
 ข้อมูล   : ${draws.length} งวด (${draws[0].date} → ${draws.at(-1).date})
 commit  : ${commit}
 โฟลเดอร์ : dist/
─────────────────────────────────────────`);

if (!process.stdin.isTTY) {
  console.error('✗ ต้องรันในเทอร์มินัลเพื่อยืนยันด้วยตัวเอง — ยกเลิก deploy');
  process.exit(1);
}
const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = (await rl.question('พิมพ์ "deploy" เพื่อยืนยัน (อย่างอื่น = ยกเลิก): ')).trim();
rl.close();
if (answer !== 'deploy') {
  console.log('✗ ยกเลิก deploy');
  process.exit(1);
}
run(`npx --yes netlify-cli@27 deploy --dir=dist ${draft ? '' : '--prod'}`);
