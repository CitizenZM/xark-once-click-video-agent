// Page-side video finder, injected on demand (popup one-click, select mode). Classic script; no imports.
// PATTERNS must match urls.js (a test checks this).
(() => {
  if (window.__oneclickDetect) return;
  const PATTERNS = [
    /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]*\/video\/\d+/,
    /^https?:\/\/(www\.)?instagram\.com\/([\w.]+\/)?(reel|reels|p|tv)\/(?!audio\/)[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/watch\?(?:.*&)?v=[\w-]+/,
    /^https?:\/\/(www\.)?(x|twitter)\.com\/\w+\/status\/\d+/,
  ];
  const UNIT = { k: 1e3, m: 1e6, b: 1e9, "万": 1e4, "亿": 1e8 };
  const parseCount = (text) => {
    const m = /^([\d][\d,]*(?:\.\d+)?)\s*([kKmMbB万亿])?(?:\s*views?)?$/i.exec(String(text == null ? "" : text).trim());
    if (!m) return null;
    const n = parseFloat(m[1].replace(/,/g, ""));
    return Number.isFinite(n) ? Math.round(n * (m[2] ? UNIT[m[2].toLowerCase()] : 1)) : null;
  };
  // views[] (number|null) -> per item { rank (1 = most views, ties share a rank, null without views), multiple (views / median), outlier (multiple >= 2) }
  const outlierFlags = (views) => {
    const has = views.filter((v) => v > 0).sort((a, b) => b - a);
    const mid = has.length >> 1, median = has.length ? (has.length % 2 ? has[mid] : (has[mid - 1] + has[mid]) / 2) : 0;
    return views.map((v) => {
      if (!(v > 0)) return { rank: null, multiple: null, outlier: false };
      const multiple = v / median;
      return { rank: has.indexOf(v) + 1, multiple, outlier: has.length >= 4 && multiple >= 2 };
    });
  };
  const isVideo = (h) => PATTERNS.some((p) => p.test(h));
  const big = (el) => { const r = el.getBoundingClientRect(); return r.width >= 100 && r.height >= 100; };
  // The element a checkbox should sit on: the link itself if it is a tile, else the nearest tile-sized ancestor.
  const tileOf = (el) => { for (let e = el, i = 0; e && i < 8; e = e.parentElement, i++) if (big(e)) return e; return null; };
  // TikTok feeds (For You, Following) have no video links: the id is in the player wrapper, the handle in the card.
  const tiktokPlayers = () => [...document.querySelectorAll("[id^='xgwrapper-']")].map((w) => {
    const id = (/(\d{8,})$/.exec(w.id) || [])[1];
    if (!id) return null;
    const card = w.closest("[id^='one-column-item'],[id^='media-card'],article") || w.parentElement;
    const a = card && card.querySelector("a[href^='/@'],a[href*='tiktok.com/@']");
    const handle = (a && (/@([\w.-]+)/.exec(a.getAttribute("href")) || [])[1]) || (/^\/@([\w.-]+)/.exec(location.pathname) || [])[1] || ""; // profile pages: the page owner
    return { url: `https://www.tiktok.com/@${handle}/video/${id}`, el: card || w };
  }).filter(Boolean);
  // View count of a tile: TikTok's video-views node first, else the anchor's own text when it is just a number (Instagram reels tab).
  const metricsOf = (el, anchor) => {
    const t = el.querySelector && el.querySelector("[data-e2e='video-views']");
    const v = t ? parseCount(t.textContent) : null;
    return v != null ? v : parseCount(anchor && anchor.innerText);
  };
  function items() {
    const out = new Map();
    for (const a of document.links) {
      if (!isVideo(a.href)) continue;
      const el = tileOf(a);
      if (el && !out.has(a.href)) out.set(a.href, { url: a.href, el, views: metricsOf(el, a) });
    }
    if (/tiktok\.com$/.test(location.hostname)) for (const p of tiktokPlayers()) if (!out.has(p.url)) out.set(p.url, { ...p, views: metricsOf(p.el, null) });
    return [...out.values()];
  }
  // The video the user is looking at: the page URL if it is a video page, else the most visible playing video.
  function current() {
    if (isVideo(location.href)) return location.href;
    let best = null, bestArea = 0;
    for (const v of document.querySelectorAll("video")) {
      const r = v.getBoundingClientRect();
      const area = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) * Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
      if (area > bestArea) { bestArea = area; best = v; }
    }
    if (!best) return null;
    const w = best.closest("[id^='xgwrapper-']");
    if (w) { const p = tiktokPlayers().find((x) => x.el.contains(w)); if (p) return p.url; }
    for (let e = best, i = 0; e && i < 10; e = e.parentElement, i++) {
      const a = e.matches && e.matches("a[href]") && isVideo(e.href) ? e : e.querySelector && [...e.querySelectorAll("a[href]")].find((x) => isVideo(x.href));
      if (a) return a.href;
    }
    return null;
  }
  window.__oneclickDetect = { PATTERNS, items, current, parseCount, outlierFlags, metricsOf };
})();
