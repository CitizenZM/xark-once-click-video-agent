// Projects tab: one research project at a time. Accounts and videos to look at next, accounts found by search, keywords
// and products (product mode), viewer comments, opportunities, a remix clip bank (EDL export, Ad Studio), the AI plan,
// own-ad results and exports. Numbers come from projects.js / research.js; this file only renders and wires buttons.
// Sections of a switched-off feature carry its *-only class and are hidden by the stylesheet.
import { projectVideos, recommendAccounts, scanSummary, recommendedVideos, topKeywords, searchLinks, productStats, productFilter, needsTags,
  opportunities, remixBank, clipListTSV, winnerScore, ts } from "./projects.js";
import { commentInsights, searchAccounts, adStats, adMetrics, adsFromCsv, toEDL, projectCSV, reportHTML } from "./research.js";
import { keywordStats, baselines } from "./insights.js";
import { creatorBaselines } from "./winners.js";
import { buildPlanPrompt } from "./ai.js";

export function initProjects(ctx) {
  const { $, esc, send, short, link, callAI, getFeatures, getAll, getProjects, openScript, tagVideos, save } = ctx;
  let product = ""; // product mode: "" = whole project
  const sel = $("#pjsel"), body = $("#pjbody"), msg = (t) => ($("#pjMsg").textContent = t || "");
  const a = (u, t, cls = "") => `<a href="${esc(link(u))}" target="_blank" rel="noopener" class="${cls}">${esc(t)}</a>`;
  const current = () => getProjects().find((p) => p.id === sel.value) || null;
  const links = (term, prod) => searchLinks(term, { product: prod }).map((l) => a(l.url, l.name)).join(" · ");
  const bare = (u) => String(u || "").replace(/^https:\/\/(www\.)?/, "");
  const money = (x) => (x == null ? "–" : "$" + (x >= 100 ? Math.round(x) : x.toFixed(2)));
  const ratio = (x, d = 2) => (x == null ? "–" : x.toFixed(d));

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
    const fresh = new Set(p.fresh || []);
    const known = new Set(recs.mine.map((r) => r.url).filter(Boolean)), scanned = new Set(p.scans.map((s) => s.account));
    const found = searchAccounts(p.finds || [], { known, scanned });
    const com = commentInsights(videos), ads = adStats(p.ads || [], lib);
    const ytCount = all.filter((v) => /youtube\.com|youtu\.be/.test(v.url) && !(v.comments && v.comments.length)).length;
    body.innerHTML = `
      ${product ? `<div class="card mode"><b>Product mode: ${esc(product)}</b> <span class="note">${esc(prodRow.category)}${prodRow.brand ? " · " + esc(prodRow.brand) : ""} · ${videos.length} of ${all.length} project videos</span>
        <div class="row"><span class="note">Find more:</span> ${links(product, true)}</div>
        <div class="row"><button id="pjProdScript" class="ai-only">Write a script for this product</button><button id="pjProdExit" class="ghost">Exit product mode</button></div></div>` : ""}
      <p class="note">${p.product ? `For: ${esc(p.product)} · ` : ""}${p.productUrl ? `${a(p.productUrl, "product page")} · ` : ""}${all.length} videos · ${new Set(all.map((v) => v.uploader || v.uploader_id)).size} creators · ${p.scans.length} account scan${p.scans.length === 1 ? "" : "s"}
        <span class="autoscan-only"> · daily scan ${p.autoScanAt ? esc(new Date(p.autoScanAt).toLocaleString()) : "not run yet"}</span></p>
      <div class="row"><button id="pjCsv" class="ghost">Download CSV</button><button id="pjReport" class="ghost">Report (print to PDF)</button><span id="pjExpMsg" class="note"></span></div>
      ${all.length ? "" : `<div class="card"><p class="empty">No videos in this project yet. Add a collection above, or tick videos in the Library tab and press “Add ticked to project”.</p></div>`}

      <h3>Accounts to study next</h3>
      <p class="note">New accounts: @-mentioned in this project's videos, or saved elsewhere in your library with the project's keywords. Then this project's own creators, best first. “Scan” lists an account's last 30 videos with their numbers (nothing is downloaded) and ranks them against that account's own median.</p>
      <div class="tablewrap"><table id="pjAccts"><tr><th>Account</th><th>Platform</th><th>Why</th><th></th></tr>
        ${recs.fresh.map((r) => acctRow(r, "new")).join("")}${recs.mine.slice(0, 10).map((r) => acctRow(r, "in project")).join("")}
        ${recs.fresh.length + recs.mine.length ? "" : `<tr><td colspan="4" class="empty">Add videos to the project first.</td></tr>`}</table></div>
      <div class="row"><input id="pjScanUrl" class="grow" placeholder="Scan any profile or channel: https://www.tiktok.com/@name"><button id="pjScanGo" class="ghost">Scan</button></div>

      <h3>Find accounts by search</h3>
      <p class="note">YouTube Shorts are searched here (titles, views, channel; nothing is downloaded). For TikTok and Instagram, open the search page, press the extension's “Select videos” and then “Send to project”: the views the page shows are kept, and creators are grouped below.</p>
      <div class="row"><input id="pjFindQ" class="grow" placeholder="Search term, e.g. ${esc((kws[0] && kws[0].keyword) || p.product || "air fryer liner")}" value="${esc((prodRow && prodRow.product) || "")}"><button id="pjFindGo" class="ghost">Search YouTube Shorts</button>
        <span id="pjFindLinks" class="note"></span></div>
      <div class="tablewrap"><table><tr><th>Account</th><th>From</th><th>Found</th><th>Median views</th><th>Best</th><th></th></tr>
        ${found.slice(0, 25).map((r) => `<tr><td>${a(r.account, r.name || bare(r.account))} ${r.known ? `<span class="sig">in project</span>` : `<span class="sig hi">new</span>`}</td><td><small>${esc(r.platform)} · ${esc(r.queries.join(", "))}</small></td><td>${r.n}</td><td>${short(r.median)}</td><td>${short(r.best)}</td>
          <td><a href="#" class="pjScan" data-url="${esc(r.account)}">${r.scanned ? "Re-scan" : "Scan"}</a></td></tr>`).join("") || `<tr><td colspan="6" class="empty">Search above, or send a TikTok / Instagram search page from the select bar.</td></tr>`}</table></div>

      <h3>Videos to look at <span class="note">(from your scans: unsaved videos at 1.5x+ of their own account's median)</span></h3>
      <div class="row autoscan-only"><span class="note">${fresh.size ? `<b>${fresh.size} new</b> since the daily scan (marked below).` : "The daily scan re-checks every scanned account once a day."}</span><button id="pjAutoNow" class="ghost">Run the daily scan now</button><span id="pjAutoMsg" class="note"></span></div>
      <div class="tablewrap"><table id="pjVids"><tr><th><input type="checkbox" id="pjVidAll"></th><th>Video</th><th>Account</th><th>Why</th><th>Views</th><th>Per hour</th></tr>
        ${recVids.map((x) => `<tr><td><input type="checkbox" class="pjVid" data-url="${esc(x.url)}"></td><td>${fresh.has(x.url) ? `<span class="sig hi">new</span> ` : ""}${a(x.url, (x.title || x.url).slice(0, 70))}</td><td>${esc(bare(x.account))}</td><td><span class="sig ${x.multiple >= 2 ? "hi" : ""}">${x.multiple.toFixed(1)}x</span> <small>${esc(x.basis)}</small></td><td>${short(x.view_count)}</td><td>${x.perHour ? short(Math.round(x.perHour)) + "/h" : "–"}</td></tr>`).join("")
          || `<tr><td colspan="6" class="empty">Scan an account above to get video picks.</td></tr>`}</table></div>
      ${recVids.length ? `<div class="row"><button id="pjVidGo">Download ticked into this project</button></div>` : ""}
      ${p.scans.length ? `<details><summary class="note">Scans (${p.scans.length})</summary><ul class="list">${p.scans.slice().reverse().map((s) => { const m = scanSummary(s, lib);
        return `<li>${a(s.account, bare(s.account))}<small>${m.n} videos · median ${short(m.median)} ${esc(m.by || "")} · ${m.outliers.length} at 2x+ · ${esc(new Date(s.at).toLocaleString())}</small></li>`; }).join("")}</ul></details>` : ""}

      <div class="grid" style="margin-top:14px">
        <div class="card"><h3>Keywords</h3><p class="note">Words and hashtags in 2+ of these videos. Green = above the project median. Each has search links for finding more.</p>
          <ul class="list">${kws.map((k) => `<li><b class="${k.lift >= 1.5 ? "ok" : ""}">${esc(k.keyword)}</b> <small>${k.n} videos · ${k.creators} creators · ${k.lift != null ? k.lift.toFixed(1) + "x " + k.liftBy : "no numbers"} · ${links(k.keyword)}</small></li>`).join("") || `<li class="empty">Needs 2+ videos sharing a word.</li>`}</ul></div>
        <div class="card"><h3>Products</h3><p class="note">From the AI tags (product, category, brand). “Product mode” narrows this whole page to one product.</p>
          <div class="row ai-only"><button id="pjTag" class="ghost">Find products with AI (${all.filter(needsTags).length} to tag)</button><span id="pjTagMsg" class="note"></span></div>
          <ul class="list">${prods.map((x) => `<li><b>${esc(x.product)}</b> ${x.product === product ? "" : `<a href="#" class="pjMode" data-p="${esc(x.product)}">Product mode</a>`}<small>${esc(x.category || "")}${x.brand ? " · " + esc(x.brand) : ""} · ${x.n} videos · ${x.creators} creators · ${x.lift != null ? x.lift.toFixed(1) + "x " + x.liftBy : "no numbers"}${x.hooks.length ? " · hooks: " + esc(x.hooks.join(", ")) : ""}</small></li>`).join("") || `<li class="empty">No products yet${getFeatures().ai ? ": press “Find products with AI”" : " (products come from AI tags: turn on AI in Settings)"}.</li>`}</ul></div>
      </div>

      <div class="comments-only">
        <h3>What viewers ask and push back on</h3>
        <p class="note">Top comments under the project's videos. YouTube comments are fetched here; for TikTok and Instagram, open the video, open its comments, then press “Save comments on this page” in the extension popup.</p>
        <div class="row"><button id="pjComFetch" class="ghost">Fetch YouTube comments (${ytCount} videos)</button><span id="pjComMsg" class="note">${com.n ? `${com.n} comments on ${com.videos} videos` : ""}</span></div>
        <div class="grid">
          <div class="card"><b>Questions</b><ul class="list">${com.questions.map((c) => `<li>“${esc(c.text)}”<small>${c.likes} likes · ${a(c.url, c.creator || "video")}</small></li>`).join("") || `<li class="empty">None yet.</li>`}</ul></div>
          <div class="card"><b>Objections</b><ul class="list">${com.objections.map((c) => `<li>“${esc(c.text)}”<small>${c.likes} likes · ${a(c.url, c.creator || "video")}</small></li>`).join("") || `<li class="empty">None yet.</li>`}</ul></div>
          <div class="card"><b>Recurring words</b><p>${com.themes.map((t) => `<span class="sig">${esc(t.word)} ${t.n}</span>`).join(" ") || `<span class="empty">None yet.</span>`}</p></div>
        </div>
      </div>

      <h3>Opportunities</h3>
      <p class="note">From the numbers of the videos in this view: what to make more of, what to test, what to drop, and what is missing.</p>
      <ul class="list card">${opp.map((o) => `<li><span class="sig ${o.kind === "double down" ? "hi" : ""}">${esc(o.kind)}</span> ${esc(o.title)}<small>${esc(o.basis)}</small></li>`).join("") || `<li class="empty">Add more videos to see opportunities.</li>`}</ul>

      <h3>Remix bank</h3>
      <p class="note">Openers and closers of the strongest videos, with their seconds from the local transcript. Use them as an edit plan for footage you own or have licensed (or re-shoot the same structure); reposting a creator's clip needs their permission (Spark Ads / whitelisting).</p>
      <div class="tablewrap"><table><tr><th>Role</th><th>In–out</th><th>Line</th><th>From</th><th>Why this video</th></tr>
        ${bank.clips.map((c) => `<tr><td>${esc(c.role)}</td><td>${ts(c.start)}–${ts(c.end)}</td><td title="${esc(c.text)}">${esc(c.text.slice(0, 80)) || "<small>watch it</small>"}</td><td>${a(c.v.url, (c.v.title || c.v.url).slice(0, 40))}<small>${esc(c.v.uploader || "")}</small></td><td><small>${esc(c.basis)}</small></td></tr>`).join("")
          || `<tr><td colspan="5" class="empty">Needs videos with view or like counts; transcribe them to get the seconds.</td></tr>`}</table></div>
      ${bank.recipes.length ? `<div class="card" style="margin-top:10px"><b>Remix recipes</b><ol>${bank.recipes.map((r, i) => `<li>Open with “${esc(r.hook.text.slice(0, 60) || "the first 3s")}” (${esc(r.hook.v.uploader || "")}, ${ts(r.hook.start)}–${ts(r.hook.end)}) → body in the style of ${a(r.body.url, (r.body.title || r.body.url).slice(0, 40))} <small>${esc(r.bodyBasis)}</small>${r.cta ? ` → close with “${esc(r.cta.text.slice(0, 50))}” (${ts(r.cta.start)})` : ""}
        <a href="#" class="pjStudioRecipe adstudio-only" data-i="${i}">Make in Ad Studio</a></li>`).join("")}</ol></div>` : ""}
      ${bank.clips.length ? `<div class="row"><button id="pjClips" class="ghost">Copy clip list</button><button id="pjEdl" class="ghost">Download EDL (Premiere / Resolve)</button><span id="pjClipsMsg" class="note"></span></div>
        <div class="row adstudio-only"><label class="inline"><input type="checkbox" id="pjRights"> I own or have licensed these videos</label><button id="pjStudioClips" class="ghost">Cut these clips into Ad Studio's library</button><span id="pjStudioMsg" class="note"></span></div>` : ""}

      <div class="ai-only">
        <h3>AI plan: remixes, new ads, tests <span class="note">(uses your own key)</span></h3>
        <p class="note">Sends up to 30 of these videos (title, caption, numbers, labels, spoken lines with seconds)${getFeatures().comments ? ", the top viewer questions and objections" : ""}${getFeatures().ownAds ? ", your ads' results" : ""} and the measured opportunities to api.anthropic.com.</p>
        <div class="row"><button id="pjPlan">${p.plan ? "Re-plan" : "Make the plan"}</button><span id="pjPlanMsg" class="note">${p.plan ? "Saved " + esc(new Date(p.plan.at).toLocaleString()) : ""}</span></div>
        <div id="pjPlanOut">${p.plan ? planHtml(p.plan, (p.plan.order || []).map((u) => lib.find((v) => v.url === u))) : ""}</div>
      </div>

      <div class="ownads-only">
        <h3>My ads</h3>
        <p class="note">Your own ads for this project: type them in or import a CSV export from Meta Ads Manager or TikTok Ads Manager (columns found by name: Ad name, Amount spent / Cost, Impressions, Link clicks, Purchases, Purchase conversion value). Link each ad to the reference video it was based on to see which references, hooks and formats pay back.</p>
        ${ads.total.spend ? `<p><b>Total</b> spend ${money(ads.total.spend)} · revenue ${money(ads.total.revenue)} · ROAS ${ratio(ads.total.roas)} · CTR ${ads.total.ctr != null ? (ads.total.ctr * 100).toFixed(2) + "%" : "–"} · CPA ${money(ads.total.cpa)}</p>` : ""}
        <div class="grid">${[["By reference video", ads.byRef, (g) => g.video ? a(g.video.url, (g.video.title || g.video.url).slice(0, 40)) : esc(bare(g.key))], ["By hook", ads.byHook, (g) => esc(g.key)], ["By format / angle", ads.byFormat, (g) => esc(g.key)]]
          .map(([t, list, name]) => `<div class="card"><b>${t}</b><ul class="list">${list.slice(0, 6).map((g) => `<li>${name(g)}<small>${g.n} ads · ${money(g.spend)} · ROAS ${ratio(g.roas)}${g.spend < ads.minSpend ? " · too little spend to judge" : ""}</small></li>`).join("") || `<li class="empty">Link ads to see this.</li>`}</ul></div>`).join("")}</div>
        <div class="tablewrap"><table id="pjAds"><tr><th>Ad</th><th>Reference video</th><th>Hook</th><th>Spend</th><th>Impr.</th><th>Clicks</th><th>Purch.</th><th>Revenue</th><th>CTR</th><th>ROAS</th><th></th></tr>
          ${(p.ads || []).map((x) => { const m = adMetrics(x); return `<tr data-id="${esc(x.id)}"><td>${esc(x.name)}</td><td><select class="pjAdRef"><option value="">–</option>${all.map((v) => `<option value="${esc(v.url)}" ${v.url === x.ref ? "selected" : ""}>${esc((v.uploader ? "@" + v.uploader + " · " : "") + (v.title || v.url).slice(0, 40))}</option>`).join("")}</select></td>
            <td><input class="pjAdHook" value="${esc(x.hook || "")}" placeholder="from the reference" style="width:110px"></td><td>${money(x.spend)}</td><td>${short(x.impressions)}</td><td>${short(x.clicks)}</td><td>${x.purchases}</td><td>${money(x.revenue)}</td><td>${m.ctr != null ? (m.ctr * 100).toFixed(2) + "%" : "–"}</td><td>${ratio(m.roas)}</td><td><a href="#" class="pjAdDel">✕</a></td></tr>`; }).join("")
            || `<tr><td colspan="11" class="empty">No ads yet.</td></tr>`}</table></div>
        <div class="row"><input id="pjAdName" placeholder="Ad name" style="width:160px"><input id="pjAdSpend" type="number" min="0" step="0.01" placeholder="Spend $" style="width:90px"><input id="pjAdImp" type="number" min="0" placeholder="Impressions" style="width:110px"><input id="pjAdClk" type="number" min="0" placeholder="Clicks" style="width:80px"><input id="pjAdPur" type="number" min="0" placeholder="Purchases" style="width:90px"><input id="pjAdRev" type="number" min="0" step="0.01" placeholder="Revenue $" style="width:100px"><button id="pjAdAdd" class="ghost">Add ad</button></div>
        <div class="row"><input type="file" id="pjAdCsv" accept=".csv,.tsv,text/csv"><span id="pjAdMsg" class="note"></span></div>
      </div>`;
    wire(p, { videos, all, prods, opp, bank, kws, base, bases, recs, com, ads, lib });
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
      ${(r.new_ads || []).slice(0, 3).map((x, i) => `<div class="card concept"><h4>New ad: ${q(x.name)}</h4><p><b>${q(x.format)}</b> · ${q(x.angle)} · ${q(x.audience)}</p><p><b>Hook:</b> “${q(x.hook)}”</p><ol>${(x.beats || []).slice(0, 6).map((b) => `<li>${q(b)}</li>`).join("")}</ol><p class="note">${q(x.why)}</p>
        <a href="#" class="pjStudioAd adstudio-only" data-i="${i}">Make in Ad Studio</a></div>`).join("")}
      </div>
      ${r.tests && r.tests.length ? `<h4>Tests</h4><ul>${r.tests.slice(0, 3).map((t) => `<li><b>${q(t.variable)}</b>: ${q(t.a)} vs ${q(t.b)} <small>${q(t.why)}</small></li>`).join("")}</ul>` : ""}
      ${r.searches && r.searches.length ? `<h4>Searches to find more</h4><ul>${r.searches.slice(0, 5).map((s) => `<li>${q(s.platform)}: ${a(searchLinks(s.query).find((l) => String(s.platform || "").toLowerCase().includes(l.name.split(" ")[0].toLowerCase()))?.url || searchLinks(s.query)[0]?.url || "#", s.query)} <small>${q(s.why)}</small></li>`).join("")}</ul>` : ""}`;
  }

  // Ad Studio needs the product page: ask once and keep it on the project.
  async function productUrlOf(p) {
    if (p.productUrl) return p.productUrl;
    const u = (prompt("Product page link for Ad Studio (https://…)", "") || "").trim();
    if (!/^https:\/\//.test(u)) return null;
    await send({ type: "project-edit", id: p.id, productUrl: u });
    return u;
  }
  async function studioJob(p, ref, notes, title, el) {
    const productUrl = await productUrlOf(p); if (!productUrl) return alert("Ad Studio needs the product page link (https://…)");
    const engine = confirm("Use new AI footage in Ad Studio?\n\nOK = generate (paid, Ad Studio shows the cost and waits for your approval)\nCancel = remix (library clips + product images, no footage cost)") ? "generate" : "remix";
    const old = el.textContent; el.textContent = "Sending…";
    const r = await send({ type: "adstudio", action: "job", url: ref.url, productUrl, title, notes: `Research project "${p.name}". ${notes}`.slice(0, 2000), goal: p.product, engine });
    el.textContent = old;
    if (!r || !r.ok) return alert("Ad Studio: " + ((r && r.error) || "no answer"));
    window.open(r.url, "_blank", "noopener");
  }

  function wire(p, d) {
    const { videos, all, prods, opp, bank, kws, base, bases, com, ads, lib } = d;
    body.onclick = async (e) => {
      const t = e.target.closest("a.pjScan, a.pjMode, a.pjStudioRecipe, a.pjStudioAd, a.pjAdDel"); if (!t) return;
      e.preventDefault();
      if (t.classList.contains("pjMode")) { product = t.dataset.p; render(); scrollTo(0, 0); return; }
      if (t.classList.contains("pjStudioRecipe")) {
        const r = bank.recipes[+t.dataset.i]; if (!r) return;
        return studioJob(p, r.body, `Remix recipe: open like @${r.hook.v.uploader || ""} ("${r.hook.text.slice(0, 80)}", ${ts(r.hook.start)}-${ts(r.hook.end)}), body in the style of this reference${r.cta ? `, close with "${r.cta.text.slice(0, 60)}"` : ""}. Library clips imported from this project are tagged "${p.name}".`, `${p.name} remix ${+t.dataset.i + 1}`, t);
      }
      if (t.classList.contains("pjStudioAd")) {
        const plan = p.plan, x = plan && (plan.new_ads || [])[+t.dataset.i]; if (!x) return;
        const order = (plan.order || []).map((u) => lib.find((v) => v.url === u)).filter(Boolean), ref = order[0];
        if (!ref) return alert("No reference video saved with the plan");
        return studioJob(p, ref, `New ad concept "${x.name}": ${x.format}; angle ${x.angle}; audience ${x.audience}; hook "${x.hook}"; beats: ${(x.beats || []).join(" / ")}`, `${p.name}: ${x.name}`.slice(0, 80), t);
      }
      if (t.classList.contains("pjAdDel")) return send({ type: "project-ads", id: p.id, mode: "delete", adId: t.closest("tr").dataset.id });
      scan(p, t.dataset.url, t);
    };
    body.onchange = async (e) => {
      const row = e.target.closest("#pjAds tr[data-id]"); if (!row) return;
      const ad = (p.ads || []).find((x) => x.id === row.dataset.id); if (!ad) return;
      await send({ type: "project-ads", id: p.id, mode: "update", ads: [{ ...ad, ref: row.querySelector(".pjAdRef").value || undefined, hook: row.querySelector(".pjAdHook").value.trim() || undefined }] });
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
    const fq = $("#pjFindQ"), showLinks = () => { const q = fq.value.trim(); $("#pjFindLinks").innerHTML = q ? "Open: " + searchLinks(q).filter((l) => /TikTok|Instagram/.test(l.name)).map((l) => a(l.url, l.name)).join(" · ") : ""; };
    if (fq) { fq.oninput = showLinks; showLinks(); }
    on("#pjFindGo", async () => {
      const q = fq.value.trim(); if (!q) return msg("Enter a search term");
      $("#pjFindGo").textContent = "Searching…"; msg("Searching YouTube Shorts (10-30 seconds)…");
      const r = await send({ type: "project-find", id: p.id, query: q });
      $("#pjFindGo").textContent = "Search YouTube Shorts";
      msg(r && r.ok ? `Found ${(r.project.finds.at(-1) || { items: [] }).items.length} videos for “${q}”` : "✗ " + ((r && r.error) || "Search failed"));
    });
    on("#pjAutoNow", async () => { $("#pjAutoMsg").textContent = "Scanning (up to 20 accounts, a few minutes)…"; const r = await send({ type: "autoscan-now" });
      $("#pjAutoMsg").textContent = r && r.ok ? `Scanned ${r.accounts} accounts${r.found.length ? " · new: " + r.found.join(", ") : " · nothing new"}` : "✗ " + ((r && r.error) || "failed"); });
    on("#pjComFetch", async () => {
      const urls = all.filter((v) => /youtube\.com|youtu\.be/.test(v.url) && !(v.comments && v.comments.length)).map((v) => v.url);
      if (!urls.length) return ($("#pjComMsg").textContent = "No YouTube videos without comments here");
      $("#pjComMsg").textContent = `Fetching comments for ${Math.min(urls.length, 30)} videos…`;
      const r = await send({ type: "comments-fetch", urls });
      $("#pjComMsg").textContent = r && r.ok ? `${r.done} fetched${r.failed ? `, ${r.failed} failed` : ""}` : "✗ " + ((r && r.error) || "failed");
    });
    on("#pjTag", () => tagVideos(all.filter(needsTags), (t) => ($("#pjTagMsg").textContent = t)));
    on("#pjClips", async () => { await navigator.clipboard.writeText(clipListTSV(bank.clips)); $("#pjClipsMsg").textContent = `Copied ${bank.clips.length} clips (file, in, out, role, line, source)`; });
    on("#pjEdl", () => { save(`${p.name.replace(/[^\w-]+/g, "_")}-remix.edl`, toEDL(bank.clips, p.name), "text/plain"); $("#pjClipsMsg").textContent = "EDL saved: import it in your editor, then relink the clips to the downloaded files"; });
    on("#pjStudioClips", async () => {
      if (!$("#pjRights").checked) return ($("#pjStudioMsg").textContent = "Tick the box first: only footage you own or have licensed goes into Ad Studio's library");
      const groups = [...bank.clips.reduce((m, c) => m.set(c.v.url, [...(m.get(c.v.url) || []), { start: c.start, end: c.end, role: c.role, text: c.text }]), new Map())].map(([url, clips]) => ({ url, clips }));
      $("#pjStudioMsg").textContent = `Cutting ${bank.clips.length} clips from ${groups.length} videos…`;
      const r = await send({ type: "adstudio", action: "clips", groups, rights: "own", project: p.name });
      const n = r && r.results ? r.results.reduce((s, x) => s + (x.ok ? x.clips.length : 0), 0) : 0, bad = r && r.results ? r.results.filter((x) => !x.ok) : [];
      $("#pjStudioMsg").textContent = r && r.ok ? `✓ ${n} clips in Ad Studio's library (tagged “${p.name}”)${bad.length ? ` · ${bad.length} videos failed: ${bad[0].error}` : ""}` : "✗ " + ((r && (r.error || (bad[0] && bad[0].error))) || "failed");
    });
    on("#pjPlan", async () => {
      if (!videos.length) return ($("#pjPlanMsg").textContent = "Add videos first");
      const ranked = videos.map((v) => ({ v, ...winnerScore(v, videos, bases, base) })).sort((x, y) => y.score - x.score);
      const vs = ranked.map((r) => r.v), why = Object.fromEntries(ranked.filter((r) => r.basis).map((r) => [r.v.url, r.basis]));
      const f = getFeatures();
      $("#pjPlanMsg").textContent = "Planning…";
      let r; try { r = await callAI(buildPlanPrompt({ name: p.name + (product ? ` / ${product}` : ""), product: product || p.product }, vs, { why, opportunities: opp, products: prods, keywords: kws.map((k) => k.keyword),
        ...(f.comments ? { questions: com.questions, objections: com.objections } : {}), ...(f.ownAds ? { ads } : {}) }), { label: "Project plan" }); }
      catch (err) { return ($("#pjPlanMsg").textContent = "✗ " + err.message); }
      $("#pjPlanOut").innerHTML = planHtml(r, vs); // the indexes refer to this ranking
      const saved = await send({ type: "project-plan", id: p.id, plan: { ...r, order: vs.slice(0, 30).map((v) => v.url) } });
      $("#pjPlanMsg").textContent = saved && saved.ok ? "Saved with the project" : "Shown (too large to save)";
    });
    on("#pjAdAdd", async () => {
      const v = (id) => $(id).value.trim(), ad = { name: v("#pjAdName"), spend: v("#pjAdSpend"), impressions: v("#pjAdImp"), clicks: v("#pjAdClk"), purchases: v("#pjAdPur"), revenue: v("#pjAdRev") };
      if (!ad.name) return ($("#pjAdMsg").textContent = "Enter the ad name");
      const r = await send({ type: "project-ads", id: p.id, mode: "add", ads: [ad] }); $("#pjAdMsg").textContent = r && r.ok ? "Added" : "✗ " + ((r && r.error) || "failed");
    });
    const csv = $("#pjAdCsv"); if (csv) csv.onchange = async () => {
      const file = csv.files[0]; if (!file) return;
      const { ads: list, missing } = adsFromCsv(await file.text());
      if (missing.length) return ($("#pjAdMsg").textContent = `Columns not found: ${missing.join(", ")} (need an ad name and a spend / cost column)`);
      const r = await send({ type: "project-ads", id: p.id, mode: "add", ads: list }); $("#pjAdMsg").textContent = r && r.ok ? `Imported ${list.length} ads` : "✗ " + ((r && r.error) || "failed");
    };
    on("#pjCsv", () => { save(`${p.name.replace(/[^\w-]+/g, "_")}.csv`, projectCSV(all, { scoreOf: (v) => { const s = winnerScore(v, videos, bases, base); return s.score ? s.score.toFixed(2) : ""; } }), "text/csv"); $("#pjExpMsg").textContent = `CSV with ${all.length} videos saved`; });
    on("#pjReport", () => {
      const top = videos.map((v) => ({ v, ...winnerScore(v, videos, bases, base) })).sort((x, y) => y.score - x.score).slice(0, 12);
      const html = reportHTML({ name: p.name, product: p.product, at: Date.now(), videos: all, top, accounts: [...d.recs.fresh, ...d.recs.mine].slice(0, 12), keywords: kws.slice(0, 12), products: prods,
        opportunities: opp, comments: getFeatures().comments ? com : null, ads: getFeatures().ownAds ? ads : null, plan: p.plan }, esc);
      window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank");
      $("#pjExpMsg").textContent = "Report opened in a new tab: press ⌘P / Ctrl+P → Save as PDF";
    });
  }

  async function scan(p, url, el) {
    const old = el.textContent; el.textContent = "Scanning…"; msg("Listing the account's recent videos (about 10-60 seconds)…");
    const r = await send({ type: "project-scan", id: p.id, url, limit: 30 });
    el.textContent = old;
    msg(r && r.ok ? `Scanned ${bare(url)}: ${r.project.scans.at(-1).items.length} videos` : `✗ ${(r && r.error) || "Scan failed"}`);
  }

  // header buttons
  $("#pjnew").onclick = async () => { const name = prompt("Project name (e.g. “Air fryer ads Q4”)"); if (!name) return; const product = prompt("Product, offer and audience (optional)", "") || "";
    const r = await send({ type: "project-new", name, product }); if (r && r.error) return alert(r.error); sel.value = r.project.id; };
  $("#pjedit").onclick = async () => { const p = current(); if (!p) return; const name = prompt("Project name", p.name); if (name === null) return; const prod = prompt("Product, offer and audience", p.product);
    const pu = prompt("Product page link (used by Ad Studio, optional)", p.productUrl || "");
    await send({ type: "project-edit", id: p.id, name: name || p.name, product: prod ?? p.product, productUrl: pu === null ? p.productUrl : pu.trim() || undefined }); };
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
