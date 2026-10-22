// ส่วนแสดงผลที่ใช้ร่วมกันระหว่างหน้าปกติ (main.js) และหน้า Admin (admin.js)
import {
  Chart, LineController, LineElement, PointElement, BarController, BarElement, DoughnutController, ArcElement,
  LinearScale, CategoryScale, Filler, Tooltip, Legend,
} from 'chart.js';
import { GAMES, frequency, gaps, positional, summary, pad, PLACE_STATS, digitsByPlace } from './lib/analysis.js';
import { BOTS, pick, explain, adaptiveReport } from './lib/bots.js';
import { botIcon } from './bot-icons.js';
import { mulberry32, randomSeed } from './lib/rng.js';
import { theoreticalReturn, TICKET_PRICE, PRIZES } from './lib/prizes.js';
import { nextDrawDate, upcomingDraw, todayInThailand } from './lib/schedule.js';
import { analyzeNumber } from './lib/checker.js';
import { parseTickets, checkTickets, MAX_TICKETS } from './lib/ticket-check.js';

Chart.register(LineController, LineElement, PointElement, BarController, BarElement, DoughnutController, ArcElement,
  LinearScale, CategoryScale, Filler, Tooltip, Legend);

// สีของแต่ละ bot (ผ่านการตรวจ CVD บนพื้นหลังมืดแล้ว) — สีผูกกับ bot ไม่ใช่อันดับ
const BOT_COLOR = {
  random: '#8a96a3', hot: '#eb6834', cold: '#2a78d6', overdue: '#eda100',
  positional: '#1baf7a', markov: '#6250d6', ensemble: '#e87ba4', bayes: '#008300', adaptive: '#e34948',
};
// ไอคอน + ชื่อ bot สำหรับแสดงบนหน้าเว็บ
const botLabel = (id, size) => `${botIcon(id, BOT_COLOR[id], size)}<span class="bot-name">${BOTS.find((b) => b.id === id).name}</span>`;
const INK = { text: '#1f2333', muted: '#5c6378', grid: 'rgba(31,35,51,0.07)', surface: '#ffffff' };
Chart.defaults.font.family = "'IBM Plex Sans Thai', system-ui, sans-serif";
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

// ผลสลาก: ลอง /api/draws ก่อน (รวมงวดใหม่ที่ออกหลัง deploy) ถ้าไม่ได้ใช้ไฟล์ที่มากับเว็บ
async function loadDrawsData() {
  try {
    const res = await fetch('/api/draws', { signal: AbortSignal.timeout(8000) });
    if (res.ok) { const d = await res.json(); if (d.draws?.length) return d; }
  } catch { /* ใช้ไฟล์สำรองด้านล่าง */ }
  return fetch('/data/draws.json').then((r) => r.json());
}

export async function load() {
  const [d, bt, val] = await Promise.all([
    loadDrawsData(),
    ...['backtest', 'validation'].map((f) => fetch(`/data/${f}.json`).then((r) => r.json())),
  ]);
  return { draws: d.draws, updatedAt: d.updatedAt, backtest: bt, validation: val };
}

// ---------- hero ----------
export function renderHero(draws) {
  const last = draws.at(-1);
  $('#hero-lede').textContent =
    `ข้อมูล ${draws.length} งวด ตั้งแต่ ${fmtDate(draws[0].date)} ถึง ${fmtDate(last.date)} ` +
    `ตรวจสอบข้าม 2 แหล่ง พร้อมตรวจรางวัลย้อนหลังได้ทุกงวด`;
  const today = todayInThailand();
  const next = upcomingDraw(last.date, today);
  const daysLeft = Math.round((Date.parse(next) - Date.parse(today)) / 864e5);
  const countdown = daysLeft <= 0 ? 'ออกวันนี้' : `อีก ${daysLeft} วัน`;
  const stats = $('#hero-stats');
  if (stats) {
    stats.innerHTML = [
      [draws.length.toLocaleString('th-TH'), 'งวดย้อนหลัง 10 ปี'],
      [fmtDate(next).replace(/ \d{4}$/, ''), `งวดถัดไป · ${countdown}`],
      ['อัตโนมัติ', 'การอัปเดตผลรางวัล'],
    ].map(([v, l]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join('');
  }
  if ($('#footer-update')) $('#footer-update').textContent = `ผลล่าสุด งวด ${fmtDate(last.date)}`;
  if ($('#footer-year')) $('#footer-year').textContent = String(new Date().getFullYear() + 543);
  $('#latest').innerHTML = `
    <div class="latest-ribbon"><span class="live-dot"></span>ผลสลากงวดล่าสุด</div>
    <div class="date">${fmtDate(last.date)}</div>
    <div class="label">รางวัลที่ 1</div>
    <div class="first-prize">${last.first}</div>
    <div class="sub-prizes">
      <div><span>เลขหน้า 3 ตัว</span><b>${last.front3.join(' · ')}</b></div>
      <div><span>เลขท้าย 3 ตัว</span><b>${last.last3.join(' · ')}</b></div>
      <div><span>เลขท้าย 2 ตัว</span><b>${last.last2}</b></div>
    </div>
    <div class="latest-foot"><span>งวดถัดไป <b>${fmtDate(next)}</b></span><span class="pill">${countdown}</span></div>`;
}

// ---------- overview ----------
const KPI_ICON = {
  draws: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  parity: '<circle cx="8" cy="12" r="4.5"/><circle cx="16" cy="12" r="4.5"/>',
  range: '<path d="M12 4v16M6 10l6-6 6 6M6 14l6 6 6-6"/>',
  doubles: '<rect x="3.5" y="6" width="8" height="12" rx="2"/><rect x="12.5" y="6" width="8" height="12" rx="2"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  random: '<path d="M3 12h3l3-7 4 14 3-7h5"/>',
  payout: '<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.2a3 3 0 0 0-2.8-1.7c-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2a3.2 3.2 0 0 1-3-1.8M12 6v1.5M12 16.5V18"/>',
};
const kpiIcon = (k) => `<span class="k-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${KPI_ICON[k]}</svg></span>`;
// แถบสัดส่วน 2 ฝั่ง เช่น คี่ : คู่
const splitBar = (a, b, la, lb) => {
  const pa = Math.round((a / (a + b || 1)) * 100);
  return `<div class="k-split"><i style="width:${pa}%"></i></div><div class="k-split-l"><span>${la} ${pa}%</span><span>${lb} ${100 - pa}%</span></div>`;
};
// แถบเทียบค่าจริงกับค่าคาดหมาย
const vsBar = (actual, expected) => {
  const max = Math.max(actual, expected) * 1.15 || 1;
  return `<div class="k-vs"><i style="width:${(actual / max) * 100}%"></i><b style="left:${(expected / max) * 100}%" title="ค่าคาดหมาย"></b></div>`;
};

export function renderKpis(draws) {
  const s = summary(draws);
  const expDoubles = s.draws / 10;
  const expRepeat = (s.draws - 1) / 100;
  const tiles = [
    { k: 'draws', label: 'จำนวนงวดที่วิเคราะห์', value: s.draws.toLocaleString('th-TH'), foot: `${fmtDate(draws[0].date)} – ${fmtDate(draws.at(-1).date)} · ออกรางวัลเดือนละ 2 งวด`, feature: true },
    { k: 'parity', label: 'เลขท้าย 2 ตัว · คี่ : คู่', value: `${s.odd} : ${s.even}`, extra: splitBar(s.odd, s.even, 'คี่', 'คู่'), foot: 'ค่าคาดหมาย 50 : 50' },
    { k: 'range', label: 'เลขท้าย 2 ตัว · สูง : ต่ำ', value: `${s.high} : ${s.low}`, extra: splitBar(s.high, s.low, 'สูง', 'ต่ำ'), foot: 'เลขสูง = 50–99' },
    { k: 'doubles', label: 'เลขเบิ้ล (00, 11, …)', value: `${s.doubles} <small>งวด</small>`, extra: vsBar(s.doubles, expDoubles), foot: `ค่าคาดหมายประมาณ ${expDoubles.toFixed(0)} งวด` },
    { k: 'repeat', label: 'เลขท้าย 2 ตัวซ้ำงวดติดกัน', value: `${s.consecutiveRepeats} <small>ครั้ง</small>`, extra: vsBar(s.consecutiveRepeats, expRepeat), foot: `ค่าคาดหมายประมาณ ${expRepeat.toFixed(1)} ครั้ง` },
    { k: 'random', label: 'การทดสอบความสุ่ม (Chi-square)', value: `p = ${s.chiLast2.p.toFixed(2)}`, badge: s.chiLast2.p > 0.05 ? ['ok', 'กระจายตัวตามธรรมชาติ'] : ['warn', 'พบความเบี่ยงเบน'], foot: 'ทดสอบกับเลขท้าย 2 ตัวทั้งหมด' },
    { k: 'payout', label: 'อัตราการจ่ายคืนตามทฤษฎี', value: pct(theoreticalReturn(), 0), extra: `<div class="k-vs payout"><i style="width:${theoreticalReturn() * 100}%"></i></div>`, foot: `ของราคาสลากใบละ ${TICKET_PRICE} บาท` },
  ];
  $('#kpis').innerHTML = tiles.map((t) => `
    <div class="card kpi${t.feature ? ' kpi-feature' : ''}">
      <div class="k-top">${kpiIcon(t.k)}<span class="k-label">${t.label}</span></div>
      <div class="k-value">${t.value}</div>
      ${t.badge ? `<span class="k-badge ${t.badge[0]}">${t.badge[1]}</span>` : ''}
      ${t.extra ?? ''}
      <div class="k-foot">${t.foot}</div>
    </div>`).join('');
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
    ['ออกบ่อยที่สุด', top(freq, 1), (n) => `${freq[n]} ครั้ง`],
    ['ออกน้อยที่สุด', top(freq, -1), (n) => `${freq[n]} ครั้ง`],
    ['ไม่ออกนานที่สุด', top(gap, 1), (n) => (gap[n] > draws.length ? 'ไม่เคยออก' : `${gap[n]} งวด`)],
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
      ? `สีเข้ม = ออกบ่อย · ค่าคาดหมายเฉลี่ย ${expect} ครั้ง/เลข · กรอบสว่าง = งวดล่าสุด · ช่วงจริง ${min}–${max} ครั้ง`
      : `สีเข้ม = ไม่ออกมานาน · กรอบสว่าง = งวดล่าสุด`;
    $('#heat-metric').style.display = '';
  } else {
    // 3 ตัว: 1,000 เลขมากเกินแผนที่ → แสดงความถี่หลักต่อตำแหน่งแทน
    $('#heat-metric').style.display = 'none';
    $('#heat-title').textContent = `${game.label}: หลักต่อตำแหน่ง`;
    renderPosMap($('#heatmap'), positional(draws, game), ['หลักร้อย', 'หลักสิบ', 'หลักหน่วย']);
    $('#heat-note').textContent = `ออกงวดละ ${game.perDraw} เลข · ค่าคาดหมายเฉลี่ย ${(draws.length * game.perDraw / 1000).toFixed(2)} ครั้ง/เลข จึงต้องดูระดับหลักแทน`;
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

// ---------- สถิติหวยแยกตามหลัก (2 ตัวบน / 2 ตัวล่าง / 3 ตัวบน) ----------
export function renderPlaces(draws) {
  const range = `${fmtDate(draws[0].date)} – ${fmtDate(draws.at(-1).date)} (${draws.length} งวด)`;
  $('#places-list').innerHTML = PLACE_STATS.map((st) => {
    const { rows, total } = digitsByPlace(draws, st.value);
    const cells = (counts, cls = '') => {
      const max = Math.max(...counts), min = Math.min(...counts);
      return counts.map((c) => {
        const a = 0.04 + 0.5 * ((c - min) / (max - min || 1));
        return `<td class="num ${cls}${c === max ? ' top' : ''}" style="background:rgba(91,108,240,${a.toFixed(3)})">${c}</td>`;
      }).join('');
    };
    return `
      <div class="card place-card">
        <h3>${st.label}</h3>
        <p class="note">${st.note} · ${range}</p>
        <div class="table-wrap"><table class="table place-table">
          <thead><tr><th>หลัก</th>${[...Array(10).keys()].map((d) => `<th><span class="w">เลข </span>${d}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.map((r) => `<tr><th scope="row">${r.label}</th>${cells(r.counts)}</tr>`).join('')}
            <tr class="sum"><th scope="row">รวม</th>${cells(total)}</tr>
          </tbody>
        </table></div>
      </div>`;
  }).join('');
}

// ---------- lottery 6 digits ----------
export function renderLottery(draws) {
  const s = summary(draws);
  renderPosMap($('#posmap'), positional(draws, GAMES.first), ['แสนหลัก', 'หมื่น', 'พัน', 'ร้อย', 'สิบ', 'หน่วย']);
  const ps = s.chiFirstPositions.map((c) => c.p);
  $('#pos-note').textContent = `Chi-square แต่ละตำแหน่ง p = ${ps.map((p) => p.toFixed(2)).join(', ')} ` +
    `(p > 0.05 = กระจายตัวสม่ำเสมอตามการสุ่ม) · ค่าคาดหมาย ${(draws.length / 10).toFixed(1)} ครั้งต่อช่อง`;

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
  $('#sum-note').textContent = `ค่าเฉลี่ยจริง ${s.meanDigitSum.toFixed(2)} · ค่าคาดหมายทางทฤษฎี 27.00 — รูประฆังคว่ำเกิดจากการบวกเลขสุ่ม ไม่ใช่รูปแบบที่ทำนายได้`;
}

// ---------- bot ----------
const botState = { id: 'adaptive' };

export function renderBots(draws) {
  $('#bot-list').innerHTML = BOTS.map((b) => `
    <button class="bot-card${b.id === botState.id ? ' on' : ''}" data-id="${b.id}">
      ${botIcon(b.id, BOT_COLOR[b.id], 'lg')}<b>${b.name}</b><small>${b.desc}</small>
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
    `<div class="bot-meta"><span class="bot-tag">${botLabel(bot.id, 'sm')}</span> · ${game.label} · โหมด${mode === 'analyze' ? 'วิเคราะห์' : 'สุ่ม'} · seed ${seed} · สำหรับงวด ${fmtDate(next)}</div>` +
    adaptiveNote(bot.id, draws, game) +
    picks.map((n, i) => `<div class="pick" style="animation-delay:${i * 60}ms"><span class="num">${n}</span><span class="why">${esc(explain(n, draws, game))}</span></div>`).join('') +
    `<div class="bot-meta">ความน่าจะเป็นต่อตัวเลขเท่ากันทุกสูตร โปรดดูหลักฐานประกอบในส่วนผลทดสอบย้อนหลัง</div>`;
}

function adaptiveNote(botId, draws, game) {
  if (botId !== 'adaptive') return '';
  const rep = adaptiveReport(draws, game);
  if (!rep.length) return '';
  const name = (id) => BOTS.find((b) => b.id === id);
  return `<div class="bot-meta">สูตรที่เลือกใช้ในงวดนี้ <b class="bot-tag">${botLabel(rep[0].id, 'sm')}</b> — ` +
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
    : `<div><span>ความน่าจะเป็นงวดถัดไป</span><b>${pct(g.probability, 1)}</b><small>1 ใน ${g.oneIn.toLocaleString('th-TH')} · เท่ากันทุกตัวเลข</small></div>`;
  const histTiles = h ? `
    <div><span>ออกรางวัลใน ${r.draws} งวด</span><b>${h.count} ครั้ง</b><small>ค่าคาดหมาย ${h.expected.toFixed(1)} ครั้ง</small></div>
    <div><span>ออกรางวัลครั้งล่าสุด</span><b>${h.lastSeen ? fmtDate(h.lastSeen, true) : 'ไม่เคยออกรางวัล'}</b><small>${h.gap ? `${h.gap} งวดก่อน` : 'ในช่วง 10 ปี'}</small></div>` : '';
  const b = g.buy;
  const buyTile = `<div><span>ผลลัพธ์หากซื้อทุกงวด (${b.draws} งวด)</span><b class="${b.profit >= 0 ? 'pos' : 'neg'}">${baht(b.profit)}</b><small>ต้นทุน ${baht(b.cost)} · ถูก ${b.wins} ครั้ง · ROI ${pct(b.roi)}</small></div>`;
  const parts = g.key === 'first' && r.parts.length
    ? `<div class="check-tiles">${r.parts.map((p) => `<div><span>${p.label} ${p.number}</span><b>${p.count} ครั้ง</b><small>ค่าคาดหมาย ${p.expected.toFixed(1)} · ${p.lastSeen ? `ล่าสุด ${fmtDate(p.lastSeen, true)}` : 'ไม่เคยออก'}</small></div>`).join('')}</div>` : '';
  const bars = g.bots.map((x) => `
    <div class="rank-bar"><span class="bot-tag">${botLabel(x.id, 'sm')}</span><span class="track"><i style="width:${(x.percentile * 100).toFixed(0)}%;background:${BOT_COLOR[x.id]}"></i></span><em>${(x.percentile * 100).toFixed(0)}</em></div>`).join('');
  return `<div class="check-game">
    <div class="check-head"><span class="num">${r.number}</span><span class="tag">${g.label}</span></div>
    <div class="check-tiles">${odds}${histTiles}${buyTile}</div>
    ${parts}
    <div><h3>คะแนนจากแต่ละสูตรวิเคราะห์ <small class="note">(0–100 · 100 = คะแนนสูงสุด · เส้นกึ่งกลาง = 50)</small></h3><div class="rank-bars">${bars}</div></div>
  </div>`;
}

function checkVerdict(r) {
  const g = r.games[0];
  const avg = r.games.reduce((s, x) => s + x.avgBotPercentile, 0) / r.games.length;
  const h = g.history;
  const skew = h && h.pMoreThanChance < 0.05 ? `ออกบ่อยกว่าค่าเฉลี่ย (p = ${h.pMoreThanChance.toFixed(3)}) แต่เมื่อดูเลขทั้งหมด 100–1,000 ตัว ย่อมมีบางเลขออกบ่อยโดยบังเอิญเสมอ` : 'ความถี่ในอดีตอยู่ในเกณฑ์ปกติของการสุ่ม';
  return `<div class="verdict"><b>สรุปผลตัวเลข ${r.number}:</b> คะแนนเฉลี่ยจากทุกสูตร ${(avg * 100).toFixed(0)}/100 · ${skew} — ` +
    `ความน่าจะเป็นในงวดถัดไปยังคงเป็น <b>${g.key === 'first' ? '1 ใน 1,000,000 สำหรับรางวัลที่ 1' : `${pct(g.probability, 1)} เท่ากับทุกเลข`}</b> เนื่องจากการออกรางวัลแต่ละงวดเป็นอิสระต่อกัน</div>`;
}

// ---------- backtest ----------
const bt = { game: 'last2', mode: 'analyze', chart: null, cache: {} };
let worker;

function precomputed(report, gameKey, mode) {
  const g = report.games[gameKey];
  return { baseline: g.baseline, bots: g.bots.filter((b) => b.mode === mode || b.botId === 'random'), runs: report.settings.mcRuns };
}

export function renderBacktest(draws, report) {
  $('#bt-sub').textContent = `ทดสอบย้อนหลังแบบ Walk-forward โดยแต่ละงวดใช้เฉพาะข้อมูลก่อนหน้างวดนั้น (เริ่มหลังช่วงเตรียมข้อมูล ${report.settings.warmup} งวด) ` +
    `คำนวณจากราคาสลากใบละ ${TICKET_PRICE} บาทและเงินรางวัลตามประกาศของสำนักงานสลากฯ แล้วเปรียบเทียบกับการสุ่มเลขทั่วไป`;
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
      ctx.font = '700 34px "Playfair Display", serif'; ctx.fillText(String(totalHits), x, y + 4);
      ctx.fillStyle = INK.muted; ctx.font = '500 13px "IBM Plex Sans Thai", sans-serif'; ctx.fillText('ครั้งที่ตรงกับผลรางวัล', x, y + 26);
      ctx.restore();
    },
  };
  // ตัวเลขบนชิ้นโดนัท: จำนวนครั้ง + % (ชิ้นเล็กเกินไปไม่ใส่ กันตัวเลขทับกัน)
  const sliceLabels = {
    id: 'sliceLabels',
    afterDatasetsDraw(c) {
      const { ctx } = c;
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 3;
      c.getDatasetMeta(0).data.forEach((arc, i) => {
        const share = byHits[i].hits / (totalHits || 1);
        if (share < 0.045) return;
        const { x, y } = arc.tooltipPosition();
        ctx.font = '700 15px "IBM Plex Sans Thai", sans-serif'; ctx.fillText(String(byHits[i].hits), x, y - 7);
        ctx.font = '500 11px "IBM Plex Sans Thai", sans-serif'; ctx.fillText(`${Math.round(share * 100)}%`, x, y + 8);
      });
      ctx.restore();
    },
  };
  const opts = {
    maintainAspectRatio: false, cutout: '58%', animation: { duration: 400 },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (i) => {
            const b = byHits[i.dataIndex];
            return ` ${nameOf(b.botId).name}: ${b.hits} ครั้ง (ค่าคาดหมาย ${b.expectedHits.toFixed(1)})`;
          },
        },
      },
    },
  };
  const labels = byHits.map((b) => nameOf(b.botId).name);
  if (bt.chart) bt.chart.destroy();
  bt.chart = new Chart($('#equity-chart'), { type: 'doughnut', data: { labels, datasets: ds }, options: opts, plugins: [centerText, sliceLabels] });
  // แถบสรุปเหนือโดนัท
  const bestHits = byHits[0];
  const bestRoi = [...bots].sort((a, b) => b.roi - a.roi)[0];
  const randomBot = bots.find((b) => b.botId === 'random');
  const beatRandom = bots.filter((b) => b.botId !== 'random' && randomBot && b.hits > randomBot.hits).length;
  const avgHits = totalHits / (bots.length || 1);
  if ($('#bt-stats')) {
    $('#bt-stats').innerHTML = [
      ['ถูกรางวัลบ่อยที่สุด', `<span class="bot-tag">${botLabel(bestHits.botId, 'sm')}</span>`, `${bestHits.hits} ครั้ง จาก ${bestHits.draws} งวด`],
      ['ค่าเฉลี่ยต่อสูตร', `${avgHits.toFixed(1)} ครั้ง`, `ค่าคาดหมายกรณีสุ่ม ${bots[0].expectedHits.toFixed(1)} ครั้ง`],
      ['ผลตอบแทน (ROI) สูงสุด', pct(bestRoi.roi), `${nameOf(bestRoi.botId).name}`],
      ['สูตรที่ดีกว่าการสุ่ม', `${beatRandom} / ${bots.length - 1} สูตร`, randomBot ? `การสุ่มเลขทั่วไปถูก ${randomBot.hits} ครั้ง` : ''],
    ].map(([l, v, f], i) => `<div class="bt-stat${i === 0 ? ' feature' : ''}"><span>${l}</span><b>${v}</b><small>${f}</small></div>`).join('');
  }
  const maxHits = Math.max(...byHits.map((b) => b.hits), 1);
  $('#bt-legend').innerHTML = byHits.map((b) => {
    const share = Math.round((b.hits / (totalHits || 1)) * 100);
    return `
    <li>
      <span class="lg-name">${botLabel(b.botId, 'sm')}</span>
      <span class="lg-val"><b>${b.hits}</b> ครั้ง <small>${share}%</small></span>
      <span class="lg-bar"><i style="width:${(b.hits / maxHits) * 100}%;background:${BOT_COLOR[b.botId]}"></i></span>
    </li>`;
  }).join('');

  const sorted = [...bots].sort((a, b) => b.profit - a.profit);
  $('#bt-table').innerHTML = `<thead><tr><th>สูตรวิเคราะห์</th><th>ถูกรางวัล / ค่าคาดหมาย</th><th>p-value</th><th>ต้นทุนรวม</th><th>เงินรางวัลรวม</th><th>กำไร (ขาดทุน)</th><th>ROI</th><th>เปรียบเทียบกับการสุ่ม</th></tr></thead><tbody>` +
    sorted.map((b) => {
      const bot = BOTS.find((x) => x.id === b.botId);
      return `<tr>
        <td><span class="bot-tag">${botLabel(b.botId, 'sm')}</span></td>
        <td class="num">${b.hits} / ${b.expectedHits.toFixed(1)}</td>
        <td class="num">${b.pValue.toFixed(3)}</td>
        <td class="num">${baht(b.cost)}</td>
        <td class="num">${baht(b.revenue)}</td>
        <td class="num ${b.profit >= 0 ? 'pos' : 'neg'}">${baht(b.profit)}</td>
        <td class="num ${b.roi >= 0 ? 'pos' : 'neg'}">${pct(b.roi)}</td>
        <td><span class="luck">${pct(b.luckPercentile, 0)}</span><span class="bar" title="ตำแหน่งเมื่อเปรียบเทียบกับการสุ่ม ${res.runs} รอบ (แถบ = ช่วง 5–95%)"><i style="left:${(b.luckPercentile * 100).toFixed(0)}%"></i></span></td>
      </tr>`;
    }).join('') + '</tbody>';

  const best = sorted[0];
  const bestBot = BOTS.find((x) => x.id === best.botId);
  const sig = bots.filter((b) => b.pValue < 0.05 / bots.length);
  $('#bt-verdict').innerHTML =
    `<b>สรุปผล ${game.label} (${k} ตัวเลขต่องวด · ${best.draws} งวด):</b> ` +
    `สูตรที่ให้ผลดีที่สุดคือ <b>${bestBot.name}</b> ROI ${pct(best.roi)} — ` +
    (best.profit < 0 ? 'ผลตอบแทนยังติดลบ และ' : 'แม้มีกำไรในช่วงเวลานี้ แต่') +
    ` ${sig.length ? `มี ${sig.length} สูตรที่ผ่านเกณฑ์นัยสำคัญทางสถิติ (p < ${(0.05 / bots.length).toFixed(3)})` : 'ไม่มีสูตรใดถูกรางวัลบ่อยกว่าการสุ่มอย่างมีนัยสำคัญทางสถิติ (Bonferroni p < ' + (0.05 / bots.length).toFixed(3) + ')'} ` +
    ` · ช่วง ROI ของการสุ่มเลขทั่วไป (5–95%) อยู่ระหว่าง ${pct(res.baseline.roi.p5)} ถึง ${pct(res.baseline.roi.p95)} · ` +
    (bots.every((b) => b.luckPercentile > 0.05 && b.luckPercentile < 0.95)
      ? 'ผลลัพธ์ของทุกสูตรอยู่ในช่วงที่อธิบายได้ด้วยความบังเอิญ'
      : 'บางสูตรอยู่นอกช่วง 5–95% ซึ่งเป็นเรื่องปกติเมื่อทดสอบหลายสูตรพร้อมกัน');
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
    $('#hist-more').textContent = `แสดงเพิ่มเติม (${list.length - limit} งวด)`;
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
  // แผงผลของงวดที่เลือก (แสดงทันที ไม่ต้องรอกดตรวจ)
  const showPanel = () => {
    const d = draws.find((x) => x.date === select.value) ?? draws.at(-1);
    $('#ticket-panel').innerHTML = `
      <div class="dp-top"><span>ผลสลากงวด</span><b>${fmtDate(d.date)}</b></div>
      <div class="dp-label">รางวัลที่ 1 · ${baht(PRIZES.first.amount)}</div>
      <div class="dp-first">${d.first}</div>
      <div class="dp-grid">
        <div><span>เลขหน้า 3 ตัว</span><b>${d.front3.join(' ')}</b></div>
        <div><span>เลขท้าย 3 ตัว</span><b>${d.last3.join(' ')}</b></div>
        <div><span>เลขท้าย 2 ตัว</span><b>${d.last2}</b></div>
      </div>
      <div class="dp-near"><span>ข้างเคียงรางวัลที่ 1</span><b>${d.near.join(' · ')}</b></div>`;
  };
  select.addEventListener('change', showPanel);
  showPanel();

  const box = $('#ticket-inputs');
  const addBtn = $('#ticket-add');
  const inputs = () => [...box.querySelectorAll('input')];
  const updateCount = () => {
    const filled = inputs().filter((x) => x.value.length === 6).length;
    $('#ticket-count').textContent = `กรอกครบ ${filled}/${inputs().length} ใบ`;
  };
  const addInput = (focus = false) => {
    const n = box.children.length + 1;
    if (n > MAX_TICKETS) return;
    const wrap = document.createElement('label');
    wrap.className = 'ticket-slot';
    wrap.innerHTML = `<span class="slot-no">${n}</span>`;
    const input = document.createElement('input');
    Object.assign(input, { type: 'text', inputMode: 'numeric', maxLength: 6, autocomplete: 'off', placeholder: `กรอกเลขสลาก ใบที่ ${n}` });
    input.className = 'ticket-input';
    input.setAttribute('aria-label', `เลขสลาก ใบที่ ${n}`);
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 6);
      wrap.classList.toggle('done', input.value.length === 6);
      updateCount();
    });
    wrap.append(input);
    box.append(wrap);
    addBtn.hidden = box.children.length >= MAX_TICKETS;
    updateCount();
    if (focus) input.focus();
  };
  for (let i = 0; i < 5; i++) addInput();
  addBtn.addEventListener('click', () => addInput(true));
  $('#ticket-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const out = $('#ticket-out');
    const tickets = parseTickets(inputs().map((x) => x.value).join(' '));
    if (!tickets.length) { out.innerHTML = `<p class="note">กรอกเลขสลาก 6 หลักอย่างน้อย 1 ใบ (สูงสุด ${MAX_TICKETS} ใบ)</p>`; return; }
    const r = checkTickets(draws, tickets, select.value);
    if (r.error) { out.innerHTML = `<p class="note">${esc(r.error)}</p>`; return; }
    const wins = r.results.filter((x) => x.amount).length;
    out.innerHTML = `
      <div class="ticket-summary ${r.total ? 'win' : ''}">
        <div><span>งวด</span><b>${fmtDate(r.draw.date)}</b></div>
        <div><span>ตรวจทั้งหมด</span><b>${r.results.length} ใบ</b></div>
        <div><span>ถูกรางวัล</span><b>${wins} ใบ</b></div>
        <div><span>เงินรางวัลรวม</span><b>${r.total ? baht(r.total) : '—'}</b></div>
      </div>
      <div class="ticket-list">${r.results.map((x) => `
        <div class="ticket ${x.amount ? 'win' : ''}">
          <span class="num">${x.number}</span>
          <span class="res">${x.amount ? `ถูกรางวัล · ${x.prizes.join(' + ')}` : 'ไม่ถูกรางวัล'}</span>
          <span class="amt">${x.amount ? baht(x.amount) : ''}</span>
        </div>`).join('')}</div>
      ${r.partial ? '<p class="note">งวดนี้ข้อมูลรางวัลที่ 4–5 ไม่ครบ ตรวจได้เฉพาะรางวัลหลัก</p>' : ''}`;
    out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

// ไฮไลต์เมนูตามส่วนที่กำลังดู (ใช้ทั้งเมนูบนหน้าเว็บและแถบข้างหน้า Admin)
export function scrollSpy(navSelector) {
  const links = [...document.querySelectorAll(`${navSelector} a[href^="#"]`)];
  const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const sections = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean);
  if (!sections.length || !('IntersectionObserver' in window)) return;
  const visible = new Set();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) (e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id));
    const current = sections.find((s) => visible.has(s.id));
    if (current) links.forEach((a) => a.classList.toggle('active', a === byId.get(current.id)));
  }, { rootMargin: '-35% 0px -55% 0px' });
  sections.forEach((s) => io.observe(s));
}
