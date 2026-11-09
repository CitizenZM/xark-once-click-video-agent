// Research projects (pure functions): a named set of saved videos for one product or question, account scans,
// recommended accounts and videos, products, opportunities and a remix clip bank. Every suggestion says what it is based on.
import { creatorKey, median, baselines, groupStats, keywordStats, keywordsOf, formatStats, profileOf, profileLink } from "./insights.js";
import { dedupeKey } from "./urls.js";
import { creatorBaselines, vsCreator, adRun, tagStats } from "./winners.js";

export const MAX_PROJECTS = 50, MAX_VIDEOS = 1000, MAX_SCANS = 12, SCAN_ITEMS = 60, MAX_PLAN = 40000;
const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const num = (x) => (x !== null && x !== "" && Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : undefined);
const https = (u) => (typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u) && u.length <= 500 ? u : null);
const H = 3600000;

// ---------- storage shape (the background cleans everything it stores) ----------
export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export function cleanScanItem(x) {
  const url = https(x && x.url);
  if (!url) return null;
  return { url, title: clip(x.title, 150), view_count: num(x.view_count), like_count: num(x.like_count), duration: num(x.duration), timestamp: num(x.timestamp) };
}
export function cleanScan(s) {
  const account = https(s && s.account);
  if (!account) return null;
  return { account, at: num(s.at) || Date.now(), items: (Array.isArray(s.items) ? s.items : []).map(cleanScanItem).filter(Boolean).slice(0, SCAN_ITEMS) };
}
export function cleanProject(p) {
  const id = /^[a-z0-9]{6,30}$/.test(p && p.id) ? p.id : null, name = clip(p && p.name, 60);
  if (!id || !name) return null;
  const urls = [...new Set((Array.isArray(p.urls) ? p.urls : []).map(https).filter(Boolean))].slice(0, MAX_VIDEOS);
  const scans = (Array.isArray(p.scans) ? p.scans : []).map(cleanScan).filter(Boolean).slice(-MAX_SCANS);
  const plan = p.plan && typeof p.plan === "object" && JSON.stringify(p.plan).length <= MAX_PLAN ? p.plan : undefined;
  return { id, name, product: clip(p.product, 300), created: num(p.created) || Date.now(), urls, scans, ...(plan ? { plan } : {}) };
}

export function projectVideos(lib, p) {
  if (!p) return [];
  const keys = new Set(p.urls.map(dedupeKey));
  return lib.filter((v) => keys.has(dedupeKey(v.url)));
}

// ---------- search links for a keyword or product (public search pages; nothing is fetched) ----------
export function searchLinks(term, { product = false } = {}) {
  const q = encodeURIComponent(clip(term, 80).replace(/^#/, ""));
  if (!q) return [];
  const tag = /^#?[\p{L}\p{N}_]+$/u.test(term.trim()) ? term.trim().replace(/^#/, "").toLowerCase() : null;
  return [
    { name: "TikTok", url: `https://www.tiktok.com/search?q=${q}` },
    tag ? { name: "Instagram #", url: `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/` } : null,
    { name: "YouTube Shorts", url: `https://www.youtube.com/results?search_query=${q}+%23shorts` },
    { name: "Meta ads", url: `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&media_type=video&q=${q}&search_type=keyword_unordered` },
    product ? { name: "Amazon", url: `https://www.amazon.com/s?k=${q}` } : null,
  ].filter(Boolean);
}

// ---------- recommended accounts ----------
// New accounts first (not in the project yet): @-mentions in the project's captions and transcripts, and creators elsewhere in
// the library whose videos share the project's keywords. Then the project's own creators, ranked by how their videos do: scan
// those for more.
export function topKeywords(videos, n = 15) {
  return keywordStats(videos).filter((k) => k.n >= 2 || videos.length < 4).slice(0, n).map((k) => k.keyword);
}
export function recommendAccounts(lib, p, videos = projectVideos(lib, p)) {
  const inProject = new Set(videos.map((v) => `${v.platform}:${creatorKey(v).toLowerCase()}`));
  const scanned = new Set(((p && p.scans) || []).map((s) => s.account.replace(/\/$/, "").toLowerCase()));
  const cand = new Map();
  const add = (platform, handle, url, reason, score) => {
    const k = `${platform}:${String(handle).toLowerCase()}`;
    if (inProject.has(k)) return;
    const c = cand.get(k) || { platform, handle, url, reasons: [], score: 0 };
    c.reasons.push(reason); c.score += score; c.url ||= url;
    cand.set(k, c);
  };
  // 1. mentioned in the project's videos
  const mentions = new Map();
  for (const v of videos) for (const m of new Set([...`${v.description || ""} ${v.transcript || ""}`.matchAll(/(?:^|[^\w.])@([A-Za-z0-9._]{2,30})/g)].map((x) => x[1].replace(/\.$/, "")))) {
    const k = `${v.platform}|${m}`; mentions.set(k, (mentions.get(k) || 0) + 1);
  }
  for (const [k, n] of mentions) { const [platform, h] = k.split("|"); add(platform, h, profileLink(platform, h), `@-mentioned in ${n} project video${n > 1 ? "s" : ""}`, 2 + n); }
  // 2. other creators in the library who share the project's keywords
  const kws = new Set(topKeywords(videos)), inUrls = new Set(videos.map((v) => dedupeKey(v.url)));
  const base = baselines(lib);
  if (kws.size) {
    const by = new Map();
    for (const v of lib) {
      if (inUrls.has(dedupeKey(v.url))) continue;
      const shared = [...keywordsOf(v)].filter((w) => kws.has(w));
      if (shared.length < 2) continue;
      const k = creatorKey(v), r = by.get(k) || { v, words: new Set(), vs: [] };
      shared.forEach((w) => r.words.add(w)); r.vs.push(v); by.set(k, r);
    }
    for (const [k, r] of by) {
      const s = groupStats(r.vs, base), words = [...r.words].slice(0, 4);
      add(r.v.platform, k, profileOf(r.v), `${r.vs.length} saved video${r.vs.length > 1 ? "s" : ""} share ${words.join(", ")}${s.lift != null ? ` · ${s.lift.toFixed(1)}x library median ${s.liftBy}` : ""}`,
        r.words.size + Math.min(3, s.lift || 0));
    }
  }
  const fresh = [...cand.values()].sort((a, b) => b.score - a.score).slice(0, 12)
    .map((c) => ({ ...c, scanned: !!c.url && scanned.has(c.url.replace(/\/$/, "").toLowerCase()) }));
  // 3. the project's own creators: who to scan for more of the same
  const pb = baselines(videos), own = new Map();
  for (const v of videos) { const k = creatorKey(v); own.set(k, [...(own.get(k) || []), v]); }
  const mine = [...own].map(([k, vs]) => { const s = groupStats(vs, pb); const url = profileOf(vs[0]);
    return { platform: vs[0].platform, handle: k, url, n: vs.length, lift: s.lift, liftBy: s.liftBy, medianViews: s.medianViews,
      reasons: [`${vs.length} video${vs.length > 1 ? "s" : ""} in this project${s.lift != null ? ` · ${s.lift.toFixed(1)}x project median ${s.liftBy}` : ""}`],
      scanned: !!url && scanned.has(url.replace(/\/$/, "").toLowerCase()) }; })
    .sort((a, b) => (b.lift || 0) - (a.lift || 0) || b.n - a.n);
  return { fresh, mine };
}

// ---------- account scans: an account's recent videos against that account's own median ----------
export function scanSummary(scan, lib = []) {
  const saved = new Set(lib.map((v) => dedupeKey(v.url)));
  const views = median(scan.items.map((x) => x.view_count)), likes = median(scan.items.map((x) => x.like_count));
  const by = views ? "views" : likes ? "likes" : null;
  const items = scan.items.map((x) => {
    const val = by === "views" ? x.view_count : by === "likes" ? x.like_count : null;
    const ageH = x.timestamp ? (scan.at - x.timestamp * 1000) / H : null;
    return { ...x, multiple: val > 0 ? val / (by === "views" ? views : likes) : null, perHour: x.view_count > 0 && ageH >= 1 ? x.view_count / ageH : null, saved: saved.has(dedupeKey(x.url)) };
  }).sort((a, b) => (b.multiple ?? -1) - (a.multiple ?? -1));
  return { account: scan.account, at: scan.at, n: scan.items.length, median: by === "views" ? views : likes, by, items, outliers: items.filter((x) => x.multiple >= 2) };
}
// Unsaved videos from every scan of the project that beat their own account's median by 1.5x or more.
export function recommendedVideos(p, lib, limit = 20) {
  return ((p && p.scans) || []).flatMap((s) => { const sum = scanSummary(s, lib);
    return sum.items.filter((x) => !x.saved && x.multiple >= 1.5).map((x) => ({ ...x, account: s.account,
      basis: `${x.multiple.toFixed(1)}x the median ${sum.by} of this account's last ${sum.n} videos` })); })
    .sort((a, b) => b.multiple - a.multiple).slice(0, limit);
}

// ---------- products (from AI tags: product, category, brand) ----------
export const needsTags = (v) => !v.ai_tags || v.ai_tags.category === undefined;
export function productStats(videos) {
  const base = baselines(videos), by = new Map();
  for (const v of videos) {
    const t = v.ai_tags || {}, name = clip(t.product, 60).toLowerCase();
    if (!name || name === "none" || name === "other") continue;
    const r = by.get(name) || { product: name, category: "", brand: "", vs: [] };
    r.vs.push(v); r.category ||= clip(t.category, 40).toLowerCase(); r.brand ||= clip(t.brand, 40);
    by.set(name, r);
  }
  return [...by.values()].map((r) => {
    const hooks = new Map(); r.vs.forEach((v) => v.ai_tags.hook && v.ai_tags.hook !== "other" && hooks.set(v.ai_tags.hook, (hooks.get(v.ai_tags.hook) || 0) + 1));
    const best = [...r.vs].sort((a, b) => (b.view_count || 0) - (a.view_count || 0) || (b.like_count || 0) - (a.like_count || 0))[0];
    return { product: r.product, category: r.category, brand: r.brand, ...groupStats(r.vs, base), creators: new Set(r.vs.map(creatorKey)).size,
      hooks: [...hooks].sort((a, b) => b[1] - a[1]).slice(0, 2).map((h) => h[0]), best, urls: r.vs.map((v) => v.url) };
  }).sort((a, b) => b.n - a.n || (b.lift || 0) - (a.lift || 0));
}
export const productFilter = (videos, product) => (product ? videos.filter((v) => clip(v.ai_tags && v.ai_tags.product, 60).toLowerCase() === product) : videos);

// ---------- winners and opportunities ----------
// How strongly a video performs: the best of vs its creator, vs the project median, and an ad that ran 30+ days.
export function winnerScore(v, videos, bases = creatorBaselines(videos), base = baselines(videos)) {
  const why = [];
  const vc = vsCreator(v, bases); if (vc) why.push({ x: vc.multiple, text: `${vc.multiple.toFixed(1)}x its creator's typical video` });
  if (v.view_count > 0 && base.views) why.push({ x: v.view_count / base.views, text: `${(v.view_count / base.views).toFixed(1)}x the project's median views` });
  else if (v.like_count > 0 && base.likes) why.push({ x: v.like_count / base.likes, text: `${(v.like_count / base.likes).toFixed(1)}x the project's median likes` });
  const run = adRun(v); if (run && run.long) why.push({ x: 2, text: `ad ran ${run.days} days` });
  const top = why.sort((a, b) => b.x - a.x)[0];
  return top ? { score: top.x, basis: top.text } : { score: 0, basis: "" };
}

const DIM_NAMES = { hook: "hook type", angle: "angle", audience: "audience", emotion: "emotion" };
export function opportunities(videos, lib = videos) {
  const out = [];
  for (const dim of Object.keys(DIM_NAMES)) for (const r of tagStats(videos, dim)) {
    if (r.value === "other" || r.lift == null) continue;
    const label = `${DIM_NAMES[dim]} “${r.value}”`, num = `${r.n} video${r.n > 1 ? "s" : ""}, ${r.lift.toFixed(1)}x median ${r.liftBy}`;
    if (r.lift >= 1.5 && r.n >= 3) out.push({ kind: "double down", title: `Make more with the ${label}`, basis: num, score: r.lift * 2 });
    else if (r.lift >= 1.5) out.push({ kind: "test", title: `Test the ${label}: it wins but is barely used`, basis: num, score: r.lift });
    else if (r.lift <= 0.6 && r.n >= 3) out.push({ kind: "avoid", title: `Use the ${label} less`, basis: num, score: 1 / r.lift / 3 });
  }
  for (const f of formatStats(videos)) {
    if (f.format === "Other" || f.lift == null || f.n < 2) continue;
    if (f.lift >= 1.5) out.push({ kind: f.n >= 3 ? "double down" : "test", title: `Format “${f.format}” outperforms`, basis: `${f.n} videos, ${f.lift.toFixed(1)}x median ${f.liftBy}`, score: f.lift });
  }
  const kw = keywordStats(videos).filter((k) => k.n >= 2 && k.lift >= 1.5 && k.creators >= 2).slice(0, 3);
  for (const k of kw) out.push({ kind: "test", title: `Build an ad around “${k.keyword}”`, basis: `${k.n} videos from ${k.creators} creators, ${k.lift.toFixed(1)}x median ${k.liftBy}`, score: k.lift });
  // gaps: what the project does not have yet
  const plats = new Set(videos.map((v) => v.platform));
  if (videos.length && !videos.some((v) => v.source)) out.push({ kind: "gap", title: "No paid ads in this project yet: search the Meta Ad Library for the product", basis: "ads that run 30+ days show what makes money; pick them in select mode to keep their run dates", score: 1.2 });
  if (videos.length >= 3 && plats.size === 1) out.push({ kind: "gap", title: `Only ${[...plats][0]} so far: check the same keywords on another platform`, basis: `${videos.length} videos, all from one platform`, score: 1 });
  const untranscribed = videos.filter((v) => v.file && !v.transcript && !v.noSpeech).length;
  if (untranscribed) out.push({ kind: "gap", title: `Transcribe ${untranscribed} video${untranscribed > 1 ? "s" : ""} to get clip timings for remixing`, basis: "the remix bank needs the spoken lines with their seconds", score: 0.9 });
  const untagged = videos.filter(needsTags).length;
  if (untagged) out.push({ kind: "gap", title: `Tag ${untagged} video${untagged > 1 ? "s" : ""} with AI to see products, hooks and angles`, basis: "hook, angle, audience, emotion and product come from the AI tags", score: 0.8 });
  const order = { "double down": 0, test: 1, avoid: 2, gap: 3 };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || b.score - a.score).slice(0, 14);
}

// ---------- remix bank: openers and closers of the winning videos, with their seconds ----------
export const ts = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
export function remixBank(videos, limit = 8) {
  const bases = creatorBaselines(videos), base = baselines(videos);
  const winners = videos.map((v) => ({ v, ...winnerScore(v, videos, bases, base) })).filter((w) => w.score >= 1)
    .sort((a, b) => b.score - a.score).slice(0, limit);
  const clips = [];
  for (const w of winners) {
    const segs = Array.isArray(w.v.segments) ? w.v.segments : [];
    const first = segs.filter((s) => s.start < 4), last = segs.length > 2 ? segs[segs.length - 1] : null;
    if (first.length) clips.push({ role: "hook", v: w.v, start: first[0].start, end: Math.min(first[first.length - 1].end, 6), text: first.map((s) => s.text).join(" "), basis: w.basis, score: w.score });
    else if (w.v.hook) clips.push({ role: "hook", v: w.v, start: 0, end: 3, text: w.v.hook, basis: w.basis, score: w.score });
    else clips.push({ role: "hook", v: w.v, start: 0, end: 3, text: "", basis: w.basis + " (no transcript: watch the first 3 seconds)", score: w.score });
    if (last && last.start > 4) clips.push({ role: "cta", v: w.v, start: last.start, end: last.end, text: last.text, basis: w.basis, score: w.score });
  }
  // recipes: the strongest opener on a different winner's body, closing with a third video's CTA when there is one
  const hooks = clips.filter((c) => c.role === "hook"), ctas = clips.filter((c) => c.role === "cta"), recipes = [];
  for (let i = 0; i < Math.min(3, hooks.length); i++) {
    const body = winners.find((w) => w.v !== hooks[i].v && !recipes.some((r) => r.body === w.v) && w.v !== (recipes[i - 1] || {}).hook?.v);
    if (!body) break;
    const cta = ctas.find((c) => c.v !== hooks[i].v && c.v !== body.v);
    recipes.push({ hook: hooks[i], body: body.v, bodyBasis: body.basis, cta });
  }
  return { winners, clips, recipes };
}
// Tab-separated clip list for an editor (or a spreadsheet): file, in, out, role, line, source link.
export const clipListTSV = (clips) => ["file\tin\tout\trole\tline\tsource", ...clips.map((c) => [c.v.file || "", ts(c.start), ts(c.end), c.role, c.text, c.v.url].map((x) => String(x).replace(/[\t\n]/g, " ")).join("\t"))].join("\n");
