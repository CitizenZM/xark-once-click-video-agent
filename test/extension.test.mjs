import test from "node:test";
import assert from "node:assert/strict";
import { videoUrls, dedupeKey } from "../extension/urls.js";
import { analyze, recommend, filterLibrary, outliers } from "../extension/insights.js";

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
            if (m.type === "hello") return setTimeout(() => ls.forEach((f) => f({ id: m.id, type: "hello", dev: !!L.dev })), 0);
            setTimeout(() => ls.forEach((f) => f({ id: m.id, ok: true, meta: { webpage_url: m.url, extractor_key: "TikTok", uploader: "Ana", file: "/x/" + m.id + ".mp4", ...(m.url.includes("instagram") ? { title: "Video by bo", description: "Great hook here\nmore text" } : {}) } })), 0);
          },
        };
      },
    },
    action: { onClicked: { addListener: (f) => (L.click = f) }, setBadgeText() {}, setBadgeBackgroundColor() {} },
    contextMenus: { create() {}, onClicked: { addListener: (f) => (L.menu = f) } },
    notifications: { create: (o) => notes.push(o) },
    storage: { local: { get: async (k) => { await new Promise((r) => setTimeout(r, 2)); return { [k]: structuredClone(store[k]) }; }, set: async (o) => { await new Promise((r) => setTimeout(r, 2)); Object.assign(store, o); } } },
    scripting: { registerContentScripts: async (a) => (L.registered = a), unregisterContentScripts: async () => { L.unregistered = true; }, executeScript: async () => [{ result: ["https://www.tiktok.com/@a/video/10", "https://www.tiktok.com/@a/video/11", "https://example.com/x"] }] },
    tabs: { create() {} },
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

  await L.click({ id: 1, url: "chrome://extensions" }); // not http(s): must not call the host
  assert.equal(posted.filter((m) => m.type === "hello").length, 1); // the chrome:// click never reached the host
});
