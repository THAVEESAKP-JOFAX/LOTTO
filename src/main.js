// หน้าเว็บปกติ: สถิติ + ตรวจรางวัล · ส่วน Bot / ทดสอบเลข / Backtest แสดงเมื่อเปิดจากหน้า Admin
import './styles.css';
import {
  $, load, renderHero, renderKpis, renderHuay, renderLottery, renderHistory, renderTicket,
  renderBots, runBot, renderChecker, renderBacktest, segmented, bindSeg, huay,
} from './app.js';
import { GAMES } from './lib/analysis.js';

async function publicSettings() {
  try {
    const res = await fetch('/api/settings');
    return res.ok ? (await res.json()).public ?? {} : {};
  } catch {
    return {};
  }
}

Promise.all([load(), publicSettings()]).then(([{ draws, backtest, validation }, show]) => {
  renderHero(draws, validation);
  renderTicket(draws);
  renderKpis(draws);
  segmented($('#huay-game'), ['last2', 'front3', 'last3'].map((k) => [k, GAMES[k].label]), huay.game, (v) => { huay.game = v; renderHuay(draws); });
  bindSeg($('#heat-metric'), (v) => { huay.metric = v; renderHuay(draws); });
  renderHuay(draws);
  renderLottery(draws);
  renderHistory(draws);

  const reveal = (key) => {
    $(`#${key}`).hidden = false;
    document.querySelector(`nav [data-opt="${key}"]`).hidden = false;
  };
  if (show.bot) { reveal('bot'); renderBots(draws); runBot(draws); }
  if (show.check) { reveal('check'); renderChecker(draws); }
  if (show.backtest) { reveal('backtest'); renderBacktest(draws, backtest); }
}).catch((err) => {
  $('#hero-lede').textContent = `โหลดข้อมูลไม่สำเร็จ: ${err.message}`;
});
