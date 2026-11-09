// Project add-ons (pure functions): viewer comments, accounts found by search, own-ad results, and exports.
// Nothing here fetches; the background and the Projects tab call these with stored data.
import { median, creatorKey } from "./insights.js";

const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const num = (x) => { const n = typeof x === "string" ? Number(x.replace(/[$,%\s]/g, "")) : Number(x); return x !== null && x !== "" && Number.isFinite(n) && n >= 0 ? n : undefined; };
const https = (u) => (typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u) && u.length <= 500 ? u : null);
export const MAX_FINDS = 10, FIND_ITEMS = 60, MAX_ADS = 300, MAX_COMMENTS = 60;

// ---------- comments ----------
export const cleanComments = (list) => (Array.isArray(list) ? list : [])
  .map((c) => ({ text: clip(c && c.text, 300), likes: num(c && c.likes) || 0 })).filter((c) => c.text).slice(0, MAX_COMMENTS);

const QUESTION = /\?|？|^(how|what|where|does|do|is|are|can|will|which|why|when|who|link|price)\b|吗|怎么|多少|哪里|哪儿|能不能|有没有/i;
const OBJECTION = /\b(expensive|pricey|overpriced|too much|scam|fake|doesn'?t work|didn'?t work|stopped working|broke|broken|waste|cheap(ly)? made|returned|refund|smells?|too loud|too small|too big|not worth|disappoint\w*|ripoff|rip off|junk|leak\w*|burn\w*)\b|贵|骗|假|没用|坏了|退货|不值/i;
const STOP = new Set("the a an and or to of in on for is it this that i you my me so be are was with just have has not but at as its it's do does can get got they them we your what how why when from if no yes all one like love".split(" "));

// Questions and objections viewers wrote under the project's videos, most-liked first, plus recurring words.
export function commentInsights(videos, limit = 8) {
  const all = videos.flatMap((v) => (v.comments || []).map((c) => ({ ...c, url: v.url, creator: v.uploader || "" })));
  const pick = (re) => all.filter((c) => re.test(c.text)).sort((a, b) => b.likes - a.likes).slice(0, limit);
  const words = new Map();
  for (const c of all) for (const w of new Set(c.text.toLowerCase().match(/[\p{L}][\p{L}'-]{2,}/gu) || [])) if (!STOP.has(w)) words.set(w, (words.get(w) || 0) + 1);
  return {
    n: all.length, videos: videos.filter((v) => v.comments && v.comments.length).length,
    questions: pick(QUESTION), objections: pick(OBJECTION),
    themes: [...words].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([word, n]) => ({ word, n })),
  };
}

// ---------- accounts found by search (YouTube search via the helper, or a TikTok / Instagram page sent from the select bar) ----------
export function cleanFind(f) {
  const query = clip(f && f.query, 80), platform = clip(f && f.platform, 20);
  if (!query || !platform) return null;
  const items = (Array.isArray(f.items) ? f.items : []).map((x) => {
    const url = https(x && x.url); if (!url) return null;
    return { url, title: clip(x.title, 150), view_count: num(x.view_count), account: https(x.account) || undefined, name: clip(x.name, 80) || undefined };
  }).filter(Boolean).slice(0, FIND_ITEMS);
  return { query, platform, at: num(f.at) || Date.now(), items };
}

// TikTok search grids carry the handle in each link (/@name/video/1); Instagram reels links do not.
export const accountOfUrl = (u) => { const m = /^https:\/\/(?:www\.)?tiktok\.com\/@([\w.-]+)\//.exec(u || ""); return m ? `https://www.tiktok.com/@${m[1]}` : null; };

// One row per account across all finds: how many found videos, their median and best views. Accounts already in
// the project or already scanned are marked so the list shows who is new.
export function searchAccounts(finds, { known = new Set(), scanned = new Set() } = {}) {
  const by = new Map();
  for (const f of finds || []) for (const it of f.items) {
    const acct = it.account || accountOfUrl(it.url); if (!acct) continue;
    const r = by.get(acct) || { account: acct, name: it.name || acct.replace(/^https:\/\/(www\.)?/, ""), platform: f.platform, queries: new Set(), views: [], urls: new Set() };
    if (!r.urls.has(it.url)) { r.urls.add(it.url); if (it.view_count != null) r.views.push(it.view_count); }
    r.queries.add(f.query); by.set(acct, r);
  }
  return [...by.values()].map((r) => ({ account: r.account, name: r.name, platform: r.platform, queries: [...r.queries], n: r.urls.size,
    median: r.views.length ? median(r.views) : null, best: r.views.length ? Math.max(...r.views) : null,
    known: known.has(r.account), scanned: scanned.has(r.account) }))
    .sort((a, b) => (b.n - a.n) || ((b.median || 0) - (a.median || 0)));
}

// ---------- own ads ----------
export function cleanAd(a) {
  const name = clip(a && a.name, 120); if (!name) return null;
  const id = typeof a.id === "string" && /^[a-z0-9]{4,30}$/.test(a.id) ? a.id : Math.random().toString(36).slice(2, 10);
  const out = { id, name, ref: https(a.ref) || undefined, hook: clip(a.hook, 40) || undefined, format: clip(a.format, 40) || undefined, platform: clip(a.platform, 20) || undefined };
  for (const k of ["spend", "impressions", "clicks", "purchases", "revenue"]) out[k] = num(a[k]) ?? 0;
  return out;
}
export const adMetrics = (a) => ({ ctr: a.impressions ? a.clicks / a.impressions : null, cpa: a.purchases ? a.spend / a.purchases : null, roas: a.spend ? a.revenue / a.spend : null });

// Totals by reference video, hook and format: which inputs produced the best return. Groups under minSpend are
// listed but not ranked (too little data).
export function adStats(ads, lib = [], { minSpend = 20 } = {}) {
  const byUrl = new Map(lib.map((v) => [v.url, v]));
  const total = sum(ads);
  const groups = (keyOf) => {
    const m = new Map();
    for (const a of ads) { const k = keyOf(a); if (!k) continue; (m.get(k) || m.set(k, []).get(k)).push(a); }
    return [...m].map(([key, list]) => ({ key, n: list.length, ...sum(list) }))
      .sort((x, y) => (y.spend >= minSpend) - (x.spend >= minSpend) || (y.roas ?? -1) - (x.roas ?? -1));
  };
  const hookOf = (a) => a.hook || (a.ref && byUrl.get(a.ref)?.ai_tags?.hook) || null;
  const formatOf = (a) => a.format || (a.ref && byUrl.get(a.ref)?.ai_tags?.angle) || null;
  return { total, byRef: groups((a) => a.ref || null).map((g) => ({ ...g, video: byUrl.get(g.key) || null })), byHook: groups(hookOf), byFormat: groups(formatOf), minSpend };
}
function sum(list) {
  const t = { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 };
  for (const a of list) for (const k in t) t[k] += a[k] || 0;
  return { ...t, ...adMetrics(t) };
}

// CSV from Meta Ads Manager, TikTok Ads Manager or a hand-made sheet: columns are found by name.
const COLS = {
  name: [/^ad name$/, /^ad$/, /^name$/, /creative name/],
  spend: [/amount spent/, /^spend/, /^cost$/, /total cost/],
  impressions: [/^impressions$/],
  clicks: [/link clicks/, /^clicks/, /clicks \(all\)/],
  purchases: [/^purchases$/, /^conversions$/, /^results$/, /complete payment$/],
  revenue: [/purchase(s)? conversion value/, /total purchase value/, /^revenue$/, /purchase value/, /conversion value/],
  ref: [/^reference$/, /^ref$/, /reference url/],
  hook: [/^hook$/], format: [/^format$/],
};
export function parseCsv(text) {
  const rows = [], s = String(text || "").replace(/^﻿/, ""); let row = [], cell = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === "," || c === "\t") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
export function adsFromCsv(text) {
  const [head, ...rows] = parseCsv(text);
  if (!head) return { ads: [], missing: ["header"] };
  const h = head.map((x) => x.trim().toLowerCase()), col = {};
  for (const [k, res] of Object.entries(COLS)) { for (const re of res) { const i = h.findIndex((x) => re.test(x)); if (i >= 0) { col[k] = i; break; } } }
  const missing = ["name", "spend"].filter((k) => col[k] == null);
  if (missing.length) return { ads: [], missing };
  const ads = rows.map((r) => cleanAd(Object.fromEntries(Object.entries(col).map(([k, i]) => [k, r[i]])))).filter((a) => a && !/^total/i.test(a.name));
  return { ads: ads.slice(0, MAX_ADS), missing: [] };
}

// ---------- exports ----------
// CMX 3600 EDL (30 fps, non-drop) of the remix bank: one event per clip, the source file as the reel / clip name.
// Premiere, Resolve and Final Cut (via import) read it; relink the clips to the files the comments name.
const tc = (sec, rec = 0) => { const f = Math.round((sec + rec) * 30); const p = (n) => String(n).padStart(2, "0"); return `${p(Math.floor(f / 108000))}:${p(Math.floor(f / 1800) % 60)}:${p(Math.floor(f / 30) % 60)}:${p(f % 30)}`; };
export function toEDL(clips, title = "Remix bank") {
  let rec = 0;
  const lines = [`TITLE: ${clip(title, 60).replace(/[^\w .-]/g, "")}`, "FCM: NON-DROP FRAME", ""];
  clips.forEach((c, i) => {
    const d = Math.max(0.1, c.end - c.start), n = String(i + 1).padStart(3, "0");
    lines.push(`${n}  AX       V     C        ${tc(c.start)} ${tc(c.end)} ${tc(0, rec)} ${tc(0, rec + d)}`);
    lines.push(`* FROM CLIP NAME: ${(c.v.file || c.v.url).split("/").pop()}`, `* COMMENT: ${c.role} ${clip(c.text, 60)} (${c.v.url})`, "");
    rec += d;
  });
  return lines.join("\n");
}

const cell = (x) => `"${String(x ?? "").replace(/"/g, '""')}"`;
export function projectCSV(videos, { scoreOf = () => null } = {}) {
  const head = ["url", "platform", "creator", "title", "views", "likes", "comments", "posted", "seconds", "vs_creator", "product", "category", "brand", "hook", "angle", "first_line", "file"];
  const rows = videos.map((v) => [v.url, v.platform, v.uploader || creatorKey(v), v.title, v.view_count, v.like_count, v.comment_count,
    v.timestamp ? new Date(v.timestamp * 1000).toISOString().slice(0, 10) : "", v.duration, scoreOf(v), v.ai_tags?.product, v.ai_tags?.category, v.ai_tags?.brand,
    v.ai_tags?.hook, v.ai_tags?.angle, (v.segments && v.segments[0] && v.segments[0].text) || String(v.transcript || "").split(/[.!?]/)[0], v.file]);
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

// A printable, self-contained report (no scripts): open it and print to PDF.
export function reportHTML(r, esc) {
  const li = (arr, f) => (arr && arr.length ? `<ul>${arr.map((x) => `<li>${f(x)}</li>`).join("")}</ul>` : `<p class="m">None yet.</p>`);
  const k = (n) => (n == null ? "–" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n)));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.name)} – research report</title><style>
body{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0f172a;max-width:860px;margin:32px auto;padding:0 20px}
h1{font-size:24px;margin:0}h2{font-size:17px;margin:26px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}.m{color:#64748b}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #e2e8f0;padding:5px 6px;text-align:left;vertical-align:top}th{color:#475569;font-weight:600}
.n{text-align:right}a{color:#1d4ed8;text-decoration:none}@media print{a{color:inherit}h2{break-after:avoid}tr{break-inside:avoid}}</style></head><body>
<h1>${esc(r.name)}</h1><p class="m">${r.product ? esc(r.product) + " · " : ""}${r.videos.length} videos · ${new Set(r.videos.map((v) => v.uploader)).size} creators · ${esc(new Date(r.at).toLocaleString())}</p>
<h2>Top videos</h2><table><tr><th>Video</th><th>Creator</th><th class="n">Views</th><th>Why</th></tr>${r.top.map((x) => `<tr><td><a href="${esc(x.v.url)}">${esc((x.v.title || x.v.url).slice(0, 80))}</a></td><td>${esc(x.v.uploader || "")}</td><td class="n">${k(x.v.view_count)}</td><td>${esc(x.basis || "")}</td></tr>`).join("")}</table>
<h2>Accounts to study</h2>${li(r.accounts, (a) => `<a href="${esc(a.url || "#")}">${esc(a.handle)}</a> <span class="m">${esc(a.reasons.join(" · "))}</span>`)}
<h2>Keywords</h2>${li(r.keywords, (x) => `<b>${esc(x.keyword)}</b> <span class="m">${x.n} videos${x.lift != null ? ` · ${x.lift.toFixed(1)}x` : ""}</span>`)}
<h2>Products</h2>${li(r.products, (x) => `<b>${esc(x.product)}</b> <span class="m">${esc(x.category || "")} · ${x.n} videos${x.lift != null ? ` · ${x.lift.toFixed(1)}x` : ""}</span>`)}
<h2>Opportunities</h2>${li(r.opportunities, (o) => `<b>${esc(o.kind)}</b>: ${esc(o.title)} <span class="m">${esc(o.basis)}</span>`)}
${r.comments && r.comments.n ? `<h2>What viewers ask and push back on</h2><p class="m">${r.comments.n} comments on ${r.comments.videos} videos</p>${li(r.comments.questions.slice(0, 6), (c) => `“${esc(c.text)}” <span class="m">${c.likes} likes</span>`)}${li(r.comments.objections.slice(0, 6), (c) => `“${esc(c.text)}” <span class="m">${c.likes} likes</span>`)}` : ""}
${r.ads && r.ads.total.spend ? `<h2>Our ads</h2><p>Spend $${r.ads.total.spend.toFixed(0)} · revenue $${r.ads.total.revenue.toFixed(0)} · ROAS ${r.ads.total.roas != null ? r.ads.total.roas.toFixed(2) : "–"}</p>${li(r.ads.byHook.slice(0, 5), (g) => `${esc(g.key)}: $${g.spend.toFixed(0)} spend, ROAS ${g.roas != null ? g.roas.toFixed(2) : "–"}`)}` : ""}
${r.plan ? `<h2>Plan</h2><p>${esc(r.plan.summary || "")}</p>${li((r.plan.new_ads || []).slice(0, 3), (x) => `<b>${esc(x.name)}</b>: “${esc(x.hook)}” <span class="m">${esc(x.why || "")}</span>`)}` : ""}
</body></html>`;
}
