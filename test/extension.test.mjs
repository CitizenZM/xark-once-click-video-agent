import test from "node:test";
import assert from "node:assert/strict";
import { videoUrls } from "../extension/urls.js";
import { analyze, recommend } from "../extension/insights.js";

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
    runtime: {
      lastError: undefined, getURL: (p) => p, onInstalled: { addListener() {} },
      onMessage: { addListener: (f) => (L.msg = f) },
      connectNative() {
        const ls = [];
        return {
          onMessage: { addListener: (f) => ls.push(f) }, onDisconnect: { addListener() {} },
          postMessage(m) {
            posted.push(m);
            setTimeout(() => ls.forEach((f) => f({ id: m.id, ok: true, meta: { webpage_url: m.url, extractor_key: "TikTok", uploader: "Ana", file: "/x/" + m.id + ".mp4" } })), 0);
          },
        };
      },
    },
    action: { onClicked: { addListener: (f) => (L.click = f) }, setBadgeText() {}, setBadgeBackgroundColor() {} },
    contextMenus: { create() {}, onClicked: { addListener: (f) => (L.menu = f) } },
    notifications: { create: (o) => notes.push(o) },
    storage: { local: { get: async (k) => ({ [k]: store[k] }), set: async (o) => Object.assign(store, o) } },
    scripting: { executeScript: async () => [{ result: ["https://www.tiktok.com/@a/video/10", "https://www.tiktok.com/@a/video/11", "https://example.com/x"] }] },
    tabs: { create() {} },
  };
  await import("../extension/background.js");

  await L.click({ id: 1, url: "https://www.tiktok.com/@a/video/9" });
  assert.equal(posted[0].url, "https://www.tiktok.com/@a/video/9");
  assert.equal(store.library.length, 1);
  assert.equal(notes.at(-1).title, "Saved");

  await L.menu({ menuItemId: "dl-all" }, { id: 1 });
  assert.deepEqual(posted.slice(1).map((m) => m.url), ["https://www.tiktok.com/@a/video/10", "https://www.tiktok.com/@a/video/11"]);
  assert.equal(store.library.length, 3);
  assert.equal(notes.at(-1).message, "2 saved, 0 failed");

  await L.click({ id: 1, url: "chrome://extensions" }); // not http(s): must not call the host
  assert.equal(posted.length, 3);
});
