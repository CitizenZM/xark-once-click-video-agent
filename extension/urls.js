// Pure helpers: which links are downloadable videos, in one canonical form each.
// Keep in sync with detect.js (a test checks both lists are identical).
export const PATTERNS = [
  /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]*\/video\/\d+/,
  /^https?:\/\/(www\.)?instagram\.com\/([\w.]+\/)?(reel|reels|p|tv)\/(?!audio\/)[\w-]+/, // Instagram also uses /<user>/reel/<id>/
  /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
  /^https?:\/\/(www\.)?youtube\.com\/watch\?(?:.*&)?v=[\w-]+/,
  /^https?:\/\/(www\.)?(x|twitter)\.com\/\w+\/status\/\d+/,
  /^https?:\/\/(www\.)?instagram\.com\/stories\/[\w.]+\/\d+/,
  /^https?:\/\/(www\.)?facebook\.com\/ads\/library\/\?(?:.*&)?id=\d+/,
  /^https?:\/\/ads\.tiktok\.com\/business\/creativecenter\/topads\/\d+/,
];

// Same video, different URL shapes (Instagram /p/ vs /reel/ vs /<user>/reel/, tracking params) -> one key.
export function dedupeKey(url) {
  const st = /instagram\.com\/stories\/[\w.]+\/(\d+)/.exec(url);
  if (st) return "igs:" + st[1];
  const fb = /facebook\.com\/ads\/library\/\?(?:.*&)?id=(\d+)/.exec(url);
  if (fb) return "fbad:" + fb[1];
  const cc = /ads\.tiktok\.com\/business\/creativecenter\/topads\/(\d+)/.exec(url);
  if (cc) return "ttcc:" + cc[1];
  const ig = /instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/([\w-]+)/.exec(url);
  if (ig) return "ig:" + ig[1];
  const tt = /tiktok\.com\/@[\w.-]*\/video\/(\d+)/.exec(url);
  if (tt) return "tt:" + tt[1];
  const yt = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([\w-]+)/.exec(url);
  if (yt) return "yt:" + yt[1];
  return url.replace(/[?#].*$/, "").replace(/\/$/, "");
}

// One canonical URL per video (engine accepts all of these forms).
export function canonical(href) {
  let u;
  try { u = new URL(href); } catch { return null; }
  if (!PATTERNS.some((p) => p.test(u.href))) return null;
  if (/(^|\.)facebook\.com$/.test(u.hostname)) return `https://www.facebook.com/ads/library/?id=${u.searchParams.get("id")}`;
  const cc = /^\/business\/creativecenter\/topads\/(\d+)/.exec(u.pathname);
  if (u.hostname === "ads.tiktok.com" && cc) return `https://ads.tiktok.com/business/creativecenter/topads/${cc[1]}`;
  const st = /^\/stories\/([\w.]+)\/(\d+)/.exec(u.pathname);
  if (/instagram\.com$/.test(u.hostname) && st) return `https://www.instagram.com/stories/${st[1]}/${st[2]}`;
  if (u.pathname === "/watch") return `${u.origin}/watch?v=${u.searchParams.get("v")}`;
  const ig = /^\/(?:[\w.]+\/)?(reel|reels|p|tv)\/([\w-]+)/.exec(u.pathname);
  if (/instagram\.com$/.test(u.hostname) && ig) return `https://www.instagram.com/${ig[1] === "reels" ? "reel" : ig[1]}/${ig[2]}`;
  return u.origin + u.pathname.replace(/\/$/, "");
}

export function videoUrls(hrefs, limit = 50) {
  const seen = new Map();
  for (const h of hrefs) {
    const c = canonical(h);
    if (c && !seen.has(dedupeKey(c))) seen.set(dedupeKey(c), c);
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

// Page view counts ("451.3K", "6.2M", "1.2万") -> number. detect.js carries a copy of these two (a test checks parity).
const UNIT = { k: 1e3, m: 1e6, b: 1e9, "万": 1e4, "亿": 1e8 };
export const parseCount = (text) => {
  const m = /^([\d][\d,]*(?:\.\d+)?)\s*([kKmMbB万亿])?(?:\s*views?)?$/i.exec(String(text == null ? "" : text).trim());
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * (m[2] ? UNIT[m[2].toLowerCase()] : 1)) : null;
};
// views[] (number|null) -> per item { rank (1 = most views, ties share a rank, null without views), multiple (views / median), outlier (multiple >= 2) }
export const outlierFlags = (views) => {
  const has = views.filter((v) => v > 0).sort((a, b) => b - a);
  const mid = has.length >> 1, median = has.length ? (has.length % 2 ? has[mid] : (has[mid - 1] + has[mid]) / 2) : 0;
  return views.map((v) => {
    if (!(v > 0)) return { rank: null, multiple: null, outlier: false };
    const multiple = v / median;
    return { rank: has.indexOf(v) + 1, multiple, outlier: has.length >= 4 && multiple >= 2 };
  });
};
