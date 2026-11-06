// Pure helper: pick downloadable video-page URLs out of every link on a page.
const PATTERNS = [
  /^https?:\/\/(www\.)?tiktok\.com\/@[\w.]+\/video\/\d+/,
  /^https?:\/\/(www\.)?instagram\.com\/(reel|reels|p|tv)\/[\w-]+/,
  /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
  /^https?:\/\/(www\.)?youtube\.com\/watch\?(?:.*&)?v=[\w-]+/,
  /^https?:\/\/(www\.)?(x|twitter)\.com\/\w+\/status\/\d+/,
];

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
