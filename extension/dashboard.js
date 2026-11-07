import { analyze, recommend, filterLibrary, outliers, creatorStats, formatStats, keywordStats, creativeBrief } from "./insights.js";
import { buildPrompt, ask, groupAssignments } from "./ai.js";
import { toTSV, toXLSX, toShareHTML } from "./export.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const send = (m) => chrome.runtime.sendMessage(m);
const pct = (x) => (x == null ? "n/a" : (x * 100).toFixed(1) + "%");
const link = (u) => (/^https?:\/\//.test(u) ? u : "#");
const short = (n) => (n >= 1e9 ? (n / 1e9).toFixed(1) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n || 0));
const INSTALL = "curl -fsSL https://raw.githubusercontent.com/CitizenZM/xark-once-click-video-agent/main/install.sh | bash";

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
    <div class="card"><h3>Outliers: beat their baseline</h3><ul class="list">${outliers(lib).map((o) => `<li><a href="${esc(link(o.video.url))}" target="_blank" rel="noopener">${esc(o.video.title || o.video.url)}</a><small>${esc(o.video.uploader)} · ${esc(o.basis)}</small></li>`).join("") || `<li class="empty">Needs a few saved videos per platform (or follower counts)</li>`}</ul></div>
    <div class="card"><h3>Like rate by platform</h3>${a.likeRateByPlatform.filter((p) => p.rate != null).map((p) => `<div class="bar"><span class="lab">${esc(p.k)}</span><span class="track"><span class="fill" style="display:block;width:${Math.max(4, (p.rate / Math.max(...a.likeRateByPlatform.map((x) => x.rate || 0))) * 100)}%"></span></span><span class="val">${pct(p.rate)}</span></div>`).join("") || `<p class="empty">No data yet</p>`}</div>
    <div class="card"><h3>Most viewed</h3><ul class="list">${a.topVideos.map((v) => `<li><a href="${esc(link(v.url))}" target="_blank" rel="noopener">${esc(v.title || v.url)}</a><small>${esc(v.uploader)} · ${short(v.view_count)} views</small></li>`).join("") || `<li class="empty">No data yet</li>`}</ul></div>`;
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

let all = [];
let view = [], shown = 200, current = [], folders = [];
const allFolders = (lib, stored) => [...new Set([...stored, ...lib.map((v) => v.folder).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
const opts = (first, list, counts) => `<option value="${first[0]}">${esc(first[1])}</option>` + list.map((f) => `<option value="${esc(f)}">${esc(f)}${counts ? ` (${counts[f] || 0})` : ""}</option>`).join("");
// "Hook" = what is said in the first 3 seconds (from the local transcript); a link to make one when the file is saved.
const hookCell = (v) => v.hook ? esc(v.hook) : v.noSpeech ? "<small>No speech</small>" : v.transcript ? "<small>-</small>"
  : v.file ? `<a href="#" class="tr-btn" data-url="${esc(v.url)}">Transcribe</a>` : "";
function renderTable(lib) {
  current = lib;
  const plats = [...new Set(lib.map((v) => v.platform))].sort();
  const sel = $("#fplat"), keep = sel.value;
  sel.innerHTML = `<option value="">All platforms</option>` + plats.map((p) => `<option>${esc(p)}</option>`).join("");
  sel.value = plats.includes(keep) ? keep : "";
  const counts = {}; for (const v of lib) if (v.folder) counts[v.folder] = (counts[v.folder] || 0) + 1;
  const fc = $("#fcol"), fkeep = fc.value;
  fc.innerHTML = opts(["", "All collections"], folders, counts).replace("</option>", `</option><option value="__none">Unfiled (${lib.filter((v) => !v.folder).length})</option>`);
  fc.value = fkeep === "__none" || folders.includes(fkeep) ? fkeep : "";
  $("#delcol").hidden = !folders.includes(fc.value);
  for (const id of ["#mvcol", "#dcol"]) { const el = $(id), k = el.value; el.innerHTML = opts(["", id === "#mvcol" ? "(unfiled)" : "(none)"], folders); el.value = folders.includes(k) ? k : ""; }
  const rows = filterLibrary(lib, { q: $("#q").value, platform: sel.value, sort: $("#fsort").value, folder: fc.value });
  view = rows;
  $("#count").textContent = rows.length === lib.length ? `(${lib.length})` : `(${rows.length} of ${lib.length})`;
  $("#table").innerHTML = `<tr><th><input type="checkbox" id="tickall" title="Tick all shown"></th><th>Saved</th><th>Collection</th><th>Platform</th><th>Creator</th><th>Title</th><th>Hook</th><th>Length</th><th>Views</th><th>Likes</th><th>Note</th><th></th></tr>` +
    rows.slice(0, shown).map((v) => `<tr><td><input type="checkbox" class="tick" data-url="${esc(v.url)}"></td><td>${esc(new Date(v.at).toLocaleDateString())}</td><td>${v.folder ? esc(v.folder) : ""}</td><td>${esc(v.platform)}</td><td>${esc(v.uploader)}</td><td><a href="${esc(link(v.url))}" target="_blank" rel="noopener">${esc(v.title || v.url)}</a></td><td class="hook">${hookCell(v)}</td><td>${v.duration ? esc(Number(v.duration)) + "s" : ""}</td><td>${short(v.view_count)}</td><td>${short(v.like_count)}</td><td><a href="#" class="note-btn" data-url="${esc(v.url)}">${v.note ? esc(v.note) : "+ add"}</a></td><td><a href="#" class="del-btn" data-url="${esc(v.url)}" title="Remove from list (file stays on disk)">✕</a></td></tr>`).join("") +
    (rows.length > shown ? `<tr><td colspan="12"><a href="#" id="more">Show more (${rows.length - shown} hidden)</a></td></tr>` : "");
}
$("#table").addEventListener("click", async (e) => {
  const t = e.target.closest("a"); if (!t) return;
  if (t.id === "more") { e.preventDefault(); shown += 200; return renderTable(current); }
  if (!t.dataset.url) return;
  e.preventDefault();
  if (t.classList.contains("tr-btn")) { t.textContent = "Transcribing…"; const r = await send({ type: "transcribe-one", url: t.dataset.url }); if (r && !r.ok) { t.textContent = "Transcribe"; alert((r && r.error) || "Transcription failed"); } }
  else if (t.classList.contains("del-btn")) { if (confirm("Remove this video from the list? The file stays on disk.")) await send({ type: "lib-delete", url: t.dataset.url }); }
  else { const v = current.find((x) => x.url === t.dataset.url); const note = prompt("Note (use #tags to group)", (v && v.note) || ""); if (note !== null) await send({ type: "lib-note", url: t.dataset.url, note }); }
});
$("#table").addEventListener("change", (e) => { if (e.target.id === "tickall") document.querySelectorAll(".tick").forEach((c) => (c.checked = e.target.checked)); });
const ticked = () => [...document.querySelectorAll(".tick:checked")].map((c) => c.dataset.url);
$("#mv").onclick = async () => { const urls = ticked(); if (!urls.length) return alert("Tick some videos first"); await send({ type: "lib-folder", urls, folder: $("#mvcol").value }); };
$("#newcol").onclick = async () => { const name = prompt("Collection name"); if (!name) return; const r = await send({ type: "folder-add", name }); if (r && r.error) alert(r.error); };
$("#delcol").onclick = async () => { const f = $("#fcol").value; if (confirm(`Delete collection "${f}"? Its videos stay in the library as unfiled.`)) { await send({ type: "folder-delete", name: f }); $("#fcol").value = ""; } };
$("#copy").onclick = async () => { const text = view.map((v) => v.url).join("\n"); await navigator.clipboard.writeText(text); $("#copy").textContent = `Copied ${view.length}`; setTimeout(() => ($("#copy").textContent = "Copy links in this view"), 1500); };
for (const id of ["#q", "#fplat", "#fsort", "#fcol"]) $(id).addEventListener("input", () => { shown = 200; renderTable(current); });

const csvCell = (x) => `"${String(x ?? "").replace(/"/g, '""')}"`;
function save(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

async function load() {
  const { library = [], errors = [], settings = {}, jobs = [], folders: stored = [] } = await chrome.storage.local.get(["library", "errors", "settings", "jobs", "folders"]);
  folders = allFolders(library, stored);
  renderJobs(jobs);
  all = library; renderScopeOptions(library); renderAnalysis(); renderTable(library);
  $("#quality").value = settings.quality || "best";
  $("#naming").value = settings.naming || "creator-title-id";
  $("#folder").value = settings.folder || "";
  $("#skipdup").checked = settings.skipDuplicates !== false;
  $("#autoupd").checked = settings.autoUpdate !== false;
  $("#autotr").checked = !!settings.autoTranscribe;
  $("#btns").checked = !!settings.showButton;
  $("#parallel").value = String(settings.parallel ?? 3);
  $("#waitsec").value = String(settings.waitSec ?? 0);
  $("#maxmin").value = String(settings.maxMinutes ?? 0);
  $("#errors").innerHTML = errors.slice(-8).reverse().map((e) => `<li>${esc(new Date(e.at).toLocaleString())}: ${esc(e.error)} <small>(${esc(e.url)})</small></li>`).join("") || `<li class="empty" style="color:var(--mute)">None</li>`;
  $("#csv").onclick = () => save("library.csv", ["saved,collection,platform,creator,title,url,duration,views,likes", ...library.map((v) => [new Date(v.at).toISOString(), v.folder, v.platform, v.uploader, v.title, v.url, v.duration, v.view_count, v.like_count].map(csvCell).join(","))].join("\n"), "text/csv");
  $("#json").onclick = () => save("library.json", JSON.stringify(library, null, 2), "application/json");
  const stamp = () => new Date().toISOString().slice(0, 10);
  const exportMsg = (t) => { $("#exportMsg").textContent = t; };
  $("#tsv").onclick = async () => { try { await navigator.clipboard.writeText(toTSV(view)); exportMsg(`Copied ${view.length} rows — paste into Google Sheets`); } catch (e) { exportMsg("Copy failed: " + e.message); } };
  $("#xlsx").onclick = () => save(`library-${stamp()}.xlsx`, toXLSX(view), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  $("#share").onclick = () => {
    const name = ($("#fcol").value && $("#fcol").value !== "__none" ? $("#fcol").value : "Library");
    save(`${name.replace(/[^\w.-]+/g, "_")}.html`, toShareHTML({ name, videos: view, generatedAt: Date.now() }), "text/html");
  };
  $("#clear").onclick = async () => { if (confirm("Delete the saved-video list? Downloaded files stay on disk.")) { await chrome.storage.local.set({ library: [], errors: [] }); load(); } };
}

async function saveSettings() {
  const { settings: prev = {} } = await chrome.storage.local.get("settings");
  const settings = { ...prev, quality: $("#quality").value, naming: $("#naming").value, folder: $("#folder").value.trim(), skipDuplicates: $("#skipdup").checked, autoUpdate: $("#autoupd").checked, autoTranscribe: $("#autotr").checked, showButton: $("#btns").checked, parallel: Number($("#parallel").value), waitSec: Number($("#waitsec").value), maxMinutes: Number($("#maxmin").value) };
  await chrome.storage.local.set({ settings });
  $("#setMsg").textContent = "Saved";
  setTimeout(() => ($("#setMsg").textContent = ""), 1500);
}
for (const id of ["#quality", "#naming", "#folder", "#skipdup", "#autoupd", "#autotr", "#parallel", "#waitsec", "#maxmin"]) $(id).onchange = saveSettings;
$("#btns").onchange = async (e) => {
  const origins = chrome.runtime.getManifest().optional_host_permissions.filter((o) => !o.includes("anthropic.com"));
  if (e.target.checked) {
    if (!(await chrome.permissions.request({ origins }))) { e.target.checked = false; return; }
  } else {
    await chrome.permissions.remove({ origins }).catch(() => {});
  }
  await send({ type: "buttons", on: e.target.checked });
  saveSettings();
};
$("#go").onclick = async () => {
  const urls = $("#urls").value.split(/\s+/).filter(Boolean);
  if (!urls.length) return;
  $("#goStatus").textContent = "downloading…";
  const r = await send({ type: "download", urls, folder: $("#dcol").value });
  $("#goStatus").textContent = r.error ? r.error : `${r.ok} saved, ${r.skipped} already saved, ${r.failed} failed (only TikTok, Instagram, YouTube and X video links are accepted)`;
  load();
};

$("#pgo").onclick = async () => {
  const url = $("#profile").value.trim();
  if (!/^https?:\/\//.test(url)) return ($("#pStatus").textContent = "Enter a full https:// link");
  $("#pStatus").textContent = "Finding videos…";
  const r = await send({ type: "expand-download", url, limit: Number($("#plimit").value) });
  $("#pStatus").textContent = r.error ? r.error : `Found ${r.found}: ${r.ok} saved, ${r.skipped} already saved, ${r.failed} failed`;
  load();
};

// ---- AI assistant (own key, on click only) ----
const aiKey = async () => (await chrome.storage.local.get("aiKey")).aiKey || "";
async function aiInit() { $("#aikey").placeholder = (await aiKey()) ? "Key saved (hidden). Paste a new one to replace." : "Anthropic API key (sk-ant-…)"; }
$("#aisave").onclick = async () => {
  const k = $("#aikey").value.trim(); if (!k) return;
  if (!(await chrome.permissions.request({ origins: ["https://api.anthropic.com/*"] }))) return ($("#aiStatus").textContent = "Permission to reach api.anthropic.com was declined");
  await chrome.storage.local.set({ aiKey: k }); $("#aikey").value = ""; $("#aiStatus").textContent = "Key saved"; aiInit();
};
$("#aiclear").onclick = async () => { await chrome.storage.local.remove("aiKey"); await chrome.permissions.remove({ origins: ["https://api.anthropic.com/*"] }).catch(() => {}); $("#aiStatus").textContent = "Key removed"; aiInit(); };
const list = (title, arr, fmt) => (arr && arr.length ? `<h4>${title}</h4><ul>${arr.slice(0, 5).map((x) => `<li>${fmt(x)}</li>`).join("")}</ul>` : "");
async function runAi(mode) {
  const key = await aiKey(); if (!key) return ($("#aiStatus").textContent = "Save your API key first");
  const library = mode === "sort" ? all : scoped(); // recommendations and concepts follow the Analyze filter
  if (!library.length) return ($("#aiStatus").textContent = "Save a few videos first");
  const p = buildPrompt(mode, library, folders, { formats: formatStats(library).slice(0, 8), keywords: keywordStats(library).slice(0, 15) });
  if (mode === "sort" && !p.urls.length) return ($("#aiStatus").textContent = "Nothing unfiled");
  $("#aiStatus").textContent = "Asking the model…"; $("#aiOut").innerHTML = "";
  let res; try { res = await ask(key, p.text); } catch (e) { return ($("#aiStatus").textContent = "✗ " + e.message); }
  $("#aiStatus").textContent = "";
  if (mode === "sort") {
    const groups = groupAssignments(res, p.urls), n = Object.values(groups).reduce((a, g) => a + g.length, 0);
    if (!n) return ($("#aiOut").innerHTML = `<p class="empty">The model proposed nothing usable.</p>`);
    $("#aiOut").innerHTML = `<h4>Proposed collections (${n} videos)</h4><ul>${Object.entries(groups).map(([f, u]) => `<li>${esc(f)}: ${u.length}</li>`).join("")}</ul><button id="apply">Apply</button>`;
    $("#apply").onclick = async () => { for (const [f, urls] of Object.entries(groups)) await send({ type: "lib-folder", urls, folder: f }); $("#aiOut").innerHTML = `<p class="note">Applied.</p>`; };
    return;
  }
  const q = (x) => esc(x == null ? "" : x);
  if (mode === "brief") {
    $("#aiOut").innerHTML = `<div class="grid">${(res.concepts || []).slice(0, 5).map((c) => `<div class="card concept"><h4>${q(c.name)}</h4>
      <p><b>Format:</b> ${q(c.format)} · <b>Length:</b> ${q(c.length)}</p><p><b>Hook (first 2s):</b> “${q(c.hook)}”</p>
      <ol>${(c.beats || []).slice(0, 6).map((b) => `<li>${q(b)}</li>`).join("")}</ol><p><b>CTA:</b> ${q(c.cta)}</p><p class="note">${q(c.why)}</p></div>`).join("")}</div>`;
    return;
  }
  $("#aiOut").innerHTML = `<p class="sum">${q(res.summary)}</p>` + list("Patterns", res.patterns, q) + list("Hooks to test", res.hooks, q)
    + list("Searches to try", res.search_ideas, (x) => `${q(x.platform)}: <b>${q(x.query)}</b> <small>${q(x.why)}</small>`)
    + list("Accounts to check (AI guesses: verify they exist)", res.accounts_to_verify, (x) => `${q(x.platform)} @${q(String(x.handle || "").replace(/^@/, ""))} <small>${q(x.why)}</small>`);
}
$("#airec").onclick = () => runAi("recommend");
$("#aibrief").onclick = () => runAi("brief");
$("#aisort").onclick = () => runAi("sort");
aiInit();

renderSetup();
load();
chrome.storage.onChanged.addListener((c) => {
  if (c.jobs) renderJobs(c.jobs.newValue || []);
  if (c.library || c.errors || c.folders) load();
});


// ---------- tabs ----------
const TABS = ["overview", "creators", "formats", "keywords", "ideas", "library", "download", "settings"];
function showTab() {
  const t = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "overview";
  document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.dataset.tab !== t));
  document.querySelectorAll("#tabs a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + t));
  $("#scope").hidden = !["overview", "creators", "formats", "keywords", "ideas"].includes(t);
}
addEventListener("hashchange", showTab);
showTab();
const goLibrary = (q) => { $("#q").value = q; $("#fcol").value = ""; $("#fplat").value = ""; location.hash = "#library"; renderTable(all); };

// ---------- Analyze scope (collection / platform / period) ----------
function renderScopeOptions(lib) {
  for (const [id, list, first] of [["#scol", folders, "All collections"], ["#splat", [...new Set(lib.map((v) => v.platform))].sort(), "All platforms"]]) {
    const el = $(id), keep = el.value;
    el.innerHTML = `<option value="">${first}</option>` + (id === "#scol" ? `<option value="__none">Unfiled</option>` : "") + list.map((x) => `<option>${esc(x)}</option>`).join("");
    el.value = [...el.options].some((o) => o.value === keep) ? keep : "";
  }
}
function scoped() {
  const col = $("#scol").value, plat = $("#splat").value, days = Number($("#sdays").value);
  const since = days ? Date.now() - days * 86400000 : 0;
  return all.filter((v) => (!col || (col === "__none" ? !v.folder : v.folder === col)) && (!plat || v.platform === plat) && (v.at || 0) >= since);
}
function renderAnalysis() {
  const lib = scoped();
  $("#scount").textContent = lib.length === all.length ? `${lib.length} videos` : `${lib.length} of ${all.length} videos`;
  renderInsights(lib); renderRecs(lib); renderCreators(lib); renderFormats(lib); renderKeywords(lib); renderBrief(lib);
}
for (const id of ["#scol", "#splat", "#sdays"]) $(id).addEventListener("change", renderAnalysis);

// ---------- sortable tables ----------
const sorts = {};
function sortable(el, key, cols, rows, empty) {
  const st = sorts[key] || (sorts[key] = { by: cols.find((c) => c.def)?.k || cols[0].k, dir: -1 });
  const val = (r, k) => { const v = cols.find((c) => c.k === k).v(r); return v == null ? -Infinity : v; };
  const sorted = [...rows].sort((a, b) => { const x = val(a, st.by), y = val(b, st.by); return (typeof x === "string" ? x.localeCompare(y) : x - y) * st.dir; });
  el.innerHTML = `<tr>${cols.map((c) => `<th data-k="${c.k}" class="${c.num ? "num" : ""} ${st.by === c.k ? "on" : ""}" title="${esc(c.tip || "Sort")}">${esc(c.h)}${st.by === c.k ? (st.dir < 0 ? " ↓" : " ↑") : ""}</th>`).join("")}</tr>` +
    (sorted.length ? sorted.slice(0, 300).map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? "num" : ""}">${c.html(r)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${cols.length}" class="empty">${empty}</td></tr>`);
  el.onclick = (e) => {
    const th = e.target.closest("th[data-k]");
    if (th) { st.dir = st.by === th.dataset.k ? -st.dir : -1; st.by = th.dataset.k; return sortable(el, key, cols, rows, empty); }
    const a = e.target.closest("a[data-go]"); if (a) { e.preventDefault(); goLibrary(a.dataset.go); }
  };
}
const liftHtml = (x) => (x == null ? "" : `<span class="lift ${x >= 1.5 ? "hi" : x < 0.75 ? "lo" : ""}">${x.toFixed(1)}x</span>`);
const go = (q, text) => `<a href="#" data-go="${esc(q)}">${esc(text)}</a>`;
const secs = (x) => (x ? Math.round(x) + "s" : "");

function renderCreators(lib) {
  const q = $("#cq").value.trim().toLowerCase();
  const rows = creatorStats(lib).filter((c) => !q || c.creator.toLowerCase().includes(q));
  sortable($("#ctable"), "creators", [
    { k: "creator", h: "Creator", v: (r) => r.creator.toLowerCase(), html: (r) => go(r.creator, r.creator) + `<small>${esc(r.platform)}${r.formats.length ? " · " + esc(r.formats.join(", ")) : ""}</small>` },
    { k: "n", h: "Saved", num: 1, def: 1, v: (r) => r.n, html: (r) => r.n },
    { k: "median", h: "Median views", num: 1, v: (r) => r.medianViews, html: (r) => short(r.medianViews) },
    { k: "lift", h: "Lift", num: 1, tip: "Their median views ÷ the median of this view", v: (r) => r.lift, html: (r) => liftHtml(r.lift) },
    { k: "like", h: "Like rate", num: 1, v: (r) => r.avgLikeRate, html: (r) => pct(r.avgLikeRate) },
    { k: "followers", h: "Followers", num: 1, v: (r) => r.followers, html: (r) => (r.followers ? short(r.followers) : "") },
    { k: "vpf", h: "Views / follower", num: 1, tip: "Median views ÷ followers: above 1 means they reach beyond their audience", v: (r) => r.viewsPerFollower, html: (r) => (r.viewsPerFollower != null ? r.viewsPerFollower.toFixed(2) : "") },
    { k: "len", h: "Avg length", num: 1, v: (r) => r.avgSeconds, html: (r) => secs(r.avgSeconds) },
    { k: "tags", h: "Top hashtags", v: (r) => r.tags.join(" "), html: (r) => r.tags.map((t) => go("#" + t, "#" + t)).join(" ") },
    { k: "best", h: "Best video", v: (r) => r.best.view_count || 0, html: (r) => `<a href="${esc(link(r.best.url))}" target="_blank" rel="noopener">${esc((r.best.title || r.best.url).slice(0, 60))}</a>` },
  ], rows, "Save a few videos to see creators.");
}
$("#cq").addEventListener("input", () => renderCreators(scoped()));

function renderFormats(lib) {
  const rows = formatStats(lib);
  const top = rows.filter((r) => r.format !== "Other" && r.lift != null).sort((a, b) => b.lift - a.lift).slice(0, 8), max = Math.max(1, ...top.map((r) => r.lift));
  $("#fchart").innerHTML = `<h3>Which formats get the most views <span class="note">(median views vs your typical saved video)</span></h3>` +
    (top.length ? top.map((r) => `<div class="bar"><span class="lab">${esc(r.format)}</span><span class="track"><span class="fill ${r.lift >= 1 ? "" : "low"}" style="display:block;width:${Math.max(4, (r.lift / max) * 100)}%"></span></span><span class="val">${r.lift.toFixed(1)}x</span></div>`).join("") : `<p class="empty">Needs saved videos with captions.</p>`);
  sortable($("#ftable"), "formats", [
    { k: "format", h: "Format", v: (r) => r.format, html: (r) => esc(r.format) },
    { k: "n", h: "Videos", num: 1, def: 1, v: (r) => r.n, html: (r) => r.n },
    { k: "median", h: "Median views", num: 1, v: (r) => r.medianViews, html: (r) => short(r.medianViews) },
    { k: "lift", h: "Lift", num: 1, v: (r) => r.lift, html: (r) => liftHtml(r.lift) },
    { k: "like", h: "Like rate", num: 1, v: (r) => r.avgLikeRate, html: (r) => pct(r.avgLikeRate) },
    { k: "len", h: "Avg length", num: 1, v: (r) => r.avgSeconds, html: (r) => secs(r.avgSeconds) },
    { k: "ex", h: "Best example", v: (r) => r.example.view_count || 0, html: (r) => `<a href="${esc(link(r.example.url))}" target="_blank" rel="noopener">${esc((r.example.title || r.example.url).slice(0, 60))}</a> <small>${esc(r.example.uploader || "")}</small>` },
  ], rows, "No videos in this view.");
}

function renderKeywords(lib) {
  const q = $("#kq").value.trim().toLowerCase(), tagsOnly = $("#konlytags").checked;
  const rows = keywordStats(lib).filter((k) => (!q || k.keyword.includes(q)) && (!tagsOnly || k.keyword.startsWith("#")));
  const cloud = [...rows].sort((a, b) => b.n - a.n).slice(0, 40), maxN = Math.max(1, ...cloud.map((k) => k.n));
  $("#kcloud").innerHTML = cloud.map((k) => `<a href="#" data-go="${esc(k.keyword)}" class="${k.lift >= 1.5 ? "hi" : ""}" style="font-size:${12 + Math.round((k.n / maxN) * 12)}px" title="${k.n} videos · ${k.lift ? k.lift.toFixed(1) + "x views" : ""}">${esc(k.keyword)}</a>`).join("") || `<p class="empty">Needs 2+ videos sharing a word.</p>`;
  sortable($("#ktable"), "keywords", [
    { k: "keyword", h: "Keyword", v: (r) => r.keyword, html: (r) => go(r.keyword, r.keyword) },
    { k: "n", h: "Videos", num: 1, def: 1, v: (r) => r.n, html: (r) => r.n },
    { k: "creators", h: "Creators", num: 1, v: (r) => r.creators, html: (r) => r.creators },
    { k: "median", h: "Median views", num: 1, v: (r) => r.medianViews, html: (r) => short(r.medianViews) },
    { k: "lift", h: "Lift", num: 1, v: (r) => r.lift, html: (r) => liftHtml(r.lift) },
    { k: "like", h: "Like rate", num: 1, v: (r) => r.avgLikeRate, html: (r) => pct(r.avgLikeRate) },
  ], rows, "No keyword appears in 2 or more videos yet.");
}
$("#kq").addEventListener("input", () => renderKeywords(scoped()));
$("#konlytags").addEventListener("change", () => renderKeywords(scoped()));
$("#kcloud").addEventListener("click", (e) => { const a = e.target.closest("a[data-go]"); if (a) { e.preventDefault(); goLibrary(a.dataset.go); } });

function renderBrief(lib) {
  const b = creativeBrief(lib);
  if (!b) return ($("#brief").innerHTML = `<div class="card"><p class="empty">Save at least 3 videos (with captions) to get a brief.</p></div>`);
  $("#brief").innerHTML = `<div class="card"><h3>What to make next</h3><ul class="list">${b.ideas.map((i) => `<li>${esc(i.title)}<small>${esc(i.basis)}</small></li>`).join("") || `<li class="empty">Not enough repeated formats or keywords yet.</li>`}</ul></div>
    <div class="card"><h3>Opening lines that worked</h3><ul class="list">${b.hooks.map((h) => `<li>“${esc(h.slice(0, 140))}”</li>`).join("") || `<li class="empty">No captions yet.</li>`}</ul><p class="note">First caption lines of your most viewed saved videos: reuse the structure, not the words.</p></div>
    <div class="card"><h3>Creators to model</h3><ul class="list">${b.topCreators.map((c) => `<li>${go(c, c)}</li>`).join("") || `<li class="empty">Save 2+ videos from a creator.</li>`}</ul></div>`;
  $("#brief").onclick = (e) => { const a = e.target.closest("a[data-go]"); if (a) { e.preventDefault(); goLibrary(a.dataset.go); } };
}
