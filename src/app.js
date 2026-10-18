// ส่วนแสดงผลที่ใช้ร่วมกันระหว่างหน้าปกติ (main.js) และหน้า Admin (admin.js)
import {
  Chart, LineController, LineElement, PointElement, BarController, BarElement, DoughnutController, ArcElement,
  LinearScale, CategoryScale, Filler, Tooltip, Legend,
} from 'chart.js';
import { GAMES, frequency, gaps, positional, summary, pad } from './lib/analysis.js';
import { BOTS, pick, explain, adaptiveReport } from './lib/bots.js';
import { mulberry32, randomSeed } from './lib/rng.js';
import { theoreticalReturn, TICKET_PRICE } from './lib/prizes.js';
import { nextDrawDate } from './lib/schedule.js';
import { analyzeNumber } from './lib/checker.js';
import { parseTickets, checkTickets, MAX_TICKETS } from './lib/ticket-check.js';

Chart.register(LineController, LineElement, PointElement, BarController, BarElement, DoughnutController, ArcElement,
  LinearScale, CategoryScale, Filler, Tooltip, Legend);

// สีของแต่ละ bot (ผ่านการตรวจ CVD บนพื้นหลังมืดแล้ว) — สีผูกกับ bot ไม่ใช่อันดับ
const BOT_COLOR = {
  random: '#8a96a3', hot: '#eb6834', cold: '#2a78d6', overdue: '#eda100',
  positional: '#1baf7a', markov: '#6250d6', ensemble: '#e87ba4', bayes: '#008300', adaptive: '#e34948',
};
const INK = { text: '#1f2333', muted: '#5c6378', grid: 'rgba(31,35,51,0.07)', surface: '#ffffff' };
Chart.defaults.font.family = "'Anuphan', system-ui, sans-serif";
Chart.defaults.color = INK.muted;

export const $ = (s) => document.querySelector(s);
export const thDate = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
const thShort = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' });
export const fmtDate = (iso, short) => (short ? thShort : thDate).format(new Date(iso + 'T00:00:00+07:00'));
const baht = (n) => `${n < 0 ? '−' : ''}฿${Math.abs(Math.round(n)).toLocaleString('th-TH')}`;
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function segmented(el, options, initial, onChange) {
  el.innerHTML = options.map(([v, label]) => `<button data-v="${v}" class="${v === initial ? 'on' : ''}">${label}</button>`).join('');
  bindSeg(el, onChange);
}
export function bindSeg(el, onChange) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    onChange(b.dataset.v);
  });
}
export const segValue = (el) => el.querySelector('.on')?.dataset.v;

export async function load() {
  const [d, bt, val] = await Promise.all(
    ['draws', 'backtest', 'validation'].map((f) => fetch(`/data/${f}.json`).then((r) => r.json())));
  return { draws: d.draws, updatedAt: d.updatedAt, backtest: bt, validation: val };
}

// ---------- hero ----------
export function renderHero(draws) {
  const last = draws.at(-1);
  $('#hero-lede').textContent =
    `ข้อมูล ${draws.length} งวด ตั้งแต่ ${fmtDate(draws[0].date)} ถึง ${fmtDate(last.date)} ` +
    `ตรวจสอบข้าม 2 แหล่ง พร้อมตรวจรางวัลย้อนหลังได้ทุกงวด`;
  $('#latest').innerHTML = `
    <div class="label">ผลสลากงวดล่าสุด</div>
    <div class="date">${fmtDate(last.date)}</div>
    <div class="label">รางวัลที่ 1</div>
    <div class="first-prize">${last.first}</div>
    <div class="sub-prizes">
      <div><span>เลขหน้า 3 ตัว</span><b>${last.front3.join(' · ')}</b></div>
      <div><span>เลขท้าย 3 ตัว</span><b>${last.last3.join(' · ')}</b></div>
      <div><span>เลขท้าย 2 ตัว</span><b>${last.last2}</b></div>
    </div>`;
}

// ---------- overview ----------
export function renderKpis(draws) {
  const s = summary(draws);
  const tiles = [
    ['จำนวนงวด', s.draws.toLocaleString('th-TH'), '10 ปีล่าสุด · ออกเดือนละ 2 ครั้ง'],
    ['2 ตัวท้าย คี่ : คู่', `${s.odd} : ${s.even}`, 'คาดหวัง 50 : 50'],
    ['2 ตัวท้าย สูง : ต่ำ', `${s.high} : ${s.low}`, 'สูง = 50–99'],
    ['เลขเบิ้ล (00, 11, …)', s.doubles, `คาดหวัง ≈ ${(s.draws / 10).toFixed(0)} งวด`],
    ['2 ตัวซ้ำงวดติดกัน', s.consecutiveRepeats, `คาดหวัง ≈ ${((s.draws - 1) / 100).toFixed(1)} ครั้ง`],
    ['ความสุ่มของ 2 ตัวท้าย', `p = ${s.chiLast2.p.toFixed(2)}`, s.chiLast2.p > 0.05 ? 'Chi-square: ไม่พบความเอนเอียง' : 'Chi-square: พบความเอนเอียง'],
    ['เงินคืนผู้เล่น (ทฤษฎี)', pct(theoreticalReturn(), 0), `ต่อสลากใบละ ${TICKET_PRICE} บาท`],
  ];
  $('#kpis').innerHTML = tiles.map(([l, v, f]) =>
    `<div class="card kpi"><div class="k-label">${l}</div><div class="k-value">${v}</div><div class="k-foot">${f}</div></div>`).join('');
}

// ---------- huay ----------
export const huay = { game: 'last2', metric: 'freq' };

export function renderHuay(draws) {
  const game = GAMES[huay.game];
  const freq = frequency(draws, game);
  const gap = gaps(draws, game);
  const latest = new Set(game.values(draws.at(-1)));
  const items = [...freq.keys()];
  const top = (arr, dir) => [...items].sort((a, b) => dir * (arr[b] - arr[a]) || a - b).slice(0, 10);
  const lists = [
    ['🔥 ออกบ่อยที่สุด', top(freq, 1), (n) => `${freq[n]} ครั้ง`],
    ['❄️ ออกน้อยที่สุด', top(freq, -1), (n) => `${freq[n]} ครั้ง`],
    ['⏳ ค้างนานที่สุด', top(gap, 1), (n) => (gap[n] > draws.length ? 'ไม่เคยออก' : `${gap[n]} งวด`)],
  ];
  $('#ranks').innerHTML = lists.map(([t, ns, f]) => `
    <div><h4>${t}</h4><ol>${ns.map((n) => `<li><b>${pad(n, game.digits)}</b><span>${f(n)}</span></li>`).join('')}</ol></div>`).join('');

  if (game.space === 100) {
    const vals = huay.metric === 'freq' ? freq : gap.map((g) => Math.min(g, draws.length));
    const max = Math.max(...vals), min = Math.min(...vals);
    $('#heatmap').style.display = '';
    $('#heatmap').className = 'heatmap';
    $('#heatmap').innerHTML = vals.map((v, n) => {
      const a = 0.06 + 0.84 * ((v - min) / (max - min || 1));
      const tip = `${pad(n, 2)} · ออก ${freq[n]} ครั้ง · ค้าง ${gap[n]} งวด`;
      return `<div class="cell${latest.has(pad(n, 2)) ? ' latest-hit' : ''}" style="background:rgba(91,108,240,${a.toFixed(3)});color:${a > 0.55 ? '#fff' : INK.text}" title="${tip}" aria-label="${tip}">${pad(n, 2)}</div>`;
    }).join('');
    const expect = (draws.length / 100).toFixed(1);
    $('#heat-title').textContent = huay.metric === 'freq' ? 'แผนที่ความถี่ 00–99' : 'แผนที่งวดที่ค้าง 00–99';
    $('#heat-note').textContent = huay.metric === 'freq'
      ? `สีเข้ม = ออกบ่อย · ค่าเฉลี่ยที่คาดหวัง ${expect} ครั้ง/เลข · กรอบสว่าง = งวดล่าสุด · ช่วงจริง ${min}–${max} ครั้ง`
      : `สีเข้ม = ไม่ออกมานาน · กรอบสว่าง = งวดล่าสุด`;
    $('#heat-metric').style.display = '';
  } else {
    // 3 ตัว: 1,000 เลขมากเกินแผนที่ → แสดงความถี่หลักต่อตำแหน่งแทน
    $('#heat-metric').style.display = 'none';
    $('#heat-title').textContent = `${game.label}: หลักต่อตำแหน่ง`;
    renderPosMap($('#heatmap'), positional(draws, game), ['หลักร้อย', 'หลักสิบ', 'หลักหน่วย']);
    $('#heat-note').textContent = `ออกงวดละ ${game.perDraw} เลข · ค่าเฉลี่ยคาดหวัง ${(draws.length * game.perDraw / 1000).toFixed(2)} ครั้ง/เลข จึงต้องดูระดับหลักแทน`;
  }
}

export function renderPosMap(el, m, labels) {
  el.className = 'posmap';
  const all = m.flat();
  const max = Math.max(...all), min = Math.min(...all);
  el.innerHTML = `<div></div>${[...Array(10).keys()].map((d) => `<div class="h">${d}</div>`).join('')}` +
    m.map((row, p) => `<div class="row-label">${labels[p]}</div>` + row.map((c, d) => {
      const a = 0.06 + 0.84 * ((c - min) / (max - min || 1));
      return `<div class="cell" style="background:rgba(91,108,240,${a.toFixed(3)});color:${a > 0.55 ? '#fff' : INK.text}" title="${labels[p]} หลัก ${d}: ${c} ครั้ง">${c}</div>`;
    }).join('')).join('');
}

// ---------- lottery 6 digits ----------
export function renderLottery(draws) {
  const s = summary(draws);
  renderPosMap($('#posmap'), positional(draws, GAMES.first), ['แสนหลัก', 'หมื่น', 'พัน', 'ร้อย', 'สิบ', 'หน่วย']);
  const ps = s.chiFirstPositions.map((c) => c.p);
  $('#pos-note').textContent = `Chi-square แต่ละตำแหน่ง p = ${ps.map((p) => p.toFixed(2)).join(', ')} ` +
    `(p > 0.05 = กระจายตัวสม่ำเสมอตามการสุ่ม) · คาดหวัง ${(draws.length / 10).toFixed(1)} ครั้ง/ช่อง`;

  const lo = 8, hi = 46;
  const labels = []; const data = [];
  for (let i = lo; i <= hi; i++) { labels.push(i); data.push(s.sumHist[i] || 0); }
  new Chart($('#sum-chart'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'จำนวนงวด', data, backgroundColor: '#6d74f2', borderRadius: 4, borderSkipped: 'start', barPercentage: 0.86, categoryPercentage: 1 }] },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (i) => `ผลรวมหลัก ${i[0].label}`, label: (i) => `${i.raw} งวด` } } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 10 }, title: { display: true, text: 'ผลรวมของ 6 หลัก' } },
        y: { grid: { color: INK.grid }, beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });
  $('#sum-note').textContent = `ค่าเฉลี่ยจริง ${s.meanDigitSum.toFixed(2)} · ค่าคาดหวังทางทฤษฎี 27.00 — รูประฆังคว่ำเกิดจากการบวกเลขสุ่ม ไม่ใช่รูปแบบที่ทำนายได้`;
}

// ---------- bot ----------
const botState = { id: 'adaptive' };

export function renderBots(draws) {
  $('#bot-list').innerHTML = BOTS.map((b) => `
    <button class="bot-card${b.id === botState.id ? ' on' : ''}" data-id="${b.id}">
      <span class="ic">${b.icon}</span><b>${b.name}</b><small>${b.desc}</small>
    </button>`).join('');
  $('#bot-list').addEventListener('click', (e) => {
    const c = e.target.closest('.bot-card');
    if (!c) return;
    botState.id = c.dataset.id;
    $('#bot-list').querySelectorAll('.bot-card').forEach((x) => x.classList.toggle('on', x === c));
  });
  $('#bot-game').innerHTML = Object.values(GAMES).map((g) => `<option value="${g.key}">${g.label}</option>`).join('');
  bindSeg($('#bot-mode'), () => {});
  $('#bot-run').addEventListener('click', () => runBot(draws));
}

export function runBot(draws) {
  const game = GAMES[$('#bot-game').value];
  const k = Math.max(1, Math.min(20, Number($('#bot-k').value) || 5));
  const mode = segValue($('#bot-mode'));
  const seedIn = $('#bot-seed').value.trim();
  const seed = seedIn ? Number(seedIn.replace(/\D/g, '')) || 0 : randomSeed();
  const bot = BOTS.find((b) => b.id === botState.id);
  const picks = pick(bot.id, draws, game, k, mode, mulberry32(seed));
  const next = nextDrawDate(draws.at(-1).date);
  $('#bot-out').innerHTML =
    `<div class="bot-meta">${bot.icon} ${bot.name} · ${game.label} · โหมด${mode === 'analyze' ? 'วิเคราะห์' : 'สุ่ม'} · seed ${seed} · สำหรับงวด ${fmtDate(next)}</div>` +
    adaptiveNote(bot.id, draws, game) +
    picks.map((n, i) => `<div class="pick" style="animation-delay:${i * 60}ms"><span class="num">${n}</span><span class="why">${esc(explain(n, draws, game))}</span></div>`).join('') +
    `<div class="bot-meta">โอกาสถูกต่อเลขยังคงเท่าเดิมทุกกลยุทธ์ — ดูหลักฐานในส่วน Backtest ด้านล่าง</div>`;
}

function adaptiveNote(botId, draws, game) {
  if (botId !== 'adaptive') return '';
  const rep = adaptiveReport(draws, game);
  if (!rep.length) return '';
  const name = (id) => BOTS.find((b) => b.id === id);
  return `<div class="bot-meta">🧠 งวดนี้เลือกใช้ <b>${name(rep[0].id).icon} ${name(rep[0].id).name}</b> — ` +
    rep.map((r) => `${name(r.id).name} ${(r.quality * 100).toFixed(1)}`).join(' · ') +
    ` (คะแนนเปอร์เซ็นไทล์เฉลี่ยของเลขที่ออกจริงใน 48 งวดล่าสุด, สุ่ม = 50.0)</div>`;
}


// ---------- ทดสอบเลข ----------
export function renderChecker(draws) {
  const run = () => {
    const raw = $('#check-input').value.trim();
    const out = $('#check-out');
    if (!raw) { out.innerHTML = ''; return; }
    const r = analyzeNumber(draws, raw);
    if (r.error) { out.innerHTML = `<p class="note">${esc(r.error)}</p>`; return; }
    out.innerHTML = r.games.map((g) => checkGameHtml(r, g)).join('') + checkVerdict(r);
  };
  $('#check-form').addEventListener('submit', (e) => { e.preventDefault(); run(); });
}

function checkGameHtml(r, g) {
  const h = g.history;
  const odds = g.key === 'first'
    ? `<div><span>โอกาสถูกรางวัลใดก็ได้</span><b>1 ใน ${g.oneIn.toLocaleString('th-TH')}</b><small>รางวัลที่ 1 คือ 1 ใน 1,000,000</small></div>`
    : `<div><span>โอกาสออกงวดหน้า</span><b>${pct(g.probability, 1)}</b><small>1 ใน ${g.oneIn.toLocaleString('th-TH')} · เท่ากับทุกเลข</small></div>`;
  const histTiles = h ? `
    <div><span>ออกใน ${r.draws} งวด</span><b>${h.count} ครั้ง</b><small>ค่าคาดหวัง ${h.expected.toFixed(1)} ครั้ง</small></div>
    <div><span>ออกล่าสุด</span><b>${h.lastSeen ? fmtDate(h.lastSeen, true) : 'ไม่เคยออก'}</b><small>${h.gap ? `${h.gap} งวดก่อน` : 'ในช่วง 10 ปี'}</small></div>` : '';
  const b = g.buy;
  const buyTile = `<div><span>ถ้าซื้อเลขนี้ทุกงวด (${b.draws} งวด)</span><b class="${b.profit >= 0 ? 'pos' : 'neg'}">${baht(b.profit)}</b><small>ต้นทุน ${baht(b.cost)} · ถูก ${b.wins} ครั้ง · ROI ${pct(b.roi)}</small></div>`;
  const parts = g.key === 'first' && r.parts.length
    ? `<div class="check-tiles">${r.parts.map((p) => `<div><span>${p.label} ${p.number}</span><b>${p.count} ครั้ง</b><small>คาดหวัง ${p.expected.toFixed(1)} · ${p.lastSeen ? `ล่าสุด ${fmtDate(p.lastSeen, true)}` : 'ไม่เคยออก'}</small></div>`).join('')}</div>` : '';
  const bars = g.bots.map((x) => `
    <div class="rank-bar"><span>${x.icon} ${x.name}</span><span class="track"><i style="width:${(x.percentile * 100).toFixed(0)}%;background:${BOT_COLOR[x.id]}"></i></span><em>${(x.percentile * 100).toFixed(0)}</em></div>`).join('');
  return `<div class="check-game">
    <div class="check-head"><span class="num">${r.number}</span><span class="tag">${g.label}</span></div>
    <div class="check-tiles">${odds}${histTiles}${buyTile}</div>
    ${parts}
    <div><h3>คะแนนจาก Bot แต่ละตัว <small class="note">(0–100 · 100 = bot ชอบเลขนี้ที่สุด · เส้นกลาง = 50)</small></h3><div class="rank-bars">${bars}</div></div>
  </div>`;
}

function checkVerdict(r) {
  const g = r.games[0];
  const avg = r.games.reduce((s, x) => s + x.avgBotPercentile, 0) / r.games.length;
  const h = g.history;
  const skew = h && h.pMoreThanChance < 0.05 ? `ออกบ่อยกว่าค่าเฉลี่ย (p = ${h.pMoreThanChance.toFixed(3)}) แต่เมื่อดูเลขทั้งหมด 100–1,000 ตัว ย่อมมีบางเลขออกบ่อยโดยบังเอิญเสมอ` : 'ความถี่ในอดีตอยู่ในช่วงปกติของการสุ่ม';
  return `<div class="verdict"><b>สรุปเลข ${r.number}:</b> bot ให้คะแนนเฉลี่ย ${(avg * 100).toFixed(0)}/100 · ${skew} — ` +
    `โอกาสออกจริงงวดหน้ายังคงเป็น <b>${g.key === 'first' ? '1 ใน 1,000,000 สำหรับรางวัลที่ 1' : `${pct(g.probability, 1)} เท่ากับทุกเลข`}</b> เพราะการออกรางวัลแต่ละงวดเป็นอิสระต่อกัน</div>`;
}

// ---------- backtest ----------
const bt = { game: 'last2', mode: 'analyze', chart: null, cache: {} };
let worker;

function precomputed(report, gameKey, mode) {
  const g = report.games[gameKey];
  return { baseline: g.baseline, bots: g.bots.filter((b) => b.mode === mode || b.botId === 'random'), runs: report.settings.mcRuns };
}

export function renderBacktest(draws, report) {
  $('#bt-sub').textContent = `ทดสอบย้อนหลังแบบ walk-forward: ทุกงวดให้ bot เห็นเฉพาะข้อมูลก่อนหน้า (เริ่มหลังอุ่นเครื่อง ${report.settings.warmup} งวด) ` +
    `ซื้อสลากใบละ ${TICKET_PRICE} บาท รับเงินรางวัลตามกองสลาก แล้วเทียบกับการสุ่มเลขทั่วไป`;
  segmented($('#bt-game'), Object.values(GAMES).map((g) => [g.key, g.label]), bt.game, (v) => { bt.game = v; update(); });
  bindSeg($('#bt-mode'), (v) => { bt.mode = v; update(); });
  $('#bt-run').addEventListener('click', () => update(true));

  function update(force) {
    const k = Math.max(1, Math.min(20, Number($('#bt-k').value) || 5));
    if (k === report.settings.picks && !force) return show(precomputed(report, bt.game, bt.mode), k);
    const key = `${bt.game}|${bt.mode}|${k}`;
    if (bt.cache[key]) return show(bt.cache[key], k);
    $('#bt-status').textContent = 'กำลังคำนวณ…';
    worker ??= new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => { bt.cache[key] = data; $('#bt-status').textContent = ''; show(data, k); };
    worker.postMessage({ draws, gameKey: bt.game, mode: bt.mode, k, runs: 100 });
  }
  update();
}

function show(res, k) {
  const game = GAMES[bt.game];
  const bots = res.bots;
  // โดนัท: จำนวนครั้งที่เลขของแต่ละ bot ตรงกับเลขที่ออกจริง (เรียงมาก → น้อย)
  const byHits = [...bots].sort((a, b) => b.hits - a.hits);
  const totalHits = byHits.reduce((s, b) => s + b.hits, 0);
  const nameOf = (id) => BOTS.find((x) => x.id === id);
  const ds = [{
    data: byHits.map((b) => b.hits),
    backgroundColor: byHits.map((b) => BOT_COLOR[b.botId]),
    borderColor: INK.surface, borderWidth: 2, hoverOffset: 6,
  }];
  const centerText = {
    id: 'centerText',
    afterDraw(c) {
      const { ctx, chartArea: a } = c;
      const x = (a.left + a.right) / 2; const y = (a.top + a.bottom) / 2;
      ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = INK.text;
      ctx.font = '700 34px "Cormorant Garamond", serif'; ctx.fillText(String(totalHits), x, y + 4);
      ctx.fillStyle = INK.muted; ctx.font = '500 13px Anuphan, sans-serif'; ctx.fillText('ครั้งที่เลขตรงผลจริง', x, y + 26);
      ctx.restore();
    },
  };
  const opts = {
    maintainAspectRatio: false, cutout: '64%', animation: { duration: 400 },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (i) => {
            const b = byHits[i.dataIndex];
            return ` ${nameOf(b.botId).name}: ${b.hits} ครั้ง (คาดหวัง ${b.expectedHits.toFixed(1)})`;
          },
        },
      },
    },
  };
  const labels = byHits.map((b) => nameOf(b.botId).name);
  if (bt.chart) bt.chart.destroy();
  bt.chart = new Chart($('#equity-chart'), { type: 'doughnut', data: { labels, datasets: ds }, options: opts, plugins: [centerText] });
  $('#bt-legend').innerHTML = byHits.map((b) => `
    <li><span class="dot" style="background:${BOT_COLOR[b.botId]}"></span>${nameOf(b.botId).icon} ${nameOf(b.botId).name}
      <b class="num">${b.hits}</b><small>ครั้ง</small></li>`).join('');

  const sorted = [...bots].sort((a, b) => b.profit - a.profit);
  $('#bt-table').innerHTML = `<thead><tr><th>Bot</th><th>ถูก / คาดหวัง</th><th>p-value</th><th>ต้นทุน</th><th>เงินรางวัล</th><th>กำไร/ขาดทุน</th><th>ROI</th><th>เทียบการสุ่ม</th></tr></thead><tbody>` +
    sorted.map((b) => {
      const bot = BOTS.find((x) => x.id === b.botId);
      return `<tr>
        <td><span class="dot" style="background:${BOT_COLOR[b.botId]}"></span>${bot.icon} ${bot.name}</td>
        <td class="num">${b.hits} / ${b.expectedHits.toFixed(1)}</td>
        <td class="num">${b.pValue.toFixed(3)}</td>
        <td class="num">${baht(b.cost)}</td>
        <td class="num">${baht(b.revenue)}</td>
        <td class="num ${b.profit >= 0 ? 'pos' : 'neg'}">${baht(b.profit)}</td>
        <td class="num ${b.roi >= 0 ? 'pos' : 'neg'}">${pct(b.roi)}</td>
        <td><span class="luck">${pct(b.luckPercentile, 0)}</span><span class="bar" title="ตำแหน่งเทียบการสุ่ม ${res.runs} รอบ (แถบ = 5–95%)"><i style="left:${(b.luckPercentile * 100).toFixed(0)}%"></i></span></td>
      </tr>`;
    }).join('') + '</tbody>';

  const best = sorted[0];
  const bestBot = BOTS.find((x) => x.id === best.botId);
  const sig = bots.filter((b) => b.pValue < 0.05 / bots.length);
  $('#bt-verdict').innerHTML =
    `<b>สรุป ${game.label} (${k} เลข/งวด, ${best.draws} งวด):</b> ` +
    `bot ที่ผลดีที่สุดคือ ${bestBot.icon} ${bestBot.name} ROI ${pct(best.roi)} — ` +
    (best.profit < 0 ? 'ยังขาดทุน และ' : 'แม้มีกำไรในช่วงนี้ แต่') +
    ` ${sig.length ? `มี ${sig.length} bot ที่ผ่านเกณฑ์นัยสำคัญ (p < ${(0.05 / bots.length).toFixed(3)})` : 'ไม่มี bot ใดถูกบ่อยกว่าการสุ่มอย่างมีนัยสำคัญ (Bonferroni p < ' + (0.05 / bots.length).toFixed(3) + ')'} ` +
    `ช่วง ROI ของการสุ่มเลขทั่วไป (5–95%) คือ ${pct(res.baseline.roi.p5)} ถึง ${pct(res.baseline.roi.p95)} — ` +
    (bots.every((b) => b.luckPercentile > 0.05 && b.luckPercentile < 0.95)
      ? 'ผลของทุก bot อยู่ในกรอบของ “โชค”'
      : 'บาง bot อยู่นอกช่วง 5–95% แต่เมื่อทดสอบหลายกลยุทธ์พร้อมกัน การหลุดกรอบบ้างเป็นเรื่องปกติของความบังเอิญ');
}

// ---------- history ----------
export function renderHistory(draws) {
  let limit = 24;
  const rows = [...draws].reverse();
  const hl = (s, q) => (q && s.includes(q) ? s.replace(q, `<mark>${q}</mark>`) : s);
  function draw() {
    const q = $('#hist-q').value.replace(/\D/g, '');
    const match = (d) => !q || d.first.includes(q) || d.last2 === q || d.front3.includes(q) || d.last3.includes(q);
    const list = rows.filter(match);
    $('#hist-table').innerHTML = `<thead><tr><th>งวดวันที่</th><th>รางวัลที่ 1</th><th>เลขหน้า 3 ตัว</th><th>เลขท้าย 3 ตัว</th><th>เลขท้าย 2 ตัว</th></tr></thead><tbody>` +
      list.slice(0, limit).map((d) => `<tr><td>${fmtDate(d.date)}</td><td class="mono">${hl(d.first, q)}</td>` +
        `<td class="mono">${d.front3.map((x) => hl(x, q.length === 3 ? q : '')).join(' · ')}</td>` +
        `<td class="mono">${d.last3.map((x) => hl(x, q.length === 3 ? q : '')).join(' · ')}</td>` +
        `<td class="mono">${q.length === 2 && d.last2 === q ? `<mark>${d.last2}</mark>` : d.last2}</td></tr>`).join('') +
      (list.length ? '' : '<tr><td colspan="5">ไม่พบเลขนี้ในช่วง 10 ปี</td></tr>') + '</tbody>';
    $('#hist-more').style.display = list.length > limit ? '' : 'none';
    $('#hist-more').textContent = `แสดงเพิ่ม (${list.length - limit} งวด)`;
  }
  $('#hist-q').addEventListener('input', () => { limit = 24; draw(); });
  $('#hist-more').addEventListener('click', () => { limit += 48; draw(); });
  draw();
}

// ---------- ตรวจรางวัล ----------
export function renderTicket(draws) {
  const select = $('#ticket-draw');
  select.innerHTML = [...draws].reverse().map((d, i) =>
    `<option value="${d.date}">${fmtDate(d.date)}${i === 0 ? ' (ล่าสุด)' : ''}</option>`).join('');
  const box = $('#ticket-inputs');
  const addBtn = $('#ticket-add');
  const addInput = (focus = false) => {
    const n = box.children.length + 1;
    if (n > MAX_TICKETS) return;
    const input = document.createElement('input');
    Object.assign(input, { type: 'text', inputMode: 'numeric', maxLength: 6, autocomplete: 'off', placeholder: `กรอกเลขสลาก ใบที่ ${n}` });
    input.className = 'ticket-input';
    input.setAttribute('aria-label', `เลขสลาก ใบที่ ${n}`);
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); });
    box.append(input);
    addBtn.hidden = box.children.length >= MAX_TICKETS;
    if (focus) input.focus();
  };
  for (let i = 0; i < 5; i++) addInput();
  addBtn.addEventListener('click', () => addInput(true));
  $('#ticket-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const out = $('#ticket-out');
    const tickets = parseTickets([...box.querySelectorAll('input')].map((x) => x.value).join(' '));
    if (!tickets.length) { out.innerHTML = `<p class="note">กรอกเลขสลาก 6 หลักอย่างน้อย 1 ใบ (สูงสุด ${MAX_TICKETS} ใบ)</p>`; return; }
    const r = checkTickets(draws, tickets, select.value);
    if (r.error) { out.innerHTML = `<p class="note">${esc(r.error)}</p>`; return; }
    out.innerHTML = `
      <div class="ticket-head">งวด <b>${fmtDate(r.draw.date)}</b> · รางวัลที่ 1 <b class="mono">${r.draw.first}</b></div>
      <div class="ticket-list">${r.results.map((x) => `
        <div class="ticket ${x.amount ? 'win' : ''}">
          <span class="num">${x.number}</span>
          <span class="res">${x.amount ? `🎉 ${x.prizes.join(' + ')}` : 'ไม่ถูกรางวัล'}</span>
          <span class="amt">${x.amount ? baht(x.amount) : ''}</span>
        </div>`).join('')}</div>
      <div class="verdict">${r.total ? `<b>ยินดีด้วย!</b> รวมเงินรางวัล <b>${baht(r.total)}</b>` : `ตรวจ ${r.results.length} ใบ ไม่ถูกรางวัลในงวดนี้`}
        ${r.partial ? '<br><small>งวดนี้ข้อมูลรางวัลที่ 4–5 ไม่ครบ ตรวจได้เฉพาะรางวัลหลัก</small>' : ''}</div>`;
  });
}
