import { videoUrls, dedupeKey } from "./urls.js";

const HOST = "com.barron.oneclick_dl";
let port = null;
let seq = 0;
const pending = new Map();
let devMode = false;
let idleTimer = null;
let lastHeal = 0;
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
    idleClose();
  });
  port.onDisconnect.addListener(() => {
    const err = (chrome.runtime.lastError && chrome.runtime.lastError.message) || "Helper disconnected";
    port = null;
    for (const p of pending.values()) p.reject(new Error(err));
    pending.clear();
  });
  return port;
}

// Release the helper process after a quiet minute (dev builds keep it for auto-reload).
function idleClose() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (port && !pending.size && !devMode) { port.disconnect(); port = null; } }, 60000);
  if (idleTimer.unref) idleTimer.unref(); // Node (tests) only; a no-op in the browser
}

function call(msg, onProgress) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Helper did not answer in time")); }, 20 * 60000);
    pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); }, onProgress });
    try { connect().postMessage({ ...msg, id }); } catch (e) { pending.delete(id); reject(e); }
  });
}

// Tell the helper which build is running; keep the port open only in dev mode (auto-reload).
async function hello() {
  try {
    const r = await call({ type: "hello", version: chrome.runtime.getManifest().version });
    devMode = !!r.dev;
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
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
  const entry = { ...meta, title, platform: meta.extractor_key || "Other", url, at: Date.now(),
    duration: num(meta.duration), view_count: num(meta.view_count), like_count: num(meta.like_count),
    comment_count: num(meta.comment_count), channel_follower_count: num(meta.channel_follower_count) };
  const i = lib.findIndex((v) => v.url === url);
  if (i >= 0) lib[i] = entry; else lib.push(entry);
  await chrome.storage.local.set({ library: lib.slice(-5000) }); // bounded: no unlimitedStorage needed
});
const addError = (url, error) => locked(async () => {
  const errs = (await get("errors", [])).slice(-49);
  errs.push({ url: String(url).replace(/[?#].*$/, ""), error: String(error).slice(0, 300), at: Date.now() }); // no query tokens
  await chrome.storage.local.set({ errors: errs });
});
// ---- download queue: persisted in storage ("jobs"), survives a service-worker restart, runs MAX_RUN at a time ----
const MAX_RUN = 3, KEEP_DONE = 50;
let queue = null;            // [{id,url,state:queued|running|done|error|canceled,pct,at,error,title}]
const waiters = new Map();   // job id -> [resolve]
const isLive = (j) => j.state === "queued" || j.state === "running";
async function loadQueue() {
  // a job that was running when the worker stopped never got its answer: queue it again
  if (!queue) queue = (await get("jobs", [])).map((j) => ({ ...j, id: String(j.id), ...(j.state === "running" ? { state: "queued", pct: 0 } : {}) })); // ids are strings (older builds stored numbers)
  return queue;
}
function flush() {
  badge();
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const done = queue.filter((j) => !isLive(j)), drop = new Set(done.slice(0, Math.max(0, done.length - KEEP_DONE)).map((j) => j.id));
    queue = queue.filter((j) => !drop.has(j.id));
    chrome.storage.local.set({ jobs: queue });
  }, 250);
}
const patchJob = (j, p) => { Object.assign(j, p); flush(); };
const waitFor = (id) => new Promise((res) => { if (!waiters.has(id)) waiters.set(id, []); waiters.get(id).push(res); });
function settle(j, r) { const ws = waiters.get(j.id) || []; waiters.delete(j.id); ws.forEach((f) => f(r)); }

function badge() {
  const n = queue ? queue.filter(isLive).length : 0;
  chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
  chrome.action.setBadgeText({ text: n ? String(n) : "" });
}
function notify(title, message) {
  chrome.notifications.create({ type: "basic", iconUrl: "icon.png", title, message });
}

// Add a video to the queue; resolves with the helper's result when that video is finished.
async function download(url, force = false) {
  const { skipDuplicates = true } = await get("settings", {});
  const key = dedupeKey(url);
  if (!force && skipDuplicates) {
    const seen = (await get("library", [])).find((v) => v.file && dedupeKey(v.url) === key);
    if (seen) return { ok: true, skipped: true, meta: seen };
  }
  await loadQueue();
  const live = queue.find((j) => isLive(j) && dedupeKey(j.url) === key); // clicked again while queued: same job
  if (live) return waitFor(live.id);
  const j = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), url, state: "queued", pct: 0, at: Date.now() };
  queue.push(j);
  const done = waitFor(j.id);
  pump();
  return done;
}
function pump() {
  if (!queue) return;
  let running = queue.filter((j) => j.state === "running").length;
  for (const j of queue) {
    if (running >= MAX_RUN) break;
    if (j.state === "queued") { running++; j.state = "running"; run(j); }
  }
  flush();
}
async function run(j) {
  const { quality = "best", folder = "", naming = "creator-title-id" } = await get("settings", {});
  let r;
  try {
    const send = () => call({ url: j.url, quality, folder, naming }, (pct) => patchJob(j, { pct }));
    r = await send();
    // an old engine is the usual cause of sudden 403s: update once an hour at most, then retry
    if (!r.ok && /update engine/.test(r.error || "") && Date.now() - lastHeal > 3600000) {
      lastHeal = Date.now();
      await call({ type: "update" }).catch(() => {});
      r = await send();
    }
  } catch (e) { r = { ok: false, error: e.message }; }
  if (r.ok) await addToLibrary(r.meta); else await addError(j.url, r.error);
  patchJob(j, r.ok ? { state: "done", pct: 100, title: (r.meta && r.meta.title) || "", file: (r.meta && r.meta.file) || "" } : { state: "error", error: r.error });
  settle(j, r);
  pump();
}
async function queueAction({ action, id }) {
  await loadQueue();
  const j = queue.find((x) => String(x.id) === String(id));
  if (action === "clear") queue = queue.filter(isLive);
  else if (!j) return { error: "not found" };
  else if (action === "cancel" && j.state === "queued") { patchJob(j, { state: "canceled" }); settle(j, { ok: false, error: "canceled" }); }
  else if (action === "retry" && (j.state === "error" || j.state === "canceled")) { queue = queue.filter((x) => x !== j); download(j.url, true); }
  else if (action === "remove" && !isLive(j)) queue = queue.filter((x) => x !== j);
  flush();
  return { ok: true };
}
loadQueue().then(pump).catch(() => {}); // resume after a worker restart

// Popup one-click: queue the current video unless it is already saved or queued (opening the popup again must not re-download).
async function enqueueOne({ url, again }) {
  const [c] = videoUrls([url]);
  if (!c) return { error: "Not a video link" };
  const key = dedupeKey(c);
  if (!again) {
    const saved = (await get("library", [])).find((v) => v.file && dedupeKey(v.url) === key);
    if (saved) return { saved: true, url: c, title: saved.title };
    await loadQueue();
    if (queue.some((j) => isLive(j) && dedupeKey(j.url) === key)) return { queued: true, already: true, url: c };
  }
  download(c, true).then((r) => r.ok || notify("Download failed", r.error));
  return { queued: true, url: c };
}

// Select mode: queue the ticked videos and answer at once; a notification reports the end of the batch.
async function enqueueMany({ hrefs, folder }) {
  const urls = videoUrls(hrefs || [], 200);
  if (!urls.length) return { error: "No video links selected" };
  const { skipDuplicates = true } = await get("settings", {});
  const have = new Set((await get("library", [])).filter((v) => v.file).map((v) => dedupeKey(v.url)));
  const saved = skipDuplicates ? urls.filter((u) => have.has(dedupeKey(u))) : [];
  if (saved.length && cleanFolder(folder)) await moveToFolder(saved, folder); // already saved: still file them
  const todo = urls.filter((u) => !saved.includes(u));
  downloadMany(todo, folder).then((r) => todo.length && notify("Queue finished", `${r.ok} saved${r.failed ? `, ${r.failed} failed` : ""}`));
  return { queued: todo.length, saved: saved.length };
}

async function oneClick(tab) {
  if (!/^https?:\/\//.test((tab && tab.url) || "")) { notify("Not a page", "Open a video page first."); return { ok: false, error: "Not a page" }; }
  const r = await download(tab.url, true); // a direct click always downloads
  if (r.ok) notify("Saved", (r.meta && r.meta.file) || "Download complete");
  else notify("Download failed", r.error + (/disconnect|not found|Specified native/i.test(r.error) ? " (open the dashboard to set up the helper)" : ""));
  return { ok: !!r.ok, error: r.error };
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

chrome.action.onClicked.addListener(oneClick); // only fires if the popup is removed
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "download-current") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) oneClick(tab);
});

async function maybeUpdate() {
  const { autoUpdate = true } = await get("settings", {});
  if (!autoUpdate || Date.now() - (await get("lastUpdate", 0)) < 7 * 86400000) return;
  const r = await call({ type: "update" });
  await chrome.storage.local.set({ lastUpdate: Date.now(), updateResult: r.output || "" });
}
const schedule = () => chrome.alarms.create("update", { periodInMinutes: 1440 });
chrome.alarms.onAlarm.addListener((a) => a.name === "update" && maybeUpdate().catch(() => {}));

chrome.runtime.onStartup.addListener(() => { hello(); schedule(); });
chrome.runtime.onInstalled.addListener(() => {
  hello(); schedule();
  chrome.contextMenus.create({ id: "dl-link", title: "Add this link to the download queue", contexts: ["link"] });
  chrome.contextMenus.create({ id: "select", title: "Select videos on this page…", contexts: ["action", "page"] });
  chrome.contextMenus.create({ id: "dl-all", title: "Download all videos on this page", contexts: ["action", "page"] });
  chrome.contextMenus.create({ id: "dashboard", title: "Open library & insights", contexts: ["action"] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "dl-link") return oneClick({ ...tab, url: info.linkUrl });
  if (info.menuItemId === "dl-all") return downloadAll(tab);
  if (info.menuItemId === "select") return chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["detect.js", "select.js"] }).catch((e) => notify("Cannot select here", String(e.message || e)));
  if (info.menuItemId === "dashboard") return openDashboard();
});

// ---- optional in-page button (content script is registered only after the user opts in) ----
async function setButtons(on) {
  try { await chrome.scripting.unregisterContentScripts({ ids: ["oneclick-button"] }); } catch { /* none registered */ }
  if (!on) return { ok: true };
  const origins = (chrome.runtime.getManifest().optional_host_permissions || []).filter((o) => !o.includes("anthropic.com"));
  await chrome.scripting.registerContentScripts([{ id: "oneclick-button", matches: origins, js: ["detect.js", "content.js"], runAt: "document_idle", persistAcrossSessions: true }]);
  return { ok: true };
}

function pageState({ href, hrefs }) {
  if (videoUrls([href]).length) return { kind: "single" };
  const n = videoUrls(hrefs || []).length;
  return n >= 2 ? { kind: "batch", n } : { kind: null };
}

async function pageDownload({ href, hrefs, folder }) {
  if (videoUrls([href]).length) {
    const r = await download(href, true);
    return r.ok ? { ok: 1, skipped: 0, failed: 0 } : { ok: 0, failed: 1, error: r.error };
  }
  const { ok, skipped, failed } = await downloadMany(videoUrls(hrefs || []), folder);
  return { ok, skipped, failed };
}

// Collections: a video's `folder` is a plain name; `folders` holds names that exist even when empty.
const cleanFolder = (f) => String(f || "").trim().slice(0, 60);
const addFolderName = (name) => locked(async () => {
  const f = cleanFolder(name);
  if (!f) return { error: "Enter a name" };
  const list = await get("folders", []);
  if (!list.includes(f)) await chrome.storage.local.set({ folders: [...list, f].slice(0, 200) });
  return { ok: true };
});
const deleteFolder = (name) => locked(async () => {
  const f = cleanFolder(name);
  await chrome.storage.local.set({ folders: (await get("folders", [])).filter((x) => x !== f), library: (await get("library", [])).map((v) => (v.folder === f ? { ...v, folder: undefined } : v)) });
  return { ok: true };
});
async function moveToFolder(urls, folder) {
  const f = cleanFolder(folder), keys = new Set(urls.map(dedupeKey));
  if (f) await addFolderName(f);
  return libEdit((lib) => lib.map((v) => (keys.has(dedupeKey(v.url)) ? { ...v, folder: f || undefined } : v)));
}
const summary = (rs) => ({ ok: rs.filter((r) => r.ok && !r.skipped).length, skipped: rs.filter((r) => r.skipped).length, failed: rs.filter((r) => !r.ok).length });
async function downloadMany(urls, folder) {
  const rs = await Promise.all(urls.map((u) => download(u)));
  if (cleanFolder(folder)) await moveToFolder(urls.filter((_, i) => rs[i].ok), folder);
  return { rs, ...summary(rs) };
}

// "Latest N from this profile": the helper lists the URLs, then each goes through the normal download path.
async function expandDownload({ url, limit }) {
  const r = await call({ type: "expand", url, limit });
  if (!r.ok) return { error: r.error };
  const urls = videoUrls(r.urls, 100); // same allowlist as every other batch path
  const rs = await Promise.all(urls.map((u) => download(u)));
  return { found: urls.length, ok: rs.filter((x) => x.ok && !x.skipped).length, skipped: rs.filter((x) => x.skipped).length, failed: rs.filter((x) => !x.ok).length };
}

// library edits run here so they share the storage lock with new downloads
const libEdit = (fn) => locked(async () => {
  const lib = await get("library", []);
  await chrome.storage.local.set({ library: fn(lib) });
  return { ok: true };
});

// dashboard / content script -> background
const CONTENT_TYPES = ["page-state", "page-download", "enqueue-many"];
chrome.runtime.onMessage.addListener((m, sender, send) => {
  // privileged actions only from our own pages; the content script may only ask about / download its own page
  const fromExtensionPage = typeof sender.url === "string" && sender.url.startsWith(chrome.runtime.getURL(""));
  if (CONTENT_TYPES.includes(m.type) ? !(sender.tab || fromExtensionPage) : !fromExtensionPage) { send({ error: "not allowed" }); return false; }
  if (m.type === "page-state") { send(pageState(m)); return false; }
  const run = m.type === "page-download" ? pageDownload(m)
    : m.type === "expand-download" ? expandDownload(m)
    : m.type === "lib-delete" ? libEdit((lib) => lib.filter((v) => v.url !== m.url))
    : m.type === "lib-note" ? libEdit((lib) => lib.map((v) => (v.url === m.url ? { ...v, note: String(m.note || "").slice(0, 500) } : v)))
    : m.type === "buttons" ? setButtons(!!m.on)
    : m.type === "ping" || m.type === "update" ? call({ type: m.type })
    : m.type === "download" ? downloadMany(videoUrls(m.urls || [], 200), m.folder).then(({ ok, skipped, failed }) => ({ ok, skipped, failed }))
    : m.type === "download-one" ? oneClick({ url: m.url })
    : m.type === "enqueue" ? enqueueOne(m)
    : m.type === "queue" ? queueAction(m)
    : m.type === "enqueue-many" ? enqueueMany(m)
    : m.type === "lib-folder" ? moveToFolder(videoUrls(m.urls || [], 500), m.folder)
    : m.type === "folder-add" ? addFolderName(m.name)
    : m.type === "folder-delete" ? deleteFolder(m.name)
    : null;
  if (!run) return false;
  run.then(send, (e) => send({ error: e.message }));
  return true;
});
