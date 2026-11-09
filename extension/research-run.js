// Background side of the project add-ons: YouTube search, pages sent from the select bar, comments, own ads,
// the daily account scan and the Ad Studio bridge. Every action checks its feature switch first.
import { videoUrls, dedupeKey } from "./urls.js";
import { cleanScan, recommendedVideos, SCAN_ITEMS } from "./projects.js";
import { cleanFind, cleanComments, cleanAd, accountOfUrl, MAX_ADS } from "./research.js";
import { loadFeatures } from "./features.js";

export const AUTOSCAN_MAX_ACCOUNTS = 20;
export const DEFAULT_AD_STUDIO = "http://localhost:5310";
const off = { research: "Research is off (Settings)", comments: "Viewer comments are off (Settings)", adStudio: "The Ad Studio bridge is off (Settings)",
  ownAds: "My ads tracking is off (Settings)", autoScan: "The daily account scan is off (Settings)" };

export function setupResearch({ get, locked, call, projEdit, notify }) {
  const need = async (key) => { const f = await loadFeatures(); if (!f[key]) throw new Error(off[key]); return f; };
  const wrap = (key, fn) => async (m) => { try { await need(key); return await fn(m); } catch (e) { return { error: e.message }; } };

  // YouTube search through the helper; the result is kept on the project as a "find"
  const find = wrap("research", async ({ id, query }) => {
    const r = await call({ type: "search", query, limit: 40 });
    if (!r.ok) return { error: r.error };
    const f = cleanFind({ query: r.query, platform: "youtube", at: Date.now(), items: r.items });
    return projEdit(id, (p) => ({ ...p, finds: [...(p.finds || []).filter((x) => !(x.query === f.query && x.platform === f.platform)), f] }));
  });

  // A TikTok / Instagram / YouTube page sent from the select bar: a creator's own grid becomes a scan of that account
  // (with the view counts the page shows, which engine cannot read on Instagram); a search or hashtag page becomes a find.
  const pageScan = wrap("research", async ({ id, page, items }) => {
    const pageUrl = typeof page?.url === "string" ? page.url : "";
    const ok = (Array.isArray(items) ? items : []).filter((x) => x && videoUrls([x.url], 1).length).slice(0, SCAN_ITEMS);
    if (!ok.length) return { error: "No videos on this page" };
    if (page.profile) {
      const scan = cleanScan({ account: pageUrl.split("?")[0], at: Date.now(), items: ok.map((x) => ({ url: x.url, view_count: x.views, title: x.title })) });
      if (!scan) return { error: "Invalid page" };
      return projEdit(id, (p) => ({ ...p, scans: [...p.scans.filter((s) => s.account !== scan.account), scan] }));
    }
    const host = /tiktok/.test(pageUrl) ? "tiktok" : /instagram/.test(pageUrl) ? "instagram" : /youtube/.test(pageUrl) ? "youtube" : "web";
    const q = (() => { try { const u = new URL(pageUrl); return u.searchParams.get("q") || u.searchParams.get("search_query") || decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || ""); } catch { return ""; } })();
    const f = cleanFind({ query: q || page.title || "page", platform: host, at: Date.now(), items: ok.map((x) => ({ url: x.url, view_count: x.views, title: x.title, account: accountOfUrl(x.url) })) });
    if (!f) return { error: "Invalid page" };
    return projEdit(id, (p) => ({ ...p, finds: [...(p.finds || []).filter((x) => !(x.query === f.query && x.platform === f.platform)), f] }));
  });

  const setComments = (url, list) => locked(async () => {
    const k = dedupeKey(url), lib = await get("library", []);
    let hit = false;
    const next = lib.map((v) => (dedupeKey(v.url) === k ? ((hit = true), { ...v, comments: cleanComments(list), comments_at: Date.now() }) : v));
    if (hit) await chrome.storage.local.set({ library: next });
    return hit;
  });
  // YouTube through engine; other platforms are read from the open page (comments-save) because engine cannot
  const fetchComments = wrap("comments", async ({ urls }) => {
    const todo = videoUrls(urls || [], 30); let done = 0, skipped = 0, failed = 0;
    for (const u of todo) {
      if (!/youtube\.com|youtu\.be/.test(u)) { skipped++; continue; }
      const r = await call({ type: "comments", url: u }).catch((e) => ({ ok: false, error: e.message }));
      if (r.ok && (await setComments(u, r.comments))) done++; else failed++;
    }
    return { ok: true, done, skipped, failed };
  });
  const saveComments = wrap("comments", async ({ url, comments }) => {
    if (!videoUrls([url], 1).length) return { error: "Not a video page" };
    const list = cleanComments(comments);
    if (!list.length) return { error: "No comments found on the page: open the comments panel and scroll it a little" };
    return (await setComments(url, list)) ? { ok: true, n: list.length } : { error: "Save this video first, then read its comments" };
  });

  const ads = wrap("ownAds", async ({ id, mode, ads: list, adId }) => projEdit(id, (p) => {
    const cur = p.ads || [], incoming = (Array.isArray(list) ? list : []).map(cleanAd).filter(Boolean);
    const next = mode === "replace" ? incoming : mode === "delete" ? cur.filter((a) => a.id !== adId)
      : mode === "update" ? cur.map((a) => incoming.find((x) => x.id === a.id) || a) : [...cur, ...incoming];
    return { ...p, ads: next.slice(-MAX_ADS) };
  }));

  // Daily: re-scan the accounts each project already scanned (newest first, capped) and remember the new 1.5x+ picks.
  async function autoScan({ force = false } = {}) {
    const f = await loadFeatures();
    if (!f.autoScan && !force) return { skipped: true };
    if (!f.research) return { error: off.research };
    let accounts = 0; const found = [];
    for (const p of await get("projects", [])) {
      if (accounts >= AUTOSCAN_MAX_ACCOUNTS) break;
      const before = new Set(recommendedVideos(p, await get("library", []), 100).map((x) => x.url));
      for (const s of p.scans.slice().reverse()) {
        if (accounts >= AUTOSCAN_MAX_ACCOUNTS) break;
        accounts++;
        const r = await call({ type: "expand", url: s.account, limit: 30, stats: true }).catch(() => null);
        if (!r || !r.ok) continue;
        const scan = cleanScan({ account: s.account, at: Date.now(), items: (r.items || []).filter((x) => videoUrls([x && x.url], 1).length) });
        if (scan) await projEdit(p.id, (q) => ({ ...q, scans: [...q.scans.filter((x) => x.account !== scan.account), scan] }));
      }
      const now = (await get("projects", [])).find((x) => x.id === p.id);
      if (!now) continue;
      const fresh = recommendedVideos(now, await get("library", []), 100).map((x) => x.url).filter((u) => !before.has(u));
      await projEdit(p.id, (q) => ({ ...q, fresh, autoScanAt: Date.now() }));
      if (fresh.length) found.push(`${p.name}: ${fresh.length}`);
    }
    if (found.length && notify) notify("New videos to look at", found.join(" · ") + " (Projects tab)");
    return { ok: true, accounts, found };
  }
  chrome.alarms.onAlarm.addListener((a) => a.name === "autoscan" && autoScan().catch(() => {}));

  // Ad Studio: the background looks up the saved file itself (pages pass a video URL, never a file path).
  const adStudio = wrap("adStudio", async (m) => {
    const { settings = {} } = await chrome.storage.local.get("settings");
    const base = settings.adStudioUrl || DEFAULT_AD_STUDIO;
    if (m.action === "ping") return call({ type: "adstudio", action: "ping", base });
    const lib = await get("library", []), byKey = (u) => lib.find((v) => v.file && dedupeKey(v.url) === dedupeKey(u));
    if (m.action === "job") {
      const v = byKey(m.url);
      return call({ type: "adstudio", action: "job", base, file: v ? v.file : null, refUrl: m.url, productUrl: m.productUrl, title: m.title, notes: m.notes, goal: m.goal, engine: m.engine });
    }
    if (m.action === "clips") {
      const out = [];
      for (const g of (m.groups || []).slice(0, 10)) { // one upload per source video
        const v = byKey(g.url);
        if (!v) { out.push({ url: g.url, ok: false, error: "Not downloaded" }); continue; }
        const r = await call({ type: "adstudio", action: "clips", base, file: v.file, clips: g.clips, rights: m.rights, project: m.project, source: { url: v.url, creator: v.uploader || "", title: v.title || "" } });
        out.push({ url: g.url, ...r });
      }
      return { ok: out.some((r) => r.ok), results: out };
    }
    return { error: "unknown action" };
  });

  return { find, pageScan, fetchComments, saveComments, ads, autoScan: (m) => autoScan(m || {}), adStudio,
    schedule: () => chrome.alarms.create("autoscan", { periodInMinutes: 1440, delayInMinutes: 30 }) };
}
