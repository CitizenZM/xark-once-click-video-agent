// Projects tab: one research project at a time. Accounts and videos to look at next, keywords and products (product mode),
// opportunities, a remix clip bank and the AI plan. Pure numbers come from projects.js; this file only renders and wires buttons.
import { projectVideos, recommendAccounts, scanSummary, recommendedVideos, topKeywords, searchLinks, productStats, productFilter, needsTags,
  opportunities, remixBank, clipListTSV, winnerScore, ts } from "./projects.js";
import { keywordStats, baselines } from "./insights.js";
import { creatorBaselines } from "./winners.js";
import { buildPlanPrompt } from "./ai.js";

export function initProjects(ctx) {
  const { $, esc, send, short, link, ask, aiKey, getAll, getProjects, openScript, tagVideos } = ctx;
  let product = ""; // product mode: "" = whole project
  const sel = $("#pjsel"), body = $("#pjbody"), msg = (t) => ($("#pjMsg").textContent = t || "");
  const a = (u, t, cls = "") => `<a href="${esc(link(u))}" target="_blank" rel="noopener" class="${cls}">${esc(t)}</a>`;
  const current = () => getProjects().find((p) => p.id === sel.value) || null;
  const links = (term, prod) => searchLinks(term, { product: prod }).map((l) => a(l.url, l.name)).join(" · ");
  const liftTxt = (x, by) => (x == null ? "–" : `<span class="lift ${x >= 1.5 ? "hi" : x < 0.75 ? "lo" : ""}">${x.toFixed(1)}x${by === "likes" ? " <small>likes</small>" : ""}</span>`);

  function renderSelect() {
    const list = getProjects(), keep = sel.value;
    sel.innerHTML = list.length ? list.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${p.urls.length})</option>`).join("") : `<option value="">No projects yet</option>`;
    sel.value = list.some((p) => p.id === keep) ? keep : (list[0] && list[0].id) || "";
    for (const id of ["#pjedit", "#pjdel", "#pjaddgo"]) $(id).disabled = !list.length;
  }

  function render() {
    renderSelect();
    const p = current(), lib = getAll();
    if (!p) return (body.innerHTML = `<div class="card"><p class="empty">Create a project for one product or question (for example “Air fryer ads Q4”), then add videos to it: a whole collection here, or ticked videos in the Library tab.</p></div>`);
    const all = projectVideos(lib, p);
    const prods = productStats(all);
    if (product && !prods.some((x) => x.product === product)) product = "";
    const videos = productFilter(all, product), recs = recommendAccounts(lib, p, videos);
    const base = baselines(videos), bases = creatorBaselines(videos);
    const kws = keywordStats(videos).filter((k) => k.n >= 2 || videos.length < 4).slice(0, 18);
    const opp = opportunities(videos, lib), bank = remixBank(videos), recVids = recommendedVideos(p, lib);
    const prodRow = prods.find((x) => x.product === product);
    body.innerHTML = `
      ${product ? `<div class="card mode"><b>Product mode: ${esc(product)}</b> <span class="note">${esc(prodRow.category)}${prodRow.brand ? " · " + esc(prodRow.brand) : ""} · ${videos.length} of ${all.length} project videos</span>
        <div class="row"><span class="note">Find more:</span> ${links(product, true)}</div>
        <div class="row"><button id="pjProdScript">Write a script for this product</button><button id="pjProdExit" class="ghost">Exit product mode</button></div></div>` : ""}
      <p class="note">${p.product ? `For: ${esc(p.product)} · ` : ""}${all.length} videos · ${new Set(all.map((v) => v.uploader || v.uploader_id)).size} creators · ${p.scans.length} account scan${p.scans.length === 1 ? "" : "s"}</p>
      ${all.length ? "" : `<div class="card"><p class="empty">No videos in this project yet. Add a collection above, or tick videos in the Library tab and press “Add ticked to project”.</p></div>`}

      <h3>Accounts to study next</h3>
      <p class="note">New accounts: @-mentioned in this project's videos, or saved elsewhere in your library with the project's keywords. Then this project's own creators, best first. “Scan” lists an account's last 30 videos with their numbers (nothing is downloaded) and ranks them against that account's own median.</p>
      <div class="tablewrap"><table id="pjAccts"><tr><th>Account</th><th>Platform</th><th>Why</th><th></th></tr>
        ${recs.fresh.map((r) => acctRow(r, "new")).join("")}${recs.mine.slice(0, 10).map((r) => acctRow(r, "in project")).join("")}
        ${recs.fresh.length + recs.mine.length ? "" : `<tr><td colspan="4" class="empty">Add videos to the project first.</td></tr>`}</table></div>
      <div class="row"><input id="pjScanUrl" class="grow" placeholder="Scan any profile or channel: https://www.tiktok.com/@name"><button id="pjScanGo" class="ghost">Scan</button></div>

      <h3>Videos to look at <span class="note">(from your scans: unsaved videos at 1.5x+ of their own account's median)</span></h3>
      <div class="tablewrap"><table id="pjVids"><tr><th><input type="checkbox" id="pjVidAll"></th><th>Video</th><th>Account</th><th>Why</th><th>Views</th><th>Per hour</th></tr>
        ${recVids.map((x) => `<tr><td><input type="checkbox" class="pjVid" data-url="${esc(x.url)}"></td><td>${a(x.url, (x.title || x.url).slice(0, 70))}</td><td>${esc(x.account.replace(/^https:\/\/(www\.)?/, ""))}</td><td><span class="sig ${x.multiple >= 2 ? "hi" : ""}">${x.multiple.toFixed(1)}x</span> <small>${esc(x.basis)}</small></td><td>${short(x.view_count)}</td><td>${x.perHour ? short(Math.round(x.perHour)) + "/h" : "–"}</td></tr>`).join("")
          || `<tr><td colspan="6" class="empty">Scan an account above to get video picks.</td></tr>`}</table></div>
      ${recVids.length ? `<div class="row"><button id="pjVidGo">Download ticked into this project</button></div>` : ""}
      ${p.scans.length ? `<details><summary class="note">Scans (${p.scans.length})</summary><ul class="list">${p.scans.slice().reverse().map((s) => { const m = scanSummary(s, lib);
        return `<li>${a(s.account, s.account.replace(/^https:\/\/(www\.)?/, ""))}<small>${m.n} videos · median ${short(m.median)} ${esc(m.by || "")} · ${m.outliers.length} at 2x+ · ${esc(new Date(s.at).toLocaleString())}</small></li>`; }).join("")}</ul></details>` : ""}

      <div class="grid" style="margin-top:14px">
        <div class="card"><h3>Keywords</h3><p class="note">Words and hashtags in 2+ of these videos. Green = above the project median. Each has search links for finding more.</p>
          <ul class="list">${kws.map((k) => `<li><b class="${k.lift >= 1.5 ? "ok" : ""}">${esc(k.keyword)}</b> <small>${k.n} videos · ${k.creators} creators · ${k.lift != null ? k.lift.toFixed(1) + "x " + k.liftBy : "no numbers"} · ${links(k.keyword)}</small></li>`).join("") || `<li class="empty">Needs 2+ videos sharing a word.</li>`}</ul></div>
        <div class="card"><h3>Products</h3><p class="note">From the AI tags (product, category, brand). “Product mode” narrows this whole page to one product.</p>
          <div class="row"><button id="pjTag" class="ghost">Find products with AI (${all.filter(needsTags).length} to tag)</button><span id="pjTagMsg" class="note"></span></div>
          <ul class="list">${prods.map((x) => `<li><b>${esc(x.product)}</b> ${x.product === product ? "" : `<a href="#" class="pjMode" data-p="${esc(x.product)}">Product mode</a>`}<small>${esc(x.category || "")}${x.brand ? " · " + esc(x.brand) : ""} · ${x.n} videos · ${x.creators} creators · ${x.lift != null ? x.lift.toFixed(1) + "x " + x.liftBy : "no numbers"}${x.hooks.length ? " · hooks: " + esc(x.hooks.join(", ")) : ""}</small></li>`).join("") || `<li class="empty">No products yet: press “Find products with AI”.</li>`}</ul></div>
      </div>

      <h3>Opportunities</h3>
      <p class="note">From the numbers of the videos in this view: what to make more of, what to test, what to drop, and what is missing.</p>
      <ul class="list card">${opp.map((o) => `<li><span class="sig ${o.kind === "double down" ? "hi" : ""}">${esc(o.kind)}</span> ${esc(o.title)}<small>${esc(o.basis)}</small></li>`).join("") || `<li class="empty">Add more videos to see opportunities.</li>`}</ul>

      <h3>Remix bank</h3>
      <p class="note">Openers and closers of the strongest videos, with their seconds from the local transcript. Use them as an edit plan for footage you own or have licensed (or re-shoot the same structure); reposting a creator's clip needs their permission (Spark Ads / whitelisting).</p>
      <div class="tablewrap"><table><tr><th>Role</th><th>In–out</th><th>Line</th><th>From</th><th>Why this video</th></tr>
        ${bank.clips.map((c) => `<tr><td>${esc(c.role)}</td><td>${ts(c.start)}–${ts(c.end)}</td><td title="${esc(c.text)}">${esc(c.text.slice(0, 80)) || "<small>watch it</small>"}</td><td>${a(c.v.url, (c.v.title || c.v.url).slice(0, 40))}<small>${esc(c.v.uploader || "")}</small></td><td><small>${esc(c.basis)}</small></td></tr>`).join("")
          || `<tr><td colspan="5" class="empty">Needs videos with view or like counts; transcribe them to get the seconds.</td></tr>`}</table></div>
      ${bank.recipes.length ? `<div class="card" style="margin-top:10px"><b>Remix recipes</b><ol>${bank.recipes.map((r) => `<li>Open with “${esc(r.hook.text.slice(0, 60) || "the first 3s")}” (${esc(r.hook.v.uploader || "")}, ${ts(r.hook.start)}–${ts(r.hook.end)}) → body in the style of ${a(r.body.url, (r.body.title || r.body.url).slice(0, 40))} <small>${esc(r.bodyBasis)}</small>${r.cta ? ` → close with “${esc(r.cta.text.slice(0, 50))}” (${ts(r.cta.start)})` : ""}</li>`).join("")}</ol></div>` : ""}
      ${bank.clips.length ? `<div class="row"><button id="pjClips" class="ghost">Copy clip list (for your editor)</button><span id="pjClipsMsg" class="note"></span></div>` : ""}

      <h3>AI plan: remixes, new ads, tests <span class="note">(optional, uses your own key)</span></h3>
      <p class="note">Sends up to 30 of these videos (title, caption, numbers, labels, spoken lines with seconds) and the measured opportunities to api.anthropic.com.</p>
      <div class="row"><button id="pjPlan">${p.plan ? "Re-plan" : "Make the plan"}</button><span id="pjPlanMsg" class="note">${p.plan ? "Saved " + esc(new Date(p.plan.at).toLocaleString()) : ""}</span></div>
      <div id="pjPlanOut">${p.plan ? planHtml(p.plan, (p.plan.order || []).map((u) => lib.find((v) => v.url === u))) : ""}</div>`;
    wire(p, videos, all, prods, opp, bank, kws, base, bases);
  }

  function acctRow(r, kind) {
    return `<tr><td>${r.url ? a(r.url, "@" + String(r.handle).replace(/^@/, "")) : esc(r.handle)} <span class="sig ${kind === "new" ? "hi" : ""}">${kind}</span></td><td>${esc(r.platform)}</td><td><small>${esc(r.reasons.join(" · "))}</small></td>
      <td>${r.url ? `<a href="#" class="pjScan" data-url="${esc(r.url)}">${r.scanned ? "Re-scan" : "Scan"}</a>` : ""}</td></tr>`;
  }

  function planHtml(r, videos) {
    const q = (x) => esc(x == null ? "" : x), vid = (i) => videos[i];
    const src = (s) => { const v = vid(s.i); return `${q(s.use)}: ${v ? a(v.url, (v.title || v.url).slice(0, 36)) : "#" + q(s.i)} ${q(s.from)}–${q(s.to)}`; };
    return `<p class="sum">${q(r.summary)}</p><div class="grid">
      ${(r.remixes || []).slice(0, 3).map((x) => `<div class="card concept"><h4>Remix: ${q(x.name)} <span class="note">${q(x.length)}</span></h4><ul>${(x.sources || []).slice(0, 5).map((s) => `<li>${src(s)}</li>`).join("")}</ul>
        ${x.new_shots && x.new_shots.length ? `<p><b>New shots:</b> ${q(x.new_shots.slice(0, 4).join("; "))}</p>` : ""}<p><b>Voice-over:</b> ${q(x.voiceover)}</p><p class="note">${q(x.why)}</p></div>`).join("")}
      ${(r.new_ads || []).slice(0, 3).map((x) => `<div class="card concept"><h4>New ad: ${q(x.name)}</h4><p><b>${q(x.format)}</b> · ${q(x.angle)} · ${q(x.audience)}</p><p><b>Hook:</b> “${q(x.hook)}”</p><ol>${(x.beats || []).slice(0, 6).map((b) => `<li>${q(b)}</li>`).join("")}</ol><p class="note">${q(x.why)}</p></div>`).join("")}
      </div>
      ${r.tests && r.tests.length ? `<h4>Tests</h4><ul>${r.tests.slice(0, 3).map((t) => `<li><b>${q(t.variable)}</b>: ${q(t.a)} vs ${q(t.b)} <small>${q(t.why)}</small></li>`).join("")}</ul>` : ""}
      ${r.searches && r.searches.length ? `<h4>Searches to find more</h4><ul>${r.searches.slice(0, 5).map((s) => `<li>${q(s.platform)}: ${a(searchLinks(s.query).find((l) => String(s.platform || "").toLowerCase().includes(l.name.split(" ")[0].toLowerCase()))?.url || searchLinks(s.query)[0]?.url || "#", s.query)} <small>${q(s.why)}</small></li>`).join("")}</ul>` : ""}`;
  }

  function wire(p, videos, all, prods, opp, bank, kws, base, bases) {
    body.onclick = async (e) => {
      const t = e.target.closest("a.pjScan, a.pjMode"); if (!t) return;
      e.preventDefault();
      if (t.classList.contains("pjMode")) { product = t.dataset.p; render(); scrollTo(0, 0); return; }
      scan(p, t.dataset.url, t);
    };
    const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    on("#pjScanGo", () => { const u = $("#pjScanUrl").value.trim(); if (!/^https:\/\//.test(u)) return msg("Enter a full https:// link"); scan(p, u, $("#pjScanGo")); });
    on("#pjProdExit", () => { product = ""; render(); });
    on("#pjProdScript", () => { const best = prods.find((x) => x.product === product)?.best; if (best) openScript(best.url, `${product}${p.product ? " (" + p.product + ")" : ""}`); });
    const all2 = $("#pjVidAll"); if (all2) all2.onchange = () => document.querySelectorAll(".pjVid").forEach((c) => (c.checked = all2.checked));
    on("#pjVidGo", async () => {
      const urls = [...document.querySelectorAll(".pjVid:checked")].map((c) => c.dataset.url);
      if (!urls.length) return msg("Tick some videos first");
      msg(`Downloading ${urls.length}…`);
      const r = await send({ type: "download", urls });
      if (r && r.error) return msg(r.error);
      await send({ type: "project-add", id: p.id, urls });
      msg(`${r.ok} saved, ${r.skipped} already saved, ${r.failed} failed · added to “${p.name}”`);
    });
    on("#pjTag", () => tagVideos(all.filter(needsTags), (t) => ($("#pjTagMsg").textContent = t)));
    on("#pjClips", async () => { await navigator.clipboard.writeText(clipListTSV(bank.clips)); $("#pjClipsMsg").textContent = `Copied ${bank.clips.length} clips (file, in, out, role, line, source)`; });
    on("#pjPlan", async () => {
      const key = await aiKey(); if (!key) return ($("#pjPlanMsg").textContent = "Save your API key first (Ideas tab)");
      if (!videos.length) return ($("#pjPlanMsg").textContent = "Add videos first");
      const ranked = videos.map((v) => ({ v, ...winnerScore(v, videos, bases, base) })).sort((x, y) => y.score - x.score);
      const vs = ranked.map((r) => r.v), why = Object.fromEntries(ranked.filter((r) => r.basis).map((r) => [r.v.url, r.basis]));
      $("#pjPlanMsg").textContent = "Planning…";
      let r; try { r = await ask(key, buildPlanPrompt({ name: p.name + (product ? ` / ${product}` : ""), product: product || p.product }, vs, { why, opportunities: opp, products: prods, keywords: kws.map((k) => k.keyword) })); }
      catch (err) { return ($("#pjPlanMsg").textContent = "✗ " + err.message); }
      $("#pjPlanOut").innerHTML = planHtml(r, vs); // the indexes refer to this ranking
      const saved = await send({ type: "project-plan", id: p.id, plan: { ...r, order: vs.slice(0, 30).map((v) => v.url) } });
      $("#pjPlanMsg").textContent = saved && saved.ok ? "Saved with the project" : "Shown (too large to save)";
    });
  }

  async function scan(p, url, el) {
    const old = el.textContent; el.textContent = "Scanning…"; msg("Listing the account's recent videos (about 10-60 seconds)…");
    const r = await send({ type: "project-scan", id: p.id, url, limit: 30 });
    el.textContent = old;
    msg(r && r.ok ? `Scanned ${url.replace(/^https:\/\/(www\.)?/, "")}: ${r.project.scans.at(-1).items.length} videos` : `✗ ${(r && r.error) || "Scan failed"}`);
  }

  // header buttons
  $("#pjnew").onclick = async () => { const name = prompt("Project name (e.g. “Air fryer ads Q4”)"); if (!name) return; const product = prompt("Product, offer and audience (optional)", "") || "";
    const r = await send({ type: "project-new", name, product }); if (r && r.error) return alert(r.error); sel.value = r.project.id; };
  $("#pjedit").onclick = async () => { const p = current(); if (!p) return; const name = prompt("Project name", p.name); if (name === null) return; const prod = prompt("Product, offer and audience", p.product);
    await send({ type: "project-edit", id: p.id, name: name || p.name, product: prod ?? p.product }); };
  $("#pjdel").onclick = async () => { const p = current(); if (p && confirm(`Delete project “${p.name}”? Its videos stay in the library.`)) await send({ type: "project-delete", id: p.id }); };
  $("#pjaddgo").onclick = async () => { const p = current(), col = $("#pjaddcol").value; if (!p) return;
    const urls = getAll().filter((v) => (col === "__all" ? true : col === "__none" ? !v.folder : v.folder === col)).map((v) => v.url);
    if (!urls.length) return msg("That collection is empty");
    const r = await send({ type: "project-add", id: p.id, urls }); msg(r && r.ok ? `Added ${urls.length} videos` : (r && r.error) || "Failed"); };
  sel.onchange = () => { product = ""; render(); };

  // the Library tab's "Add ticked to project"
  const fillTargets = () => { const el = $("#mvproj"), keep = el.value; el.innerHTML = getProjects().map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("") || `<option value="">(no projects)</option>`; if ([...el.options].some((o) => o.value === keep)) el.value = keep; };
  $("#mvp").onclick = async () => { const urls = [...document.querySelectorAll(".tick:checked")].map((c) => c.dataset.url); const id = $("#mvproj").value;
    if (!id) return alert("Create a project in the Projects tab first"); if (!urls.length) return alert("Tick some videos first");
    const r = await send({ type: "project-add", id, urls }); $("#mvpMsg").textContent = r && r.ok ? `Added ${urls.length}` : (r && r.error) || ""; };

  return { render: () => { fillTargets(); render(); }, collections: (folders) => { const el = $("#pjaddcol"), keep = el.value;
    el.innerHTML = `<option value="__all">Whole library</option><option value="__none">Unfiled</option>` + folders.map((f) => `<option>${esc(f)}</option>`).join(""); el.value = [...el.options].some((o) => o.value === keep) ? keep : folders[0] || "__all"; } };
}
