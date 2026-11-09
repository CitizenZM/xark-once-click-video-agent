// Feature switches, the AI budget gate, project add-ons (search, page scans, comments, own ads, Ad Studio bridge, exports)
// and their wiring into background.js / the dashboard.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { featuresOf, offClasses } from "../extension/features.js";
import { callAI, estimate, costOf, gate, usageNow, DEFAULT_CAP } from "../extension/ai-budget.js";
import { commentInsights, searchAccounts, adStats, adsFromCsv, toEDL, projectCSV, reportHTML, accountOfUrl, cleanFind } from "../extension/research.js";
import { cleanProject } from "../extension/projects.js";

const src = (f) => fs.readFileSync(new URL("../extension/" + f, import.meta.url), "utf8");
const memStore = (init = {}) => { const s = structuredClone(init); return { s,
  get: async (k) => Object.fromEntries((Array.isArray(k) ? k : [k]).map((x) => [x, structuredClone(s[x])])), set: async (o) => Object.assign(s, structuredClone(o)) }; };
const reply = (body, status = 200) => async () => ({ ok: status === 200, status, json: async () => body });

test("feature switches: downloads only need nothing; AI follows the key until set; add-ons need Research", () => {
  assert.deepEqual(featuresOf(undefined), { research: true, ai: false, autoScan: false, comments: false, adStudio: false, ownAds: false });
  assert.equal(featuresOf({}, { hasKey: true }).ai, true);
  assert.equal(featuresOf({ ai: false }, { hasKey: true }).ai, false);
  const off = featuresOf({ research: false, ai: true, comments: true, adStudio: true }, { hasKey: true });
  assert.deepEqual(off, { research: false, ai: false, autoScan: false, comments: false, adStudio: false, ownAds: false });
  assert.deepEqual(offClasses(off), ["no-research", "no-ai", "no-auto-scan", "no-comments", "no-ad-studio", "no-own-ads"]);
  const css = src("dashboard.css");
  for (const c of offClasses(off)) assert.ok(css.includes("." + c + " "), c + " has a hiding rule");
});

test("AI budget: switch, key and monthly cap are checked before any request; usage is recorded from the API's numbers", async () => {
  const text = "x".repeat(3500), now = () => Date.parse("2026-11-08T12:00:00Z");
  let calls = 0; const okFetch = async (url, init) => { calls++; assert.equal(JSON.parse(init.body).model, "claude-sonnet-5-5");
    return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: '{"ok":true}' }], usage: { input_tokens: 1000, output_tokens: 500 } }) }; };
  await assert.rejects(callAI(text, { store: memStore({ aiKey: "k", features: { ai: false } }), fetchImpl: okFetch, now }), /AI features are off/);
  await assert.rejects(callAI(text, { store: memStore({ features: { ai: true } }), fetchImpl: okFetch, now }), /API key/);
  await assert.rejects(callAI(text, { store: memStore({ aiKey: "k", settings: { aiCapUsd: 1 }, aiUsage: { month: "2026-11", usd: 0.95, calls: 3 } }), fetchImpl: okFetch, now }), /Monthly AI limit/);
  await assert.rejects(callAI(text, { store: memStore({ aiKey: "k" }), fetchImpl: okFetch, confirmFn: () => false, now }), /Cancelled/);
  assert.equal(calls, 0, "nothing was sent");
  // last month's spend does not count; a confirm shows the estimate
  const st = memStore({ aiKey: "k", aiUsage: { month: "2026-10", usd: 99, calls: 50 } }); let shown = "";
  assert.deepEqual(await callAI(text, { store: st, fetchImpl: okFetch, confirmFn: (m) => ((shown = m), true), now }), { ok: true });
  assert.match(shown, /Estimated cost: about \$0\.027, at most \$0\.082/);
  assert.deepEqual(st.s.aiUsage, { month: "2026-11", usd: 0.007, calls: 1 }); // 1000 x $2/M + 500 x $10/M
  // a cut-off answer is still billed and recorded
  const cut = memStore({ aiKey: "k", settings: { aiConfirm: false } });
  await assert.rejects(callAI("hi", { store: cut, now, fetchImpl: reply({ stop_reason: "max_tokens", content: [], usage: { input_tokens: 10, output_tokens: 8000 } }) }), /cut off/);
  assert.equal(cut.s.aiUsage.calls, 1);
  assert.equal(DEFAULT_CAP, 10);
  assert.equal(gate({ features: { ai: true }, key: "k", usage: null, cap: 0 }, estimate("x".repeat(1e6))), null, "0 = no limit");
  assert.equal(costOf({ input_tokens: 1e6, cache_read_input_tokens: 1e6, output_tokens: 1e6 }), 2 + 0.2 + 10);
  assert.deepEqual(usageNow(undefined, now()), { month: "2026-11", usd: 0, calls: 0 });
});

test("every AI button goes through callAI (no direct ask) and the key lives in Settings", () => {
  for (const f of ["dashboard.js", "project-view.js"]) {
    assert.doesNotMatch(src(f), /\bask\(/, f + " calls ask() directly");
    assert.match(src(f), /callAI\(/, f);
  }
  const html = src("dashboard.html"), settings = html.slice(html.indexOf('data-tab="settings"'));
  for (const id of ["featList", "aikey", "aitest", "aicap", "aiconfirm", "aiUsage", "asurl", "asping"]) assert.ok(settings.includes(`id="${id}"`), id);
  assert.ok(!html.slice(0, html.indexOf('data-tab="settings"')).includes('id="aikey"'), "key input moved out of the Ideas tab");
  assert.match(src("popup.js"), /f\.comments/); // the popup button follows the Comments switch
  assert.match(src("select.js"), /project-page-scan/);
});

test("comments: questions and objections, most liked first; recurring words", () => {
  const vs = [{ url: "https://www.youtube.com/watch?v=1", uploader: "a", comments: [{ text: "How long does the battery last?", likes: 9 }, { text: "too expensive for what it is", likes: 30 }, { text: "love the battery", likes: 2 }] },
    { url: "https://www.youtube.com/watch?v=2", uploader: "b", comments: [{ text: "battery died after a week, waste of money", likes: 50 }, { text: "where to buy", likes: 1 }, { text: "battery?", likes: 4 }] }];
  const r = commentInsights(vs);
  assert.equal(r.n, 6); assert.equal(r.videos, 2);
  assert.deepEqual(r.questions.map((c) => c.likes), [9, 4, 1]);
  assert.deepEqual(r.objections.map((c) => c.likes), [50, 30]);
  assert.deepEqual(r.themes[0], { word: "battery", n: 4 });
});

test("accounts found by search group by account; TikTok handles come from the links", () => {
  assert.equal(accountOfUrl("https://www.tiktok.com/@cook.daily/video/1"), "https://www.tiktok.com/@cook.daily");
  const finds = [cleanFind({ query: "air fryer", platform: "tiktok", items: [{ url: "https://www.tiktok.com/@a/video/1", view_count: 100, account: accountOfUrl("https://www.tiktok.com/@a/video/1") },
    { url: "https://www.tiktok.com/@a/video/2", view_count: 300, account: "https://www.tiktok.com/@a" }, { url: "https://www.tiktok.com/@b/video/3", view_count: 9000 }] }),
    cleanFind({ query: "fryer liner", platform: "tiktok", items: [{ url: "https://www.tiktok.com/@a/video/1", view_count: 100 }] })];
  const r = searchAccounts(finds, { known: new Set(["https://www.tiktok.com/@b"]) });
  assert.deepEqual(r.map((x) => [x.name, x.n, x.median, x.best, x.known, x.queries.length]), [["tiktok.com/@a", 2, 200, 300, false, 2], ["tiktok.com/@b", 1, 9000, 9000, true, 1]]);
});

test("own ads: Meta CSV import, totals and which reference / hook paid back", () => {
  const csv = '﻿"Ad name","Amount spent (USD)","Impressions","Link clicks","Purchases","Purchase conversion value"\n"Hook A - v1","120.50","10,000","200","6","540"\n"Hook B","30","5000","40","0","0"\n"Total","150.5","15000","240","6","540"\n';
  const { ads, missing } = adsFromCsv(csv);
  assert.deepEqual(missing, []);
  assert.deepEqual(ads.map((a) => [a.name, a.spend, a.impressions, a.clicks, a.purchases, a.revenue]), [["Hook A - v1", 120.5, 10000, 200, 6, 540], ["Hook B", 30, 5000, 40, 0, 0]]);
  assert.deepEqual(adsFromCsv("Campaign,Reach\nx,1").missing, ["name", "spend"]);
  const lib = [{ url: "https://www.tiktok.com/@a/video/1", ai_tags: { hook: "question", angle: "demo" } }];
  ads[0].ref = lib[0].url; ads[1].hook = "pov"; ads[1].spend = 10;
  const s = adStats(ads, lib);
  assert.equal(s.total.spend, 130.5); assert.equal(+s.total.roas.toFixed(2), 4.14);
  assert.deepEqual(s.byHook.map((g) => [g.key, g.spend]), [["question", 120.5], ["pov", 10]]); // hook read from the linked reference's AI tags
  assert.equal(s.byRef[0].video, lib[0]);
  const p = cleanProject({ id: "abcdef12", name: "x", urls: [], ads: [...ads, { name: "" }] });
  assert.equal(p.ads.length, 2);
});

test("exports: EDL timecodes, project CSV and an escaped printable report", () => {
  const v = { url: "https://www.tiktok.com/@a/video/1", file: "/Users/x/Downloads/OneClick/a - t [1].mp4", uploader: "a" };
  const edl = toEDL([{ v, role: "hook", text: "Stop", start: 0, end: 2.5 }, { v, role: "cta", text: "Buy", start: 10, end: 11 }], "Fryer");
  assert.match(edl, /^TITLE: Fryer\nFCM: NON-DROP FRAME/);
  assert.match(edl, /001 {2}AX {7}V {5}C {8}00:00:00:00 00:00:02:15 00:00:00:00 00:00:02:15/);
  assert.match(edl, /002 {2}AX {7}V {5}C {8}00:00:10:00 00:00:11:00 00:00:02:15 00:00:03:15/);
  assert.match(edl, /\* FROM CLIP NAME: a - t \[1\]\.mp4/);
  const csv = projectCSV([{ ...v, title: 'say "hi"', view_count: 5, segments: [{ text: "First line" }] }]);
  assert.match(csv.split("\r\n")[1], /"say ""hi""".*"First line"/);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const html = reportHTML({ name: "<script>x</script>", videos: [v], top: [{ v: { ...v, title: "<b>t</b>" }, basis: "2x" }], accounts: [], keywords: [], products: [], opportunities: [], at: 0 }, esc);
  assert.ok(!html.includes("<script>x") && !html.includes("<b>t</b>"));
  assert.ok(!/<script/i.test(html.replace("&lt;script&gt;", "")), "no scripts in the report");
});

test("background: switches gate project actions; search, page scans, comments, ads and the Ad Studio bridge reach the helper", async () => {
  const lib = [{ url: "https://www.youtube.com/watch?v=yt1", platform: "youtube", file: "/Users/x/Downloads/OneClick/y.mp4" },
    { url: "https://www.tiktok.com/@a/video/1", platform: "tiktok", file: "/Users/x/Downloads/OneClick/a.mp4", uploader: "a" }];
  const store = { library: lib, features: { research: false } }, L = {}, posted = [];
  const answers = { search: { ok: true, query: "fryer", items: [{ url: "https://www.youtube.com/watch?v=9", view_count: 50, account: "https://www.youtube.com/@cook", name: "Cook" }, { url: "http://10.0.0.1/x" }] },
    comments: { ok: true, comments: [{ text: "price?", likes: 3 }] }, adstudio: { ok: true, jobId: "j1", url: "http://localhost:5310/jobs/j1", clips: [{ id: "im_1", dur: 2, role: "hook" }] } };
  globalThis.chrome = {
    alarms: { create() {}, onAlarm: { addListener() {} } },
    runtime: { lastError: undefined, getURL: (p) => "chrome-extension://abc/" + p, getManifest: () => ({ version: "9.9.9", optional_host_permissions: [] }), reload() {},
      onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener: (f) => (L.msg = f) },
      connectNative: () => { const ls = []; return { onMessage: { addListener: (f) => ls.push(f) }, onDisconnect: { addListener() {} }, disconnect() {},
        postMessage(m) { posted.push(m); setTimeout(() => ls.forEach((f) => f({ ...(answers[m.type] || { ok: true }), id: m.id })), 0); } }; } },
    commands: { onCommand: { addListener() {} } }, action: { onClicked: { addListener() {} }, setBadgeText() {}, setBadgeBackgroundColor() {} },
    contextMenus: { create() {}, onClicked: { addListener() {} } }, notifications: { create() {} },
    storage: { local: { get: async (k) => Object.fromEntries((Array.isArray(k) ? k : [k]).map((x) => [x, structuredClone(store[x])])), set: async (o) => { Object.assign(store, structuredClone(o)); } } },
    scripting: {}, tabs: {},
  };
  await import("../extension/background.js");
  const ask = (m, sender = { url: "chrome-extension://abc/dashboard.html" }) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("no answer to " + m.type + (m.action ? "/" + m.action : ""))), 3000); L.msg(m, sender, (r) => { clearTimeout(t); res(r); }); });
  const tab = { tab: { id: 3 }, url: "https://www.tiktok.com/search?q=fryer" };

  assert.match((await ask({ type: "project-new", name: "Fryer" })).error, /Research is off/);
  assert.match((await ask({ type: "project-list" }, tab)).error, /Research is off/); // the select bar shows no project menu
  store.features = { research: true };
  const { project } = await ask({ type: "project-new", name: "Fryer" });
  assert.deepEqual((await ask({ type: "project-list" }, tab)).projects, [{ id: project.id, name: "Fryer" }]);

  const f = await ask({ type: "project-find", id: project.id, query: "fryer" });
  assert.ok(f.ok, JSON.stringify(f));
  assert.deepEqual([posted.at(-1).type, posted.at(-1).query], ["search", "fryer"]);
  assert.deepEqual(store.projects[0].finds[0].items.map((x) => x.url), ["https://www.youtube.com/watch?v=9"]);

  // a TikTok search page sent from the select bar becomes a find; a creator's own grid becomes a scan with the page's views
  await ask({ type: "project-page-scan", id: project.id, page: { url: "https://www.tiktok.com/search?q=air%20fryer", profile: false }, items: [{ url: "https://www.tiktok.com/@b/video/5", views: 7000 }, { url: "javascript:alert(1)" }] }, tab);
  const tf = store.projects[0].finds.find((x) => x.platform === "tiktok");
  assert.deepEqual([tf.query, tf.items[0].account, tf.items[0].view_count, tf.items.length], ["air fryer", "https://www.tiktok.com/@b", 7000, 1]);
  await ask({ type: "project-page-scan", id: project.id, page: { url: "https://www.instagram.com/cook/reels/", profile: true }, items: [{ url: "https://www.instagram.com/reel/AbC/", views: 12000 }] }, { tab: { id: 4 }, url: "https://www.instagram.com/cook/reels/" });
  assert.deepEqual(store.projects[0].scans.map((s) => [s.account, s.items[0].view_count]), [["https://www.instagram.com/cook/reels/", 12000]]);

  // comments: switch first, then YouTube through the helper, TikTok from the page
  assert.match((await ask({ type: "comments-fetch", urls: [lib[0].url] })).error, /comments are off/);
  store.features = { research: true, comments: true, ownAds: true };
  const cf = await ask({ type: "comments-fetch", urls: [lib[0].url, lib[1].url] });
  assert.deepEqual([cf.done, cf.skipped], [1, 1]);
  assert.deepEqual(store.library[0].comments, [{ text: "price?", likes: 3 }]);
  const cs = await ask({ type: "comments-save", url: "https://www.tiktok.com/@a/video/1", comments: [{ text: "  does it smell? ", likes: "12" }, { text: "" }] }, { tab: { id: 5 }, url: "https://www.tiktok.com/@a/video/1" });
  assert.equal(cs.n, 1); assert.deepEqual(store.library[1].comments, [{ text: "does it smell?", likes: 12 }]);
  assert.match((await ask({ type: "comments-save", url: "https://www.tiktok.com/@zz/video/9", comments: [{ text: "x" }] }, tab)).error, /Save this video first/);

  // own ads: add, update (link a reference), delete
  await ask({ type: "project-ads", id: project.id, mode: "add", ads: [{ name: "A1", spend: "50" }, { name: "A2", spend: 5 }] });
  const a1 = store.projects[0].ads[0];
  await ask({ type: "project-ads", id: project.id, mode: "update", ads: [{ ...a1, ref: lib[1].url }] });
  assert.equal(store.projects[0].ads[0].ref, lib[1].url);
  await ask({ type: "project-ads", id: project.id, mode: "delete", adId: store.projects[0].ads[1].id });
  assert.deepEqual(store.projects[0].ads.map((x) => x.name), ["A1"]);

  // Ad Studio: off by default; on -> the background looks up the saved file and uses the address from Settings
  assert.match((await ask({ type: "adstudio", action: "ping" })).error, /Ad Studio bridge is off/);
  store.features.adStudio = true; store.settings = { adStudioUrl: "http://localhost:5999" };
  const j = await ask({ type: "adstudio", action: "job", url: lib[1].url, productUrl: "https://shop.example/p", notes: "n", engine: "remix" });
  assert.equal(j.url, "http://localhost:5310/jobs/j1");
  assert.deepEqual([posted.at(-1).type, posted.at(-1).action, posted.at(-1).base, posted.at(-1).file], ["adstudio", "job", "http://localhost:5999", "/Users/x/Downloads/OneClick/a.mp4"]);
  await ask({ type: "adstudio", action: "job", url: "https://www.tiktok.com/@new/video/77", productUrl: "https://shop.example/p" });
  assert.equal(posted.at(-1).file, null); // not downloaded: Ad Studio fetches the link itself
  const c = await ask({ type: "adstudio", action: "clips", rights: "own", project: "Fryer", groups: [{ url: lib[1].url, clips: [{ start: 0, end: 2 }] }, { url: "https://www.tiktok.com/@zz/video/9", clips: [] }] });
  assert.deepEqual(c.results.map((r) => r.ok), [true, false]);
  assert.deepEqual([posted.at(-1).action, posted.at(-1).file, posted.at(-1).source.creator], ["clips", "/Users/x/Downloads/OneClick/a.mp4", "a"]);
  // web pages may not drive the bridge
  assert.deepEqual(await ask({ type: "adstudio", action: "ping" }, tab), { error: "not allowed" });
});
