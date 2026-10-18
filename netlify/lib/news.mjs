// ดึงข่าวเด่นของไทยจาก Google News (RSS สาธารณะ ไม่ต้องใช้ key) · แคชในหน่วยความจำ 10 นาที
import { parseRss } from '../../src/lib/news-numbers.js';

export const NEWS_FEED = 'https://news.google.com/rss?hl=th&gl=TH&ceid=TH:th';
const TTL = 10 * 60 * 1000;
let cache = null;

export async function loadNews(now = Date.now()) {
  if (cache && now - cache.at < TTL) return cache.items;
  const res = await fetch(NEWS_FEED, { signal: AbortSignal.timeout(5000), headers: { 'user-agent': 'Mozilla/5.0 LOTTO-Bot' } });
  if (!res.ok) throw new Error(`news feed ${res.status}`);
  const items = parseRss(await res.text());
  if (items.length) cache = { at: now, items };
  return items;
}
