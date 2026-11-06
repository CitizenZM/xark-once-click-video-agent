import { analyze, recommend } from "./insights.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const send = (m) => chrome.runtime.sendMessage(m);
const pct = (x) => (x == null ? "n/a" : (x * 100).toFixed(1) + "%");
const short = (n) => (n >= 1e9 ? (n / 1e9).toFixed(1) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n || 0));
const INSTALL = "curl -fsSL https://raw.githubusercontent.com/CitizenZM/one-click-downloader-20261106/main/install.sh | bash";

const bars = (items, empty = "No data yet") =>
  items.length
    ? items.map((i) => `<div class="bar"><span class="lab" title="${esc(i.k)}">${esc(i.k)}</span><span class="track"><span class="fill" style="display:block;width:${Math.max(4, (i.n / items[0].n) * 100)}%"></span></span><span class="val">${i.n}</span></div>`).join("")
    : `<p class="empty">${empty}</p>`;

async function renderSetup() {
  const el = $("#setup");
  el.innerHTML = `<b>Helper</b> <span class="note">checking…</span>`;
  const r = await send({ type: "ping" });
  if (!r || r.error || r.type !== "pong") {
    el.innerHTML = `<b class="bad">Helper not installed</b><p class="note">The extension needs a small local helper (it runs engine). Run this once in Terminal, then reload:</p><code>${esc(INSTALL)}</code> <button id="again" class="ghost">Check again</button>`;
    $("#again").onclick = renderSetup;
    return;
  }
  el.innerHTML = `<b class="ok">Helper ready</b> <span class="note">engine ${esc(r.engine || "missing")} · ffmpeg ${r.ffmpeg ? "found" : "missing"} · saving to <code>${esc(r.outDir)}</code></span> <button id="upd" class="ghost">Update engine</button> <span id="updMsg" class="note"></span>`;
  $("#upd").onclick = async () => { $("#updMsg").textContent = "updating…"; const u = await send({ type: "update" }); $("#updMsg").textContent = (u && (u.output || u.error)) || ""; renderSetup(); };
}

function renderJobs(jobs) {
  const live = jobs.filter((j) => j.state === "queued" || j.state === "running" || Date.now() - j.at < 120000);
  $("#queue").hidden = !live.length;
  $("#jobs").innerHTML = live.slice(-12).map((j) => `<div class="job ${esc(j.state)}"><span class="u" title="${esc(j.error || j.url)}">${esc(j.url.replace(/^https?:\/\/(www\.)?/, ""))}</span><span class="track"><span class="fill" style="display:block;width:${j.state === "queued" ? 0 : Math.max(4, j.pct || 0)}%"></span></span><span class="st">${j.state === "running" ? (j.pct || 0) + "%" : esc(j.state)}</span></div>`).join("");
}

function renderInsights(lib) {
  const a = analyze(lib);
  $("#kpis").innerHTML = [[a.total, "videos saved"], [a.creatorsCount, "creators"], [short(a.totalViews), "total views"], [pct(a.avgEngagement), "avg like rate"]]
    .map(([b, s]) => `<div class="kpi"><b>${esc(b)}</b><span>${s}</span></div>`).join("");
  $("#headlines").innerHTML = a.headlines.length ? a.headlines.map((h) => `<li>${esc(h)}</li>`).join("") : `<li class="empty">Download a few videos and insights appear here.</li>`;
  const days = a.perDay.slice(-14), maxd = Math.max(1, ...days.map((d) => d.n));
  $("#charts").innerHTML = `
    <div class="card"><h3>Platforms</h3>${bars(a.byPlatform)}</div>
    <div class="card"><h3>Video length</h3>${bars(a.buckets.map((b) => ({ k: b.k, n: b.n })).filter((b) => b.n).sort((x, y) => y.n - x.n))}</div>
    <div class="card"><h3>Top creators</h3>${bars(a.creators.slice(0, 6).map((c) => ({ k: c.k, n: c.n })))}</div>
    <div class="card"><h3>Top hashtags</h3>${bars(a.hashtags.slice(0, 8))}</div>
    <div class="card"><h3>Saved per day (last 14)</h3>${days.length ? `<div class="cols">${days.map((d) => `<div title="${esc(d.k)}: ${d.n}" style="height:${(d.n / maxd) * 100}%"></div>`).join("")}</div><div class="colsx">${days.map((d) => `<span>${esc(d.k.slice(8))}</span>`).join("")}</div>` : `<p class="empty">No data yet</p>`}</div>
    <div class="card"><h3>Most viewed</h3><ul class="list">${a.topVideos.map((v) => `<li><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title || v.url)}</a><small>${esc(v.uploader)} · ${short(v.view_count)} views</small></li>`).join("") || `<li class="empty">No data yet</li>`}</ul></div>`;
}

function renderRecs(lib) {
  const r = recommend(lib);
  const link = (u, t) => (u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t));
  $("#recs").innerHTML = `
    <div class="card"><h3>Creators to study</h3><ul class="list">${r.creators.map((c) => `<li>${link(c.url, c.name)} <small>${esc(c.platform)} · ${esc(c.basis)}</small></li>`).join("") || `<li class="empty">Save videos to see creators</li>`}</ul></div>
    <div class="card"><h3>Hashtags to explore</h3><ul class="list">${r.hashtags.map((h) => `<li>#${esc(h.tag)} <small>${h.uses} uses · ${h.links.map((l) => link(l.url, l.platform)).join(" · ") || "no platform link"}</small></li>`).join("") || `<li class="empty">No hashtags yet</li>`}</ul></div>
    <div class="card"><h3>Accounts mentioned in captions</h3><ul class="list">${r.mentions.map((m) => `<li>@${esc(m.handle)} <small>${esc(m.basis)}</small></li>`).join("") || `<li class="empty">No @-mentions found</li>`}</ul></div>
    <div class="card"><h3>Ad libraries</h3><ul class="list">${r.channels.map((c) => `<li>${link(c.url, c.name)}<small>${esc(c.why)}</small></li>`).join("")}</ul></div>`;
}

function renderTable(lib) {
  $("#count").textContent = `(${lib.length})`;
  const rows = [...lib].sort((a, b) => b.at - a.at);
  $("#table").innerHTML = `<tr><th>Saved</th><th>Platform</th><th>Creator</th><th>Title</th><th>Length</th><th>Views</th><th>Likes</th></tr>` +
    rows.map((v) => `<tr><td>${esc(new Date(v.at).toLocaleDateString())}</td><td>${esc(v.platform)}</td><td>${esc(v.uploader)}</td><td><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title || v.url)}</a></td><td>${v.duration ? v.duration + "s" : ""}</td><td>${short(v.view_count)}</td><td>${short(v.like_count)}</td></tr>`).join("");
}

const csvCell = (x) => `"${String(x ?? "").replace(/"/g, '""')}"`;
function save(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

async function load() {
  const { library = [], errors = [], settings = {}, jobs = [] } = await chrome.storage.local.get(["library", "errors", "settings", "jobs"]);
  renderJobs(jobs);
  renderInsights(library); renderRecs(library); renderTable(library);
  $("#quality").value = settings.quality || "best";
  $("#errors").innerHTML = errors.slice(-8).reverse().map((e) => `<li>${esc(new Date(e.at).toLocaleString())}: ${esc(e.error)} <small>(${esc(e.url)})</small></li>`).join("") || `<li class="empty" style="color:var(--mute)">None</li>`;
  $("#csv").onclick = () => save("library.csv", ["saved,platform,creator,title,url,duration,views,likes", ...library.map((v) => [new Date(v.at).toISOString(), v.platform, v.uploader, v.title, v.url, v.duration, v.view_count, v.like_count].map(csvCell).join(","))].join("\n"), "text/csv");
  $("#json").onclick = () => save("library.json", JSON.stringify(library, null, 2), "application/json");
  $("#clear").onclick = async () => { if (confirm("Delete the saved-video list? Downloaded files stay on disk.")) { await chrome.storage.local.set({ library: [], errors: [] }); load(); } };
}

$("#quality").onchange = (e) => chrome.storage.local.set({ settings: { quality: e.target.value } });
$("#go").onclick = async () => {
  const urls = $("#urls").value.split(/\s+/).filter(Boolean);
  if (!urls.length) return;
  $("#goStatus").textContent = "downloading…";
  const r = await send({ type: "download", urls });
  $("#goStatus").textContent = r.error ? r.error : `${r.ok} saved, ${r.failed} failed (only TikTok, Instagram, YouTube and X video links are accepted)`;
  load();
};

renderSetup();
load();
chrome.storage.onChanged.addListener((c) => {
  if (c.jobs) renderJobs(c.jobs.newValue || []);
  if (c.library || c.errors) load();
});
