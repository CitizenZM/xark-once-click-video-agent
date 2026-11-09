import test from "node:test";
import assert from "node:assert/strict";
import { cleanProject, projectVideos, recommendAccounts, scanSummary, recommendedVideos, searchLinks, productStats, productFilter, needsTags,
  opportunities, remixBank, clipListTSV } from "../extension/projects.js";
import { buildPlanPrompt } from "../extension/ai.js";
import { segmentsOf } from "../extension/transcribe.js";

const NOW = Date.UTC(2026, 10, 8, 12), H = 3600000;
const tt = (h, id, x = {}) => ({ url: `https://www.tiktok.com/@${h}/video/${id}`, platform: "TikTok", uploader: h, uploader_id: "9" + id, at: NOW, ...x });
const fryer = (h, id, views, x = {}) => tt(h, id, { view_count: views, title: `air fryer crispy wings ${id}`, description: "best air fryer #airfryer #kitchen", ...x });

test("cleanProject: only https links, bounded fields, junk dropped", () => {
  assert.equal(cleanProject({ id: "bad id!", name: "x" }), null);
  assert.equal(cleanProject({ id: "abcdef12", name: "  " }), null);
  const p = cleanProject({ id: "abcdef12", name: "n".repeat(99), product: 5, urls: ["https://a.com/1", "javascript:alert(1)", "https://a.com/1", 7],
    scans: [{ account: "http://x.com", items: [] }, { account: "https://www.tiktok.com/@a", at: NOW, items: [{ url: "https://www.tiktok.com/@a/video/1", view_count: "12", like_count: -4, title: 3 }, { url: "x" }] }],
    plan: { summary: "x".repeat(50000) }, evil: 1 });
  assert.equal(p.name.length, 60);
  assert.deepEqual(p.urls, ["https://a.com/1"]);
  assert.deepEqual(p.scans, [{ account: "https://www.tiktok.com/@a", at: NOW, items: [{ url: "https://www.tiktok.com/@a/video/1", title: "3", view_count: 12, like_count: undefined, duration: undefined, timestamp: undefined }] }]);
  assert.equal(p.plan, undefined); // too large to keep
  assert.equal(p.evil, undefined);
});

test("recommended accounts: mentions and keyword-sharing creators outside the project first, then its own creators", () => {
  const inP = [fryer("chefa", 1, 10000, { description: "best air fryer #airfryer #kitchen thanks @gadgetguy" }), fryer("chefa", 2, 30000), fryer("chefb", 3, 5000)];
  const lib = [...inP, fryer("otherchef", 4, 90000), fryer("otherchef", 5, 70000), tt("cats", 6, { title: "cat video", view_count: 1e6 })];
  const p = cleanProject({ id: "proj0001", name: "Fryer", urls: inP.map((v) => v.url), scans: [{ account: "https://www.tiktok.com/@gadgetguy", at: NOW, items: [] }] });
  assert.equal(projectVideos(lib, p).length, 3);
  const r = recommendAccounts(lib, p);
  assert.deepEqual(r.fresh.map((x) => [x.handle, x.url, x.scanned]), [["gadgetguy", "https://www.tiktok.com/@gadgetguy", true], ["otherchef", "https://www.tiktok.com/@otherchef", false]].sort((a, b) => (a[0] === "otherchef" ? -1 : 1)));
  assert.match(r.fresh.find((x) => x.handle === "otherchef").reasons[0], /2 saved videos share .*air.*fryer/);
  assert.ok(!r.fresh.some((x) => x.handle === "cats" || x.handle === "chefa"));
  assert.deepEqual(r.mine.map((x) => x.handle), ["chefa", "chefb"]);
});

test("account scan: each video against that account's own median; recommended = unsaved at 1.5x+", () => {
  const lib = [tt("a", 3)];
  const items = [1, 2, 3, 4, 5].map((i) => ({ url: `https://www.tiktok.com/@a/video/${i}`, view_count: [1000, 1000, 9000, 1200, 2000][i - 1], timestamp: (NOW - 10 * H) / 1000 }));
  const s = scanSummary({ account: "https://www.tiktok.com/@a", at: NOW, items }, lib);
  assert.deepEqual([s.median, s.by, s.items[0].multiple, s.items[0].perHour, s.items[0].saved, s.outliers.length], [1200, "views", 7.5, 900, true, 1]);
  const rec = recommendedVideos({ scans: [{ account: "https://www.tiktok.com/@a", at: NOW, items }] }, lib);
  assert.deepEqual(rec.map((x) => x.url.slice(-1)), ["5"]); // 9000 is already saved; 2000 = 1.7x
  assert.match(rec[0].basis, /1\.7x the median views of this account's last 5 videos/);
});

test("search links: encoded, Instagram only for single-word tags, Amazon only for products", () => {
  const l = searchLinks("air fryer & wings", { product: true });
  assert.deepEqual(l.map((x) => x.name), ["TikTok", "YouTube Shorts", "Meta ads", "Amazon"]);
  assert.ok(l[0].url.endsWith("air%20fryer%20%26%20wings"));
  assert.deepEqual(searchLinks("#airfryer").map((x) => x.name), ["TikTok", "Instagram #", "YouTube Shorts", "Meta ads"]);
  assert.deepEqual(searchLinks("  "), []);
});

test("products, product mode, opportunities and the remix bank", () => {
  const tag = (product, hook) => ({ ai_tags: { hook, angle: "convenience", audience: "parents", emotion: "relief", usp: "", cta: "", product, category: "kitchen appliance", brand: "" } });
  const segs = (t) => [{ start: 0, end: 2.5, text: `Stop scrolling ${t}` }, { start: 2.5, end: 9, text: "middle" }, { start: 20, end: 24, text: `link in bio ${t}` }];
  const vs = [fryer("a", 1, 50000, { ...tag("air fryer", "question"), segments: segs("A"), file: "/v/1.mp4" }), fryer("b", 2, 40000, { ...tag("air fryer", "question"), segments: segs("B") }),
    fryer("c", 3, 45000, { ...tag("air fryer", "question") }), fryer("d", 4, 2000, { ...tag("blender", "demo") }), fryer("e", 5, 1500, { ...tag("blender", "demo") }), fryer("f", 6, 1800, tag("blender", "demo"))];
  const ps = productStats(vs);
  assert.deepEqual(ps.map((p) => [p.product, p.n, p.creators, p.hooks[0]]), [["air fryer", 3, 3, "question"], ["blender", 3, 3, "demo"]]);
  assert.equal(productFilter(vs, "blender").length, 3);
  assert.ok(needsTags({ ai_tags: { hook: "x" } }) && !needsTags(vs[0]));
  const o = opportunities(vs);
  assert.ok(o.some((x) => x.kind === "double down" && /hook type “question”/.test(x.title)));
  assert.ok(o.some((x) => x.kind === "avoid" && /hook type “demo”/.test(x.title)));
  assert.ok(o.some((x) => x.kind === "gap" && /Meta Ad Library/.test(x.title)));
  const b = remixBank(vs);
  const hookA = b.clips.find((c) => c.role === "hook" && c.v === vs[0]);
  assert.deepEqual([hookA.start, hookA.end, hookA.text], [0, 2.5, "Stop scrolling A"]);
  assert.ok(b.clips.some((c) => c.role === "cta" && c.text === "link in bio B"));
  assert.ok(b.recipes.length >= 1 && b.recipes.every((r) => r.body !== r.hook.v));
  assert.match(clipListTSV(b.clips).split("\n")[1], /^\/v\/1\.mp4\t0:00\t0:02\thook\tStop scrolling A\thttps:/);
});

test("plan prompt: spoken lines with seconds, measured facts, and the licensing rule", () => {
  const t = buildPlanPrompt({ name: "Fryer", product: "Cosori 5qt, $20 off" }, [fryer("a", 1, 9, { segments: [{ start: 0, end: 2.5, text: "Stop scrolling" }], cookie: "SECRET" })], { opportunities: [{ title: "Make more question hooks", basis: "3 videos" }] });
  for (const s of ['[0,2.5,"Stop scrolling"]', "Cosori 5qt, $20 off", "Make more question hooks", "never tell them to repost", '"remixes"']) assert.ok(t.includes(s), s);
  assert.ok(!t.includes("SECRET"));
  assert.deepEqual(segmentsOf([{ start: 1, end: 2, text: "a" }, { start: "x", end: 2, text: "b" }, ...Array(40).fill({ start: 0, end: 1, text: "z".repeat(300) })]).map((s) => s.text.length).slice(0, 2), [1, 120]);
  assert.equal(segmentsOf(null).length, 0);
});

// ---- wiring: real background.js, mocked chrome + helper port ----
test("background: project messages create, fill, scan (via the helper, stats on) and plan; web pages are refused", async () => {
  const store = { library: [tt("a", 1, { view_count: 5 })] }, L = {}, posted = [];
  globalThis.chrome = {
    alarms: { create() {}, onAlarm: { addListener() {} } },
    runtime: {
      lastError: undefined, getURL: (p) => "chrome-extension://abc/" + p, getManifest: () => ({ version: "9.9.9", optional_host_permissions: [] }), reload() {},
      onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener: (f) => (L.msg = f) },
      connectNative: () => { const ls = []; return { onMessage: { addListener: (f) => ls.push(f) }, onDisconnect: { addListener() {} }, disconnect() {},
        postMessage(m) { posted.push(m); setTimeout(() => ls.forEach((f) => f({ id: m.id, ok: true, items: [{ url: "https://www.tiktok.com/@b/video/7", view_count: 900 }, { url: "https://evil.example/x", view_count: 1 }, { url: "https://www.tiktok.com/@b/video/8", view_count: 100 }] })), 0); } }; },
    },
    commands: { onCommand: { addListener() {} } }, action: { onClicked: { addListener() {} }, setBadgeText() {}, setBadgeBackgroundColor() {} },
    contextMenus: { create() {}, onClicked: { addListener() {} } }, notifications: { create() {} },
    storage: { local: { get: async (k) => ({ [k]: structuredClone(store[k]) }), set: async (o) => { Object.assign(store, structuredClone(o)); } } },
    scripting: {}, tabs: {},
  };
  await import("../extension/background.js");
  const ask = (m, sender = { url: "chrome-extension://abc/dashboard.html" }) => new Promise((res) => L.msg(m, sender, res));
  assert.deepEqual(await ask({ type: "project-new", name: "x" }, { tab: { id: 1 }, url: "https://www.tiktok.com/" }), { error: "not allowed" });
  const { project } = await ask({ type: "project-new", name: "Fryer ads", product: "Cosori" });
  await ask({ type: "project-add", id: project.id, urls: [store.library[0].url, "https://evil.example/v.mp4", "notaurl"] });
  assert.deepEqual(store.projects[0].urls, [store.library[0].url]); // only supported video links
  const r = await ask({ type: "project-scan", id: project.id, url: "https://www.tiktok.com/@b", limit: 500 });
  assert.ok(r.ok, JSON.stringify(r));
  assert.deepEqual([posted.at(-1).type, posted.at(-1).stats, posted.at(-1).limit], ["expand", true, 60]);
  assert.deepEqual(store.projects[0].scans[0].items.map((x) => x.url.slice(-1)), ["7", "8"]);
  await ask({ type: "project-scan", id: project.id, url: "https://www.tiktok.com/@b" });
  assert.equal(store.projects[0].scans.length, 1); // a re-scan replaces the old one
  assert.equal(recommendedVideos(store.projects[0], store.library)[0].url, "https://www.tiktok.com/@b/video/7"); // what the Projects tab lists
  await ask({ type: "project-plan", id: project.id, plan: { summary: "s", order: [] } });
  assert.equal(store.projects[0].plan.summary, "s");
  await ask({ type: "project-remove", id: project.id, urls: [store.library[0].url] });
  assert.equal(store.projects[0].urls.length, 0);
  assert.deepEqual(await ask({ type: "project-add", id: "nosuchid1", urls: [] }), { error: "No such project" });
  await ask({ type: "project-delete", id: project.id });
  assert.deepEqual(store.projects, []);
  assert.equal(store.library.length, 1); // the library is untouched
});
