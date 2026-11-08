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
// TikTok's uploader_id is numeric; the handle lives in the URL (older saved entries have only the numeric id).
// Instagram's uploader_id is numeric too and its links often carry no handle (/p/<id>/), so a numeric id gives way to the
// account name: every video of one account then lands under one creator. urlHandle() is only used for profile links.
const urlHandle = (v) => (v.platform === "TikTok" ? /tiktok\.com\/@([\w.]+)/ : v.platform === "Instagram" ? /instagram\.com\/(?!p\/|reels?\/|tv\/|stories\/)([\w.]+)\/(?:reels?|p|tv)\// : null)?.exec(v.url || "")?.[1];
const handleOf = (v) => (v.platform === "TikTok" && urlHandle(v))
  || (/^\d+$/.test(v.uploader_id || "") && v.uploader) || v.uploader_id || v.uploader || "unknown";
export const creatorKey = handleOf;
const day = (t) => new Date(t).toISOString().slice(0, 10);

export const median = (xs) => {
  const s = xs.filter((x) => x > 0).sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};
// Best first: views, then likes (Instagram gives no view count, only likes).
const byPerf = (a, b) => (b.view_count || 0) - (a.view_count || 0) || (b.like_count || 0) - (a.like_count || 0);
// Baselines for lift: median views of the library, and median likes of the videos that have no view count.
export const baselines = (lib) => ({ views: median(lib.map((v) => v.view_count)), likes: median(lib.filter((v) => !(v.view_count > 0)).map((v) => v.like_count)) });

// Videos that beat their baseline. Baseline is the creator's follower count when engine knows it
// (views / followers >= 1), otherwise the median views of the saved videos on that platform (>= 3x).
export function outliers(lib, limit = 6) {
  const medByPlatform = {}, likeMedByPlatform = {};
  for (const p of new Set(lib.map((v) => v.platform))) {
    medByPlatform[p] = median(lib.filter((v) => v.platform === p).map((v) => v.view_count));
    likeMedByPlatform[p] = median(lib.filter((v) => v.platform === p && !(v.view_count > 0)).map((v) => v.like_count));
  }
  return lib
    .map((v) => {
      if (!(v.view_count > 0)) {
        // Instagram hides views: compare likes with the other no-view videos of that platform.
        const n = lib.filter((x) => x.platform === v.platform && !(x.view_count > 0) && x.like_count > 0).length, med = likeMedByPlatform[v.platform];
        if (!(v.like_count > 0) || !med || n < 3) return null;
        const multiple = v.like_count / med;
        return { video: v, multiple, score: multiple / 3, basis: `${multiple.toFixed(1)}x the median likes of your saved ${v.platform} videos` };
      }
      if (v.channel_follower_count > 0) {
        const multiple = v.view_count / v.channel_follower_count;
        return { video: v, multiple, score: multiple / 1, basis: `${multiple.toFixed(1)}x the creator's follower count` };
      }
      const med = medByPlatform[v.platform];
      if (!med || lib.filter((x) => x.platform === v.platform).length < 3) return null; // too few to call anything an outlier
      const multiple = v.view_count / med;
      return { video: v, multiple, score: multiple / 3, basis: `${multiple.toFixed(1)}x the median of your saved ${v.platform} videos` };
    })
    .filter((o) => o && o.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

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
  const likeRateByPlatform = byPlatform.map((p) => ({ k: p.k, n: p.n,
    rate: avg(lib.filter((v) => (v.platform || "Other") === p.k).map(eng).filter((e) => e != null)) }));
  const perDay = count(lib.map((v) => day(v.at))).sort((a, b) => a.k.localeCompare(b.k));
  const topVideos = [...lib].sort(byPerf).slice(0, 5);
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
    const hidden = byPlatform.filter((p) => lib.filter((v) => (v.platform || "Other") === p.k).every((v) => !(v.view_count > 0))).map((p) => p.k);
    if (hidden.length) headlines.push(`${hidden.join(", ")} does not share view counts, so those videos are ranked by likes.`);
  }
  return { total, creatorsCount: creators.length, byPlatform, likeRateByPlatform, creators, hashtags, buckets, perDay, topVideos,
    avgEngagement: avg(engs), totalViews: lib.reduce((a, v) => a + (v.view_count || 0), 0),
    totalLikes: lib.reduce((a, v) => a + (v.like_count || 0), 0), viewsKnown: lib.filter((v) => v.view_count > 0).length, headlines };
}

// Library table: text search over title/creator/tags/notes, platform filter, sort.
export function filterLibrary(lib, { q = "", platform = "", sort = "new", folder = "", source = "" } = {}) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = (v) => [v.title, v.uploader, v.uploader_id, v.note, v.folder, v.platform, v.description, v.transcript, v.url, ...(v.tags || [])].join(" ").toLowerCase();
  const out = lib.filter((v) => (!platform || v.platform === platform) && (!source || (source === "ads" ? !!v.source : !v.source)) && (!folder || (folder === "__none" ? !v.folder : v.folder === folder)) && words.every((w) => hay(v).includes(w)));
  const by = { new: (a, b) => b.at - a.at, views: (a, b) => (b.view_count || 0) - (a.view_count || 0),
    like: (a, b) => (eng(b) ?? -1) - (eng(a) ?? -1), length: (a, b) => (b.duration || 0) - (a.duration || 0) };
  return out.sort(by[sort] || by.new);
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
      const mine = lib.filter((x) => creatorKey(x) === c.k), v = mine[0];
      const h = mine.map(urlHandle).find(Boolean) || (/^[\w.]+$/.test(c.k) && c.k !== "unknown" ? c.k : null);
      const url = PROFILE[v.platform] && h ? PROFILE[v.platform](h) : null;
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

// ---------- deeper analysis: creators, formats, keywords, creative brief ----------
const likeRate = eng;
const textOf = (v) => `${v.title || ""} ${String(v.description || "").slice(0, 400)} ${v.transcript || ""}`;
const medOrNull = (xs) => median(xs);

// Content format, from words in the title/caption/tags. A video can have several.
export const FORMATS = [
  ["Tutorial / how-to", /\b(how to|tutorial|step[- ]by[- ]step|guide|tips?|hack|learn)\b/i],
  ["Review", /\b(review|honest|worth it|tested|rating|verdict)\b/i],
  ["Unboxing / haul", /\b(unbox(ing)?|haul|what i got|first look)\b/i],
  ["Before / after", /\b(before (and|&) after|transformation|glow ?up|results?)\b/i],
  ["Comparison", /\b(vs\.?|versus|compare|comparison|which is better)\b/i],
  ["List / top N", /\b(top \d+|\d+ (things|ways|reasons|tips|products|mistakes))\b/i],
  ["Routine / GRWM / day in life", /\b(grwm|get ready with me|routine|day in (my|the) life|diml|morning|night ?time)\b/i],
  ["Recipe / food", /\b(recipe|cook(ing)?|meal ?prep|protein (shake|bar|pancakes?)|ingredients?)\b/i],
  ["POV / skit", /\b(pov|skit|when you|me when|comedy|funny)\b/i],
  ["Story / testimonial", /\b(story ?time|my journey|i lost|i gained|testimonial|changed my life)\b/i],
  ["Challenge / trend", /\b(challenge|trend|trending|duet|stitch)\b/i],
  ["Sponsored / ad", /(#ad\b|#sponsored|\bpaid partnership\b|\bpartner(ed)? with\b|\bcode [A-Z0-9]{3,}\b|\bdiscount code\b)/i],
];
export function formatsOf(v) {
  const t = `${textOf(v)} ${(v.tags || []).join(" ")}`;
  const hit = FORMATS.filter(([, re]) => re.test(t)).map(([n]) => n);
  if (/\?/.test(String(v.description || v.title || "").split("\n")[0])) hit.push("Question hook");
  return hit.length ? hit : ["Other"];
}

// Lift = the group's median views ÷ the library median. When the group has no view counts at all (Instagram),
// it is the median likes of the group ÷ the median likes of the library's no-view videos, and liftBy says which.
export const groupStats = (vs, base) => {
  const med = medOrNull(vs.map((v) => v.view_count));
  const medLikes = medOrNull(vs.filter((v) => !(v.view_count > 0)).map((v) => v.like_count));
  const rates = vs.map(likeRate).filter((e) => e != null);
  const lift = med && base.views ? med / base.views : !med && medLikes && base.likes ? medLikes / base.likes : null;
  return { n: vs.length, medianViews: med, avgLikeRate: avg(rates), avgSeconds: avg(vs.map((v) => v.duration).filter((d) => d > 0)),
    lift, liftBy: lift == null ? null : med ? "views" : "likes" };
};

export function creatorStats(lib) {
  const base = baselines(lib);
  const by = new Map();
  for (const v of lib) { const k = creatorKey(v); if (!by.has(k)) by.set(k, []); by.get(k).push(v); }
  return [...by].map(([k, vs]) => {
    const best = [...vs].sort(byPerf)[0];
    const followers = Math.max(0, ...vs.map((v) => v.channel_follower_count || 0)) || null;
    const tags = count(vs.flatMap(hashtagsOf)).slice(0, 3).map((t) => t.k);
    const formats = count(vs.flatMap(formatsOf)).filter((f) => f.k !== "Other").slice(0, 2).map((f) => f.k);
    const s = groupStats(vs, base);
    return { creator: k, platform: vs[0].platform, ...s, totalViews: vs.reduce((a, v) => a + (v.view_count || 0), 0), followers,
      viewsPerFollower: followers && s.medianViews ? s.medianViews / followers : null, best, tags, formats, lastSaved: Math.max(...vs.map((v) => v.at || 0)) };
  }).sort((a, b) => b.n - a.n || (b.medianViews || 0) - (a.medianViews || 0));
}

export function formatStats(lib) {
  const base = baselines(lib);
  const by = new Map();
  for (const v of lib) for (const f of formatsOf(v)) { if (!by.has(f)) by.set(f, []); by.get(f).push(v); }
  return [...by].map(([format, vs]) => ({ format, ...groupStats(vs, base),
    example: [...vs].sort(byPerf)[0] })).sort((a, b) => b.n - a.n);
}

const STOP = new Set(("the a an and or but if then so to of in on at for with from by is are was were be been it its this that these those i me my we our you your he she they them " +
  "his her their what which who how why when where all any some more most no not only just can will would should could do does did have has had get got " +
  "into out up down over than too very also about as like one two new now here there day today video videos reel reels post follow link bio comment " +
  "comments share save tiktok instagram youtube shorts fyp foryou foryoupage viral explore trending dont don't im i'm it's thats that's make made makes use using used try need know want see look watch let lets going really much many every").split(" "));
export function keywordStats(lib, { min = 2 } = {}) {
  const base = baselines(lib);
  const by = new Map();
  for (const v of lib) {
    const words = new Set(textOf(v).toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/#[\p{L}\p{N}_]+/gu, " ").match(/[\p{L}][\p{L}\p{N}'-]{2,}/gu) || []);
    const keys = new Set([...[...words].filter((w) => !STOP.has(w)), ...hashtagsOf(v).filter((t) => !STOP.has(t)).map((t) => "#" + t)]);
    for (const k of keys) { if (!by.has(k)) by.set(k, []); by.get(k).push(v); }
  }
  return [...by].filter(([, vs]) => vs.length >= min).map(([keyword, vs]) => ({ keyword, ...groupStats(vs, base),
    creators: new Set(vs.map(creatorKey)).size })).sort((a, b) => b.n - a.n || (b.lift || 0) - (a.lift || 0));
}

// A short, evidence-based creative brief from the library (no AI needed). Every line says what it is based on.
export function creativeBrief(lib) {
  if (lib.length < 3) return null;
  const fm = formatStats(lib).filter((f) => f.n >= 2 && f.format !== "Other" && f.lift != null).sort((a, b) => b.lift - a.lift);
  const kw = keywordStats(lib).filter((k) => k.n >= 2 && k.lift != null).sort((a, b) => b.lift - a.lift);
  const a = analyze(lib);
  const len = a.buckets.filter((b) => b.n >= 2 && b.avgEng != null).sort((x, y) => y.avgEng - x.avgEng)[0];
  const top2 = [...lib].sort(byPerf);
  const hooks = [...new Set(top2.map((v) => String(v.hook || v.description || v.title || "").split("\n")[0].trim()).filter((h) => h.length > 8))].slice(0, 4);
  const out = [];
  if (fm[0]) out.push({ title: `Lead with the "${fm[0].format}" format`, basis: `${fm[0].n} saved videos, median ${fm[0].liftBy} ${fm[0].lift.toFixed(1)}x your library median` });
  if (fm[1]) out.push({ title: `Test "${fm[1].format}" as the second angle`, basis: `${fm[1].n} videos, ${fm[1].lift.toFixed(1)}x median ${fm[1].liftBy}` });
  if (len) out.push({ title: `Keep it ${len.k}`, basis: `highest like rate in your library (${(len.avgEng * 100).toFixed(1)}%, ${len.n} videos)` });
  if (kw.length) out.push({ title: `Work these words into hooks and captions: ${kw.slice(0, 5).map((k) => k.keyword).join(", ")}`, basis: "keywords whose videos get the most views (or likes where views are hidden), 2+ videos each" });
  return { ideas: out, hooks, topCreators: creatorStats(lib).filter((c) => c.n >= 2).slice(0, 3).map((c) => c.creator) };
}
