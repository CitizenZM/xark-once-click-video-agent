import { videoUrls, dedupeKey } from "./urls.js";

const HOST = "com.barron.oneclick_dl";
let port = null;
let seq = 0;
let inflight = 0;
const pending = new Map();
const jobs = new Map(); // live queue, mirrored to storage for the dashboard
let jobSeq = 0;
let flushTimer = null;
let chain = Promise.resolve(); // serialises read-modify-write on storage
const locked = (fn) => (chain = chain.then(fn, fn));

// ---- native host (one long-lived port; replies matched by id) ----
function connect() {
  if (port) return port;
  port = chrome.runtime.connectNative(HOST);
  port.onMessage.addListener((m) => {
    if (m.type === "reload") return chrome.runtime.reload(); // dev builds only (host sends it when ~/.oneclick-dev exists)
    const p = pending.get(m.id);
    if (m.type === "progress") return p && p.onProgress && p.onProgress(m.pct);
    if (p) { pending.delete(m.id); p.resolve(m); }
  });
  port.onDisconnect.addListener(() => {
    const err = (chrome.runtime.lastError && chrome.runtime.lastError.message) || "Helper disconnected";
    port = null;
    for (const p of pending.values()) p.reject(new Error(err));
    pending.clear();
  });
  return port;
}

function call(msg, onProgress) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject, onProgress });
    try { connect().postMessage({ ...msg, id }); } catch (e) { pending.delete(id); reject(e); }
  });
}

// Tell the helper which build is running; keep the port open only in dev mode (auto-reload).
async function hello() {
  try {
    const r = await call({ type: "hello", version: chrome.runtime.getManifest().version });
    if (!r.dev && port) { port.disconnect(); port = null; }
  } catch { /* helper not installed: the dashboard explains how to set it up */ }
}

// ---- storage ----
async function get(key, fallback) {
  const r = await chrome.storage.local.get(key);
  return r[key] ?? fallback;
}
const addToLibrary = (meta) => locked(async () => {
  const lib = await get("library", []);
  const url = meta.webpage_url;
  const caption = String(meta.description || "").split("\n")[0].trim();
  const title = /^(Video|Photo) by /.test(meta.title || "") && caption ? caption.slice(0, 100) : meta.title;
  const entry = { ...meta, title, platform: meta.extractor_key || "Other", url, at: Date.now() };
  const i = lib.findIndex((v) => v.url === url);
  if (i >= 0) lib[i] = entry; else lib.push(entry);
  await chrome.storage.local.set({ library: lib });
});
const addError = (url, error) => locked(async () => {
  const errs = (await get("errors", [])).slice(-49);
  errs.push({ url, error, at: Date.now() });
  await chrome.storage.local.set({ errors: errs });
});
function setJob(id, patch) {
  jobs.set(id, { ...jobs.get(id), ...patch });
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    for (const [k, j] of jobs) if (jobs.size > 30 && (j.state === "done" || j.state === "error")) jobs.delete(k);
    chrome.storage.local.set({ jobs: [...jobs.values()] });
  }, 250);
}

// ---- UI helpers ----
function badge() {
  chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
  chrome.action.setBadgeText({ text: inflight ? String(inflight) : "" });
}
function notify(title, message) {
  chrome.notifications.create({ type: "basic", iconUrl: "icon.png", title, message });
}

// ---- actions ----
async function download(url, force = false) {
  const { quality = "best", folder = "", naming = "creator-title-id", skipDuplicates = true } = await get("settings", {});
  if (!force && skipDuplicates) {
    const key = dedupeKey(url);
    const seen = (await get("library", [])).find((v) => v.file && dedupeKey(v.url) === key);
    if (seen) return { ok: true, skipped: true, meta: seen };
  }
  const job = ++jobSeq;
  setJob(job, { id: job, url, state: "queued", pct: 0, at: Date.now() });
  inflight++; badge();
  try {
    const r = await call({ url, quality, folder, naming }, (pct) => setJob(job, { state: "running", pct }));
    if (r.ok) await addToLibrary(r.meta); else await addError(url, r.error);
    setJob(job, r.ok ? { state: "done", pct: 100 } : { state: "error", error: r.error });
    return r;
  } catch (e) {
    await addError(url, e.message);
    setJob(job, { state: "error", error: e.message });
    return { ok: false, error: e.message };
  } finally {
    inflight--; badge();
  }
}

async function oneClick(tab) {
  if (!/^https?:\/\//.test((tab && tab.url) || "")) return notify("Not a page", "Open a video page first.");
  const r = await download(tab.url, true); // a direct click always downloads
  if (r.ok) notify("Saved", (r.meta && r.meta.file) || "Download complete");
  else notify("Download failed", r.error + (/disconnect|not found|Specified native/i.test(r.error) ? " (open the dashboard to set up the helper)" : ""));
}

async function downloadAll(tab) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => [...document.links].map((a) => a.href) });
  const urls = videoUrls((res && res.result) || []);
  if (!urls.length) return notify("No videos found", "No TikTok, Instagram, YouTube or X video links on this page.");
  notify("Queued", `${urls.length} videos`);
  const results = await Promise.all(urls.map((u) => download(u)));
  const skipped = results.filter((r) => r.skipped).length;
  const ok = results.filter((r) => r.ok).length - skipped;
  notify("Batch finished", `${ok} saved${skipped ? `, ${skipped} already saved` : ""}, ${results.length - ok - skipped} failed`);
}

const openDashboard = () => chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });

chrome.action.onClicked.addListener(oneClick);

chrome.runtime.onStartup.addListener(hello);
chrome.runtime.onInstalled.addListener(() => {
  hello();
  chrome.contextMenus.create({ id: "dl-link", title: "Download video from this link", contexts: ["link"] });
  chrome.contextMenus.create({ id: "dl-all", title: "Download all videos on this page", contexts: ["action", "page"] });
  chrome.contextMenus.create({ id: "dashboard", title: "Open library & insights", contexts: ["action"] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "dl-link") return oneClick({ ...tab, url: info.linkUrl });
  if (info.menuItemId === "dl-all") return downloadAll(tab);
  if (info.menuItemId === "dashboard") return openDashboard();
});

// dashboard -> background
chrome.runtime.onMessage.addListener((m, _sender, send) => {
  const run = m.type === "ping" || m.type === "update" ? call({ type: m.type })
    : m.type === "download" ? Promise.all(videoUrls(m.urls || [], 200).map((u) => download(u))).then((rs) => ({ ok: rs.filter((r) => r.ok && !r.skipped).length, skipped: rs.filter((r) => r.skipped).length, failed: rs.filter((r) => !r.ok).length }))
    : null;
  if (!run) return false;
  run.then(send, (e) => send({ error: e.message }));
  return true;
});
