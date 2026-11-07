import { videoUrls } from "./urls.js";
import { newestBatch, batchCsv } from "./batch.js";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const short = (u) => String(u || "").replace(/^https?:\/\/(www\.)?/, "");
const send = (m) => chrome.runtime.sendMessage(m);
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

function now(kind, state, sub, button) {
  $("now").className = "now " + kind;
  $("now").innerHTML = `<div class="state">${esc(state)}</div><div class="sub" title="${esc(sub)}">${esc(sub)}</div>${button ? `<button id="again">${esc(button)}</button>` : ""}`;
}

// Which video is this tab showing? The URL, or (feeds) the most visible player on the page.
async function currentVideo() {
  if (tab && videoUrls([tab.url]).length) return videoUrls([tab.url])[0];
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["detect.js"] });
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.__oneclickDetect.current() });
    return r && r.result ? videoUrls([r.result])[0] || null : null;
  } catch { return null; }
}

async function oneClick(again = false) {
  const url = await currentVideo();
  if (!url) return now("", "No video on this tab", "Open a video, or use Select videos on a feed or profile.");
  const { settings = {} } = await chrome.storage.local.get("settings");
  if (!again && settings.autoDownload === false) return now("info", "Ready", short(url), "Download this video");
  const r = await send({ type: "enqueue", url, again });
  if (r.error) return now("bad", r.error, short(url));
  if (r.saved) return now("ok", "Already saved", r.title || short(url), "Download again");
  now("info", r.already ? "Already in the queue" : "Added to the queue", short(url));
}
$("now").addEventListener("click", (e) => { if (e.target.id === "again") oneClick(true); });

let lastJobs = [], paused = false;
function renderPause() {
  $("pause").textContent = paused ? "▶ Resume" : "⏸ Pause";
}
function renderJobs(jobs = []) {
  lastJobs = jobs;
  $("export").hidden = !newestBatch(jobs).length;
  const live = jobs.filter((j) => j.state === "queued" || j.state === "running");
  const run = jobs.filter((j) => j.state === "running").length;
  $("qsum").textContent = (live.length ? `${run} running · ${live.length - run} waiting` : jobs.length ? "all done" : "") + (paused && live.length ? " · paused" : "");
  $("clear").hidden = live.length === jobs.length;
  const label = { queued: "Waiting", running: "", done: "Saved", error: "Failed", canceled: "Canceled", skipped: "Skipped" };
  const btn = (a, id, t) => `<button class="x" data-a="${a}" data-id="${esc(id)}">${t}</button>`;
  const order = { running: 0, queued: 1 };
  const sorted = jobs.map((j, i) => ({ j, i })).sort((a, b) => (order[a.j.state] ?? 2) - (order[b.j.state] ?? 2) || (a.j.state in order ? a.i - b.i : b.i - a.i)).map((x) => x.j);
  $("jobs").innerHTML = sorted.slice(0, 30).map((j) => `<li class="${esc(j.state)}">
      <span class="t" title="${esc(j.url)}">${esc(j.title || short(j.url))}</span>
      <span class="s">${j.state === "running" ? (j.pct || 0) + "%" : label[j.state] || esc(j.state)}</span>
      ${j.state === "running" ? `<span class="bar"><i style="width:${Math.max(3, j.pct || 0)}%"></i></span>` : ""}
      ${j.state === "error" ? `<span class="err" title="${esc(j.error)}">${esc(j.error || "Unknown error")}</span>` : j.reason && (j.state === "skipped" || j.state === "queued") ? `<span class="err" title="${esc(j.reason)}">${esc(j.reason)}</span>` : ""}
      ${j.state === "queued" ? `<span class="acts">${btn("cancel", j.id, "Cancel")}</span>` : ""}
      ${j.state === "error" || j.state === "canceled" ? `<span class="acts">${btn("retry", j.id, "↻ Retry")}${btn("remove", j.id, "Remove")}</span>` : ""}</li>`).join("")
    || `<li class="empty">Nothing queued. Click the icon on a video, or use Select videos.</li>`;
}
$("jobs").addEventListener("click", (e) => { const b = e.target.closest("button[data-a]"); if (b) send({ type: "queue", action: b.dataset.a, id: b.dataset.id }); });
$("clear").onclick = () => send({ type: "queue", action: "clear" });
$("pause").onclick = () => send({ type: "queue", action: paused ? "resume" : "pause" });
$("export").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([batchCsv(lastJobs)], { type: "text/csv" }));
  a.download = "batch-" + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "") + ".csv";
  a.click(); URL.revokeObjectURL(a.href);
};

$("sel").onclick = async () => {
  try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["detect.js", "select.js"] }); window.close(); }
  catch (e) { now("bad", "Can't select on this page", e.message || String(e)); }
};
$("dash").onclick = () => { chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") }); window.close(); };

const { settings = {}, jobs = [], queuePaused = false } = await chrome.storage.local.get(["settings", "jobs", "queuePaused"]);
paused = !!queuePaused; renderPause();
$("auto").checked = settings.autoDownload !== false;
$("auto").onchange = async () => { const { settings: s = {} } = await chrome.storage.local.get("settings"); await chrome.storage.local.set({ settings: { ...s, autoDownload: $("auto").checked } }); };
renderJobs(jobs);
chrome.storage.onChanged.addListener((c) => {
  if (c.queuePaused) { paused = !!c.queuePaused.newValue; renderPause(); renderJobs(lastJobs); }
  if (c.jobs) renderJobs(c.jobs.newValue);
});
oneClick();
send({ type: "ping" }).then((r) => { const ok = r && r.type === "pong"; $("helper").className = "dot " + (ok ? "ok" : "bad"); $("helper").title = ok ? "Helper ready" : "Helper not installed: open the dashboard"; });
