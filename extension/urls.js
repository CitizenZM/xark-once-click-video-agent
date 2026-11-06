// Pure helper: pick downloadable video-page URLs out of every link on a page.
const PATTERNS = [
  /^https?:\/\/(www\.)?tiktok\.com\/@[\w.]+\/video\/\d+/,
  /^https?:\/\/(www\.)?instagram\.com\/(reel|reels|p|tv)\/[\w-]+/,
  /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
  /^https?:\/\/(www\.)?youtube\.com\/watch\?(?:.*&)?v=[\w-]+/,
  /^https?:\/\/(www\.)?(x|twitter)\.com\/\w+\/status\/\d+/,
];

// Same video, different URL shapes (Instagram /p/ vs /reel/, tracking params) -> one key.
export function dedupeKey(url) {
  const ig = /instagram\.com\/(?:reel|reels|p|tv)\/([\w-]+)/.exec(url);
  if (ig) return "ig:" + ig[1];
  const tt = /tiktok\.com\/@[\w.]+\/video\/(\d+)/.exec(url);
  if (tt) return "tt:" + tt[1];
  const yt = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([\w-]+)/.exec(url);
  if (yt) return "yt:" + yt[1];
  return url.replace(/[?#].*$/, "").replace(/\/$/, "");
}

export function videoUrls(hrefs, limit = 50) {
  const seen = new Set();
  for (const h of hrefs) {
    let u;
    try { u = new URL(h); } catch { continue; }
    const hit = PATTERNS.find((p) => p.test(u.href));
    if (!hit) continue;
    // keep ?v= for YouTube watch URLs, drop tracking params everywhere else
    seen.add(u.pathname === "/watch" ? `${u.origin}/watch?v=${u.searchParams.get("v")}` : u.origin + u.pathname.replace(/\/$/, ""));
    if (seen.size >= limit) break;
  }
  return [...seen];
}
