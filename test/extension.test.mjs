import test from "node:test";
import assert from "node:assert/strict";
import { videoUrls, dedupeKey, canonical, PATTERNS } from "../extension/urls.js";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { analyze, recommend, filterLibrary, outliers } from "../extension/insights.js";
import { buildPrompt, parseJson, groupAssignments, ask as aiAsk } from "../extension/ai.js";

const D = 86400000, NOW = Date.UTC(2026, 10, 6);
const lib = [
  { url: "https://www.tiktok.com/@ana/video/1", platform: "TikTok", uploader: "Ana", uploader_id: "ana", duration: 12, view_count: 1000, like_count: 200, tags: ["ugc", "skincare"], description: "love it #UGC @brandco", at: NOW },
  { url: "https://www.tiktok.com/@ana/video/2", platform: "TikTok", uploader: "Ana", uploader_id: "ana", duration: 25, view_count: 5000, like_count: 100, tags: ["ugc"], description: "again @brandco @ana", at: NOW - D },
  { url: "https://www.instagram.com/reel/x/", platform: "Instagram", uploader: "Bo", uploader_id: "bo_official", duration: 40, view_count: 2000, like_count: 20, tags: ["ugc"], description: "#skincare routine", at: NOW - D },
];

test("videoUrls keeps video pages, strips tracking, dedupes, caps", () => {
  const hrefs = [
    "https://www.tiktok.com/@ana/video/1?lang=en", "https://www.tiktok.com/@ana/video/1", "https://www.tiktok.com/@ana",
    "https://www.instagram.com/reel/abc/?igsh=1", "https://www.youtube.com/watch?v=abc123&t=5", "https://example.com/video/1", "not a url",
  ];
  assert.deepEqual(videoUrls(hrefs), [
    "https://www.tiktok.com/@ana/video/1", "https://www.instagram.com/reel/abc", "https://www.youtube.com/watch?v=abc123",
  ]);
  assert.equal(videoUrls(hrefs, 1).length, 1);
});

test("dedupeKey: same video, different URL shapes", () => {
  assert.equal(dedupeKey("https://www.instagram.com/reel/AbC_1/?igsh=x"), dedupeKey("https://www.instagram.com/p/AbC_1/"));
  assert.equal(dedupeKey("https://www.tiktok.com/@a/video/123?lang=en"), "tt:123");
  assert.equal(dedupeKey("https://youtu.be/abc"), dedupeKey("https://www.youtube.com/watch?v=abc&t=3"));
  assert.notEqual(dedupeKey("https://www.tiktok.com/@a/video/1"), dedupeKey("https://www.tiktok.com/@a/video/2"));
});

test("analyze: totals, platform split, buckets, hashtags, headlines", () => {
  const a = analyze(lib);
  assert.equal(a.total, 3); assert.equal(a.creatorsCount, 2);
  assert.deepEqual(a.byPlatform[0], { k: "TikTok", n: 2 });
  assert.equal(a.buckets.find((b) => b.k === "<15s").n, 1);
  assert.equal(a.hashtags[0].k, "ugc"); assert.equal(a.hashtags[0].n, 3);
  assert.equal(a.totalViews, 8000);
  assert.ok(a.headlines[0].startsWith("67%"));
  assert.deepEqual(analyze([]).headlines, []);
});

test("filterLibrary: search incl. notes/tags, platform filter, sorts", () => {
  const l = [{ ...lib[0], note: "winner hook #swipe" }, lib[1], lib[2]];
  assert.deepEqual(filterLibrary(l, { q: "swipe" }).map((v) => v.url), [lib[0].url]);
  assert.equal(filterLibrary(l, { q: "ana ugc" }).length, 2);          // every word must match
  assert.equal(filterLibrary(l, { platform: "Instagram" }).length, 1);
  assert.equal(filterLibrary(l, { sort: "views" })[0].url, lib[1].url);  // 5000 views
  assert.equal(filterLibrary(l, { sort: "like" })[0].url, lib[0].url);   // 20% like rate
  assert.equal(filterLibrary(l, { sort: "length" })[0].url, lib[2].url); // 40s
});

test("outliers: follower baseline, median fallback, and no verdict on tiny samples", () => {
  const mk = (url, platform, views, followers) => ({ url, platform, view_count: views, like_count: 1, channel_follower_count: followers, at: NOW });
  const l = [mk("a", "YouTube", 500000, 100000), mk("b", "YouTube", 5000, 100000), // a = 5x followers, b = 0.05x
    mk("c", "TikTok", 1000), mk("d", "TikTok", 1200), mk("e", "TikTok", 900), mk("f", "TikTok", 20000), // f ~ 17x median
    mk("g", "Instagram", 99999)]; // single Instagram video: no baseline, no verdict
  const o = outliers(l);
  assert.deepEqual(o.map((x) => x.video.url), ["f", "a"]); // f: 18x median (score 6.1), a: 5x followers (score 5)
  assert.ok(o[0].basis.includes("median")); assert.ok(o[1].basis.includes("follower"));
});

test("TikTok creators are keyed by the handle in the URL, not the numeric uploader_id", () => {
  const tt = [{ url: "https://www.tiktok.com/@glow.ana/video/1", platform: "TikTok", uploader: "glow.ana", uploader_id: "107955", at: NOW },
    { url: "https://www.tiktok.com/@glow.ana/video/2", platform: "TikTok", uploader: "glow.ana", uploader_id: "107955", at: NOW }];
  assert.equal(analyze(tt).creators[0].k, "glow.ana");
  assert.equal(recommend(tt).creators[0].url, "https://www.tiktok.com/@glow.ana");
});

test("recommend: derived from library only, profile + tag links, excludes known creators from mentions", () => {
  const r = recommend(lib);
  assert.equal(r.creators[0].url, "https://www.tiktok.com/@ana");
  assert.equal(r.creators[1].url, "https://www.instagram.com/bo_official/");
  assert.deepEqual(r.mentions.map((m) => m.handle), ["brandco"]); // "ana" is already saved
  assert.equal(r.hashtags[0].links[0].url, "https://www.tiktok.com/tag/ugc");
  assert.equal(r.channels.length, 4);
});

// ---- wiring: real background.js against a mocked chrome + host port ----
test("background: one-click and batch reach the host and fill the library", async () => {
  const store = {}, notes = [], posted = [], L = {};
  globalThis.chrome = {
    alarms: { create(a) { L.alarm = a; }, onAlarm: { addListener: (f) => (L.onAlarm = f) } },
    runtime: {
      lastError: undefined, getURL: (p) => "chrome-extension://abc/" + p, getManifest: () => ({ version: "9.9.9", optional_host_permissions: ["https://www.tiktok.com/*", "https://www.instagram.com/*"] }), reload: () => (L.reloaded = true),
      onInstalled: { addListener: (f) => (L.installed = f) }, onStartup: { addListener() {} },
      onMessage: { addListener: (f) => (L.msg = f) },
      connectNative() {
        const ls = [];
        return {
          onMessage: { addListener: (f) => { ls.push(f); L.hostSend = (m) => ls.forEach((g) => g(m)); } }, onDisconnect: { addListener() {} },
          disconnect() { L.disconnected = true; },
          postMessage(m) {
            posted.push(m);
            if (m.url && m.url.includes("slow")) return setTimeout(() => { ls.forEach((f) => f({ id: m.id, type: "progress", pct: 40 })); setTimeout(() => ls.forEach((f) => f({ id: m.id, ok: true, meta: { webpage_url: m.url, extractor_key: "TikTok" } })), 400); }, 0);
            if (m.type === "expand") return setTimeout(() => ls.forEach((f) => f({ id: m.id, type: "expanded", ok: true, urls: L.expandUrls || ["https://www.tiktok.com/@e/video/501", "https://www.tiktok.com/@e/video/502", "https://www.tiktok.com/@e/video/503"] })), 0);
            if (m.type === "update") { L.updates = (L.updates || 0) + 1; L.healed = true; return setTimeout(() => ls.forEach((f) => f({ id: m.id, type: "updated", ok: true, output: "upgraded" })), 0); }
            if (m.url && m.url.includes("heal") && !L.healed) return setTimeout(() => ls.forEach((f) => f({ id: m.id, ok: false, error: "Site refused the request (403): update engine from the dashboard" })), 0);
            if (m.url && m.url.includes("hold") && L.hold) { L.held = (L.held || []).concat(m); L.release = () => { L.held.forEach((h) => ls.forEach((f) => f({ id: h.id, ok: true, meta: { webpage_url: h.url, extractor_key: "TikTok", file: "/h.mp4" } }))); L.held = []; }; return; }
            if (m.type === "hello") return setTimeout(() => ls.forEach((f) => f({ id: m.id, type: "hello", dev: !!L.dev })), 0);
            setTimeout(() => ls.forEach((f) => f({ id: m.id, ok: true, meta: { webpage_url: m.url, extractor_key: "TikTok", uploader: "Ana", file: "/x/" + m.id + ".mp4", ...(m.url.includes("instagram") ? { title: "Video by bo", description: "Great hook here\nmore text" } : {}) } })), 0);
          },
        };
      },
    },
    commands: { onCommand: { addListener: (f) => (L.cmd = f) } },
    action: { onClicked: { addListener: (f) => (L.click = f) }, setBadgeText() {}, setBadgeBackgroundColor() {} },
    contextMenus: { create() {}, onClicked: { addListener: (f) => (L.menu = f) } },
    notifications: { create: (o) => notes.push(o) },
    storage: { local: { get: async (k) => { await new Promise((r) => setTimeout(r, 2)); return { [k]: structuredClone(store[k]) }; }, set: async (o) => { await new Promise((r) => setTimeout(r, 2)); Object.assign(store, o); } } },
    scripting: { registerContentScripts: async (a) => (L.registered = a), unregisterContentScripts: async () => { L.unregistered = true; }, executeScript: async (o) => o.files ? (L.injected = o) : [{ result: ["https://www.tiktok.com/@a/video/10", "https://www.tiktok.com/@a/video/11", "https://example.com/x"] }] },
    tabs: { create() {}, query: async () => [{ id: 3, url: "https://www.tiktok.com/@cmd/video/4242" }] },
  };
  await import("../extension/background.js");

  await L.click({ id: 1, url: "https://www.tiktok.com/@a/video/9" });
  assert.equal(posted[0].url, "https://www.tiktok.com/@a/video/9");
  assert.equal(store.library.length, 1);
  assert.equal(notes.at(-1).title, "Saved");

  await L.menu({ menuItemId: "dl-all" }, { id: 1 });
  assert.deepEqual(posted.slice(1).map((m) => m.url).sort(), ["https://www.tiktok.com/@a/video/10", "https://www.tiktok.com/@a/video/11"]);
  assert.equal(store.library.length, 3);
  assert.equal(notes.at(-1).message, "2 saved, 0 failed");

  // hello: non-dev closes the port; the helper's reload message restarts the extension
  posted.length = 0; L.installed(); await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual([posted[0].type, posted[0].version, L.disconnected], ["hello", "9.9.9", true]);
  L.hostSend({ type: "reload", id: null }); assert.equal(L.reloaded, true);
  // library title: Instagram "Video by X" becomes the caption's first line
  await L.click({ id: 1, url: "https://www.instagram.com/p/zz/" });
  assert.equal(store.library.at(-1).title, "Great hook here");

  // concurrency: 25 downloads finishing together must all land in the library (no lost updates)
  const before = store.library.length;
  await Promise.all(Array.from({ length: 25 }, (_, i) => L.click({ id: 1, url: `https://www.tiktok.com/@c/video/${i}` })));
  assert.equal(store.library.length, before + 25);
  // live queue: progress is mirrored to storage while running, and the job ends as done
  const slow = L.click({ id: 1, url: "https://www.tiktok.com/@s/video/slow" });
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(store.jobs.at(-1) && [store.jobs.at(-1).state, store.jobs.at(-1).pct], ["running", 40]);
  await slow; await new Promise((r) => setTimeout(r, 300));
  assert.equal(store.jobs.at(-1).state, "done");

  // duplicates: batch skips a saved video (no host call); a direct click still downloads; settings reach the host
  store.settings = { folder: "~/refs", naming: "creator-id" };
  const callsBefore = posted.length;
  await L.menu({ menuItemId: "dl-all" }, { id: 1 }); // page links 10 and 11 are already saved
  assert.equal(posted.length, callsBefore);
  assert.equal(notes.at(-1).message, "0 saved, 2 already saved, 0 failed");
  await L.click({ id: 1, url: "https://www.tiktok.com/@a/video/10" });
  assert.deepEqual([posted.at(-1).folder, posted.at(-1).naming], ["~/refs", "creator-id"]);

  // self-heal: a 403 triggers one engine update and one retry, which then succeeds
  await L.click({ id: 1, url: "https://www.tiktok.com/@h/video/heal" });
  assert.equal(L.updates, 1); assert.equal(notes.at(-1).title, "Saved");
  // weekly auto-update: alarm registered; fires only when the last update is older than 7 days
  assert.equal(L.alarm, "update");
  L.updates = 0; store.lastUpdate = Date.now();
  await L.onAlarm({ name: "update" }); await new Promise((r) => setTimeout(r, 20));
  assert.equal(L.updates, 0);
  store.lastUpdate = Date.now() - 8 * 86400000;
  await L.onAlarm({ name: "update" }); await new Promise((r) => setTimeout(r, 30));
  assert.equal(L.updates, 1); assert.ok(Date.now() - store.lastUpdate < 5000);

  // in-page button: page-state decides single / batch / none; page-download reaches the host
  const ask = (m) => new Promise((res) => L.msg(m, m.type.startsWith("page-") ? { tab: { id: 1 } } : { url: "chrome-extension://abc/dashboard.html" }, res));
  assert.deepEqual(await ask({ type: "page-state", href: "https://www.tiktok.com/@a/video/77", hrefs: [] }), { kind: "single" });
  const feed = ["https://www.tiktok.com/@a/video/81", "https://www.tiktok.com/@a/video/82", "https://www.tiktok.com/@a"];
  assert.deepEqual(await ask({ type: "page-state", href: "https://www.tiktok.com/@a", hrefs: feed }), { kind: "batch", n: 2 });
  assert.deepEqual(await ask({ type: "page-state", href: "https://example.com/", hrefs: ["https://example.com/a"] }), { kind: null });
  const before2 = posted.length;
  assert.deepEqual(await ask({ type: "page-download", href: "https://www.tiktok.com/@a", hrefs: feed }), { ok: 2, skipped: 0, failed: 0 });
  assert.equal(posted.length, before2 + 2);
  await ask({ type: "buttons", on: true });
  assert.deepEqual([L.registered[0].id, L.registered[0].js[0], L.registered[0].matches.includes("https://www.instagram.com/*")], ["oneclick-button", "content.js", true]);

  // latest-N-from-profile: expand then download each (one already saved is skipped)
  await L.click({ id: 1, url: "https://www.tiktok.com/@e/video/501" });
  assert.deepEqual(await ask({ type: "expand-download", url: "https://www.tiktok.com/@e", limit: 3 }), { found: 3, ok: 2, skipped: 1, failed: 0 });

  // library edits go through the background (shared lock): note then delete
  const noteUrl = "https://www.tiktok.com/@a/video/9";
  await ask({ type: "lib-note", url: noteUrl, note: "keep #hook" });
  assert.equal(store.library.find((v) => v.url === noteUrl).note, "keep #hook");
  await ask({ type: "lib-delete", url: noteUrl });
  assert.equal(store.library.some((v) => v.url === noteUrl), false);

  // sender checks: a web page / other context cannot use privileged actions; content script cannot either
  const forged = (m, sender) => new Promise((res) => L.msg(m, sender, res));
  assert.deepEqual(await forged({ type: "lib-delete", url: "x" }, { tab: { id: 9 }, url: "https://evil.example/" }), { error: "not allowed" });
  assert.deepEqual(await forged({ type: "expand-download", url: "https://www.tiktok.com/@e", limit: 3 }, { tab: { id: 9 } }), { error: "not allowed" });
  assert.deepEqual(await forged({ type: "page-state", href: "https://www.tiktok.com/@a/video/1", hrefs: [] }, {}), { error: "not allowed" });
  // expand output goes through the platform allowlist
  const hostile = posted.length;
  L.expandUrls = ["http://127.0.0.1:8080/x", "https://www.tiktok.com/@e/video/601"];
  assert.deepEqual(await ask({ type: "expand-download", url: "https://www.tiktok.com/@e", limit: 2 }), { found: 1, ok: 1, skipped: 0, failed: 0 });
  assert.ok(posted.slice(hostile).every((m) => !String(m.url).includes("127.0.0.1")));

  // rapid clicks: the same video clicked 3x while running is ONE host call; 10 different videos are 10 calls, none lost
  const n0 = posted.length, lib0 = store.library.length;
  await Promise.all([1, 2, 3].map(() => L.click({ id: 1, url: "https://www.tiktok.com/@d/video/slow-dup" })));
  assert.equal(posted.length - n0, 1);
  await Promise.all(Array.from({ length: 10 }, (_, i) => L.click({ id: 1, url: `https://www.tiktok.com/@r/video/${9000 + i}` })));
  assert.equal(posted.length - n0, 11); assert.equal(store.library.length - lib0, 11);
  // select mode: the menu injects select.js; the ticked links come back as page-download with no page href
  await L.menu({ menuItemId: "select" }, { id: 7 });
  assert.deepEqual(L.injected, { target: { tabId: 7 }, files: ["detect.js", "select.js"] });
  const sel = ["https://www.tiktok.com/@q/video/701", "https://www.tiktok.com/@q/video/702"];
  assert.deepEqual(await ask({ type: "page-download", href: "", hrefs: sel }), { ok: 2, skipped: 0, failed: 0 });

  // collections: download into one, move, delete; keyboard shortcut downloads the active tab; popup action reports the result
  const fa = posted.length;
  assert.deepEqual(await ask({ type: "download", urls: ["https://www.tiktok.com/@f/video/801", "https://www.tiktok.com/@f/video/802"], folder: "Hooks" }), { ok: 2, skipped: 0, failed: 0 });
  assert.deepEqual(store.folders, ["Hooks"]);
  assert.equal(store.library.filter((v) => v.folder === "Hooks").length, 2);
  await ask({ type: "lib-folder", urls: ["https://www.tiktok.com/@f/video/801"], folder: "Pricing" });
  assert.deepEqual([store.library.find((v) => v.url.endsWith("/801")).folder, store.folders.includes("Pricing")], ["Pricing", true]);
  await ask({ type: "lib-folder", urls: ["https://www.tiktok.com/@f/video/801"], folder: "" });
  assert.equal(store.library.find((v) => v.url.endsWith("/801")).folder, undefined);
  await ask({ type: "folder-delete", name: "Hooks" });
  assert.equal(store.library.some((v) => v.folder === "Hooks"), false); assert.equal(store.folders.includes("Hooks"), false);
  assert.deepEqual(await ask({ type: "folder-add", name: "  " }), { error: "Enter a name" });
  await L.cmd("download-current"); await new Promise((r) => setTimeout(r, 30));
  assert.ok(posted.some((m) => m.url === "https://www.tiktok.com/@cmd/video/4242"));
  assert.deepEqual(await ask({ type: "download-one", url: "https://www.tiktok.com/@cmd/video/4243" }), { ok: true, error: undefined });
  // select mode can file the ticked videos straight into a collection
  await ask({ type: "page-download", href: "", hrefs: ["https://www.tiktok.com/@g/video/901"], folder: "Picked" });
  assert.equal(store.library.find((v) => v.url.endsWith("/901")).folder, "Picked");

  // queue: popup one-click does not re-download a saved video; enqueue-many answers at once and files into a collection
  assert.deepEqual(await ask({ type: "enqueue", url: "https://www.tiktok.com/@a/video/10" }), { saved: true, url: "https://www.tiktok.com/@a/video/10", title: undefined });
  const q0 = posted.length;
  const one = await ask({ type: "enqueue", url: "https://www.instagram.com/natgeo/reel/NEW1/?igsh=x" });
  assert.deepEqual(one, { queued: true, url: "https://www.instagram.com/reel/NEW1" });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(posted.at(-1).url, "https://www.instagram.com/reel/NEW1"); assert.equal(posted.length, q0 + 1);
  const many = await forged({ type: "enqueue-many", hrefs: ["https://www.instagram.com/natgeo/reel/M1/", "https://www.instagram.com/natgeo/p/M2/", "https://www.tiktok.com/@a/video/10", "https://evil.example/x"], folder: "IG refs" }, { tab: { id: 5 } });
  assert.deepEqual(many, { queued: 2, saved: 1 });
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual([...new Set(store.library.filter((v) => v.folder === "IG refs").map((v) => dedupeKey(v.url)))].sort(), ["ig:M1", "ig:M2", "tt:10"]);
  // queue limits: at most 3 running at once; cancel a waiting job; retry a failed one
  L.hold = true;
  for (let i = 0; i < 5; i++) L.click({ id: 1, url: `https://www.tiktok.com/@w/video/hold${i}` });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(store.jobs.filter((j) => j.state === "running").length, 3);
  const waiting = store.jobs.find((j) => j.state === "queued");
  await ask({ type: "queue", action: "cancel", id: waiting.id }); await new Promise((r) => setTimeout(r, 300));
  assert.equal(store.jobs.find((j) => j.id === waiting.id).state, "canceled");
  L.hold = false; L.release(); await new Promise((r) => setTimeout(r, 400));
  assert.equal(store.jobs.filter((j) => j.url.includes("hold") && j.state === "done").length, 4);
  await ask({ type: "queue", action: "retry", id: waiting.id }); await new Promise((r) => setTimeout(r, 400));
  assert.equal(store.jobs.filter((j) => j.url.endsWith("hold" + waiting.url.slice(-1)) && j.state === "done").length, 1);
  await ask({ type: "queue", action: "clear" }); await new Promise((r) => setTimeout(r, 300));
  assert.equal(store.jobs.length, 0);

  await L.click({ id: 1, url: "chrome://extensions" }); // not http(s): must not call the host
  assert.equal(posted.filter((m) => m.type === "hello").length, 1); // the chrome:// click never reached the host

  // restart: a job that was running when the worker stopped is queued again and finished by the new worker
  store.jobs = [{ id: "r1", url: "https://www.tiktok.com/@z/video/77001", state: "running", pct: 40, at: 1 }];
  const p0 = posted.length;
  await import("../extension/background.js?restart"); await new Promise((r) => setTimeout(r, 400));
  assert.ok(posted.slice(p0).some((m) => m.url === "https://www.tiktok.com/@z/video/77001"));
  assert.equal(store.jobs.find((j) => j.id === "r1").state, "done");
});

test("filterLibrary by collection; AI prompt is capped and has no urls; assignments map back safely", async () => {
  const l = [{ ...lib[0], folder: "Hooks" }, lib[1], { ...lib[2], folder: "Pricing" }];
  assert.deepEqual(filterLibrary(l, { folder: "Hooks" }).map((v) => v.url), [lib[0].url]);
  assert.deepEqual(filterLibrary(l, { folder: "__none" }).map((v) => v.url), [lib[1].url]);
  const many = Array.from({ length: 100 }, (_, i) => ({ ...lib[0], url: "https://www.tiktok.com/@a/video/" + i, title: "t" + i }));
  const p = buildPrompt("sort", [...many, ...l], ["Hooks"]);
  assert.equal(p.urls.length, 60); assert.ok(!p.text.includes("tiktok.com/@a/video"));      // urls never sent
  assert.equal(buildPrompt("sort", l, []).urls.length, 1);                                     // only unfiled videos are sorted
  assert.deepEqual(groupAssignments({ assignments: [{ i: 0, collection: "A" }, { i: 5, collection: "B" }, { i: 1, collection: "" }, { i: 1, collection: "A" }] }, ["u0", "u1"]), { A: ["u0", "u1"] });
  assert.deepEqual(parseJson('Sure!\n```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => parseJson("no json"));
  let seen; const fake = async (url, o) => { seen = { url, o }; return { ok: true, json: async () => ({ content: [{ text: '{"summary":"x"}' }] }) }; };
  assert.deepEqual(await aiAsk("k", "hi", fake), { summary: "x" });
  assert.equal(seen.url, "https://api.anthropic.com/v1/messages"); assert.equal(seen.o.headers["x-api-key"], "k");
  await assert.rejects(aiAsk("k", "hi", async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "bad key" } }) })), /bad key/);
});

test("urls: Instagram /<user>/reel/ links, canonical form, audio pages excluded; detect.js uses the same patterns", () => {
  assert.equal(canonical("https://www.instagram.com/natgeo/reel/DfaOQ3uT1uD/"), "https://www.instagram.com/reel/DfaOQ3uT1uD");
  assert.equal(canonical("https://www.instagram.com/natgeo/p/DeuOR-CjKE9/?img_index=1"), "https://www.instagram.com/p/DeuOR-CjKE9");
  assert.equal(canonical("https://www.instagram.com/reels/DezY3q8TCbx/"), "https://www.instagram.com/reel/DezY3q8TCbx");
  assert.equal(canonical("https://www.instagram.com/reels/audio/123/"), null);
  assert.equal(canonical("https://www.instagram.com/natgeo/"), null);
  assert.equal(canonical("https://www.tiktok.com/@/video/7696986447479311648"), "https://www.tiktok.com/@/video/7696986447479311648");
  assert.equal(dedupeKey("https://www.instagram.com/natgeo/reel/X1/"), dedupeKey("https://www.instagram.com/p/X1/"));
  assert.deepEqual(videoUrls(["https://www.instagram.com/a/reel/X1/", "https://www.instagram.com/reel/X1/"]), ["https://www.instagram.com/reel/X1"]);
  const win = {}; vm.runInNewContext(readFileSync(new URL("../extension/detect.js", import.meta.url), "utf8"), { window: win });
  assert.deepEqual([...win.__oneclickDetect.PATTERNS].map((r) => r.source), PATTERNS.map((r) => r.source));
});
