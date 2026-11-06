// Pure analytics over the download library. Library item:
// {id,title,uploader,uploader_id,platform,url,duration,view_count,like_count,comment_count,tags,description,upload_date,at,file}

const count = (arr) => {
  const m = new Map();
  for (const k of arr) if (k) m.set(k, (m.get(k) || 0) + 1);
  return [...m].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n || a.k.localeCompare(b.k));
};
const eng = (v) => (v.view_count > 0 && v.like_count >= 0 ? v.like_count / v.view_count : null);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const hashtagsOf = (v) => [
  ...new Set([...(v.tags || []).map((t) => String(t).toLowerCase().replace(/^#/, "")),
    ...[...String(v.description || "").matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1].toLowerCase())]),
];
const bucketOf = (d) => (d == null ? "unknown" : d < 15 ? "<15s" : d < 30 ? "15-30s" : d < 60 ? "30-60s" : "60s+");
const BUCKETS = ["<15s", "15-30s", "30-60s", "60s+"];
const creatorKey = (v) => v.uploader_id || v.uploader || "unknown";
const day = (t) => new Date(t).toISOString().slice(0, 10);

export function analyze(lib) {
  const total = lib.length;
  const byPlatform = count(lib.map((v) => v.platform || "Other"));
  const creators = count(lib.map(creatorKey)).map((c) => {
    const vs = lib.filter((v) => creatorKey(v) === c.k);
    return { ...c, views: vs.reduce((a, v) => a + (v.view_count || 0), 0), avgEng: avg(vs.map(eng).filter((e) => e != null)) };
  });
  const hashtags = count(lib.flatMap(hashtagsOf));
  const buckets = BUCKETS.map((k) => {
    const vs = lib.filter((v) => bucketOf(v.duration) === k);
    return { k, n: vs.length, avgEng: avg(vs.map(eng).filter((e) => e != null)) };
  });
  const perDay = count(lib.map((v) => day(v.at))).sort((a, b) => a.k.localeCompare(b.k));
  const topVideos = [...lib].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 5);
  const engs = lib.map(eng).filter((e) => e != null);
  const headlines = [];
  if (total) {
    const p = byPlatform[0];
    headlines.push(`${Math.round((p.n / total) * 100)}% of your references come from ${p.k}.`);
    const b = [...buckets].sort((a, c) => c.n - a.n)[0];
    if (b.n) headlines.push(`Most saved videos run ${b.k} (${b.n} of ${total}).`);
    const best = buckets.filter((x) => x.avgEng != null).sort((a, c) => c.avgEng - a.avgEng)[0];
    if (best && buckets.filter((x) => x.avgEng != null).length > 1)
      headlines.push(`${best.k} videos have the highest like rate (${(best.avgEng * 100).toFixed(1)}%).`);
    if (creators[0] && creators[0].n > 1) headlines.push(`You saved ${creators[0].n} videos from ${creators[0].k}: worth studying their format.`);
  }
  return { total, creatorsCount: creators.length, byPlatform, creators, hashtags, buckets, perDay, topVideos,
    avgEngagement: avg(engs), totalViews: lib.reduce((a, v) => a + (v.view_count || 0), 0), headlines };
}

const PROFILE = {
  TikTok: (id) => `https://www.tiktok.com/@${id.replace(/^@/, "")}`,
  Instagram: (id) => `https://www.instagram.com/${id.replace(/^@/, "")}/`,
  Youtube: (id) => `https://www.youtube.com/${id.startsWith("@") ? id : "@" + id}`,
};
const TAG = {
  TikTok: (t) => `https://www.tiktok.com/tag/${encodeURIComponent(t)}`,
  Instagram: (t) => `https://www.instagram.com/explore/tags/${encodeURIComponent(t)}/`,
};
// Static, stable public ad-research libraries (not derived from the user's data).
export const AD_CHANNELS = [
  { name: "TikTok Creative Center: Top Ads", url: "https://ads.tiktok.com/business/creativecenter/", why: "Best-performing TikTok ads by industry, region and objective." },
  { name: "TikTok Commercial Content Library", url: "https://library.tiktok.com/ads", why: "Searchable archive of ads running on TikTok." },
  { name: "Meta Ad Library", url: "https://www.facebook.com/ads/library/", why: "Every active Facebook and Instagram ad; long-running ads are a winner signal." },
  { name: "Google Ads Transparency Center", url: "https://adstransparency.google.com/", why: "See what any advertiser runs on Search, YouTube and Display." },
];

// Recommendations come only from the user's own library: no invented accounts.
export function recommend(lib) {
  const a = analyze(lib);
  const known = new Set(lib.map((v) => creatorKey(v).toLowerCase().replace(/^@/, "")));
  const creators = a.creators
    .map((c) => {
      const v = lib.find((x) => creatorKey(x) === c.k);
      const url = PROFILE[v.platform] && v.uploader_id ? PROFILE[v.platform](v.uploader_id) : null;
      return { name: c.k, platform: v.platform, saved: c.n, avgEng: c.avgEng, url,
        basis: `${c.n} saved video${c.n > 1 ? "s" : ""}${c.avgEng != null ? `, ${(c.avgEng * 100).toFixed(1)}% like rate` : ""}` };
    })
    .slice(0, 8);
  const mainPlatforms = a.byPlatform.map((p) => p.k).filter((p) => TAG[p]);
  const tags = a.hashtags.slice(0, 10).map((h) => ({
    tag: h.k, uses: h.n,
    links: mainPlatforms.map((p) => ({ platform: p, url: TAG[p](h.k) })),
  }));
  const mentions = count(lib.flatMap((v) => [...String(v.description || "").matchAll(/@([A-Za-z0-9._]{2,30})/g)].map((m) => m[1].toLowerCase())))
    .filter((m) => !known.has(m.k))
    .slice(0, 8)
    .map((m) => ({ handle: m.k, mentions: m.n, basis: `@-mentioned in ${m.n} of your saved captions` }));
  return { creators, hashtags: tags, mentions, channels: AD_CHANNELS };
}
