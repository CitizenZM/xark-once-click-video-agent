// Pure helpers: which links are downloadable videos, in one canonical form each.
// Keep in sync with detect.js (a test checks both lists are identical).
export const PATTERNS = [
  /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]*\/video\/\d+/,
  /^https?:\/\/(www\.)?instagram\.com\/([\w.]+\/)?(reel|reels|p|tv)\/[\w-]+/, // Instagram also uses /<user>/reel/<id>/
  /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
  /^https?:\/\/(www\.)?youtube\.com\/watch\?(?:.*&)?v=[\w-]+/,
  /^https?:\/\/(www\.)?(x|twitter)\.com\/\w+\/status\/\d+/,
];

// Same video, different URL shapes (Instagram /p/ vs /reel/ vs /<user>/reel/, tracking params) -> one key.
export function dedupeKey(url) {
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
