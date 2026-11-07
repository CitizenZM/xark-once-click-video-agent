import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { PATTERNS, canonical, dedupeKey, videoUrls } from "../extension/urls.js";
import { filterLibrary } from "../extension/insights.js";

const FB = "https://www.facebook.com/ads/library/?id=1624078592578665";
const IGS = "https://www.instagram.com/stories/natgeo/3000000000000000000";
const CC = "https://ads.tiktok.com/business/creativecenter/topads/7691369945884049416";

test("urls: Meta Ad Library ad, Creative Center detail and Instagram Stories are recognised in one canonical form", () => {
  assert.equal(canonical("https://facebook.com/ads/library/?active_status=all&id=1624078592578665&country=US"), FB);
  assert.equal(canonical(FB + "&source=x"), FB);
  assert.equal(canonical("https://www.facebook.com/ads/library/?view_all_page_id=5"), null);       // an advertiser page, not one ad
  assert.equal(canonical("https://www.facebook.com/ads/library/?q=shoes&country=US"), null);        // a search page
  assert.equal(canonical(CC + "/pc/en?period=30"), CC);
  assert.equal(canonical("https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en"), null);
  assert.equal(canonical(IGS + "/?igsh=abc"), IGS);
  assert.equal(canonical("https://www.instagram.com/stories/highlights/17900000/"), "https://www.instagram.com/stories/highlights/17900000");
  assert.equal(canonical("https://www.instagram.com/natgeo/"), null);
});

test("urls: dedupeKey fbad:/ttcc:/igs: ignore URL shape; videoUrls dedupes them", () => {
  assert.equal(dedupeKey("https://facebook.com/ads/library/?country=US&id=1624078592578665"), "fbad:1624078592578665");
  assert.equal(dedupeKey(FB), dedupeKey("https://www.facebook.com/ads/library/?id=1624078592578665&x=1"));
  assert.equal(dedupeKey(CC + "/pc/en"), "ttcc:7691369945884049416");
  assert.equal(dedupeKey(IGS + "/"), "igs:3000000000000000000");
  assert.deepEqual(videoUrls([FB, FB + "&a=1", CC + "/pc/en", CC, IGS + "/", IGS]), [FB, CC, IGS]);
});

test("urls: PATTERNS stay identical in detect.js and every new pattern is its own line (the store build strips YouTube by line)", () => {
  const src = readFileSync(new URL("../extension/detect.js", import.meta.url), "utf8");
  const win = {}; vm.runInNewContext(src, { window: win });
  assert.deepEqual([...win.__oneclickDetect.PATTERNS].map((r) => r.source), PATTERNS.map((r) => r.source));
  for (const u of [FB, CC, IGS]) assert.ok(PATTERNS.some((p) => p.test(u)), u);
  assert.ok(src.split("\n").filter((l) => /facebook|creativecenter|stories/.test(l) && !/youtube|youtu\.be/i.test(l)).length >= 3);
});

test("filterLibrary: source option splits ads from organic and combines with other filters", () => {
  const lib = [
    { url: "a", title: "ad one", platform: "FacebookAds", source: "meta-ads", at: 3 },
    { url: "b", title: "ad two", platform: "TikTokAds", source: "tiktok-cc", at: 2 },
    { url: "c", title: "organic", platform: "TikTok", at: 1 },
  ];
  assert.deepEqual(filterLibrary(lib, { source: "ads" }).map((v) => v.url), ["a", "b"]);
  assert.deepEqual(filterLibrary(lib, { source: "organic" }).map((v) => v.url), ["c"]);
  assert.equal(filterLibrary(lib, { source: "" }).length, 3);
  assert.equal(filterLibrary(lib).length, 3);
  assert.deepEqual(filterLibrary(lib, { source: "ads", platform: "TikTokAds" }).map((v) => v.url), ["b"]);
});

// ---- detect.js on a tiny fake DOM shaped like the real pages inspected on 2026-11-06 ----
class El {
  constructor(tag, { text = "", w = 0, h = 0, attrs = {} } = {}) { Object.assign(this, { tag, text, w, h, attrs, children: [], parentElement: null }); }
  add(...c) { for (const x of c) { x.parentElement = this; this.children.push(x); } return this; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(""); }
  get src() { return this.attrs.src || ""; } get currentSrc() { return this.attrs.src || ""; } get href() { return this.attrs.href || ""; }
  getBoundingClientRect() { return { width: this.w, height: this.h, top: 0, left: 0, bottom: this.h, right: this.w }; }
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) { const tags = sel.split(","); return this.all().filter((e) => tags.includes(e.tag)); }
}
function load(hostname, pathname, body, links = []) {
  const document = { links, querySelectorAll: (s) => body.querySelectorAll(s), documentElement: body };
  const win = {};
  vm.runInNewContext(readFileSync(new URL("../extension/detect.js", import.meta.url), "utf8"), { window: win, document, location: { hostname, pathname, href: `https://${hostname}${pathname}` }, innerWidth: 1000, innerHeight: 800 });
  return win.__oneclickDetect;
}
const metaCard = (id, withVideo = true) => {
  const label = new El("span", { text: `Library ID: ${id}`, w: 164, h: 14 });
  const inner = new El("div", { w: 370, h: 140 }).add(new El("div", { w: 336, h: 130 }).add(new El("div", { w: 193, h: 16 }).add(label)));
  const card = new El("div", { w: 370, h: 600 }).add(inner);
  if (withVideo) card.add(new El("video", { w: 360, h: 400, attrs: { src: "https://video.xx.fbcdn.net/a.mp4" } }));
  return new El("div", { w: 370, h: 642 }).add(card);
};

test("detect.js: Meta Ad Library search page -> one item per video ad card, card element = the single-ad container", () => {
  const body = new El("div", { w: 2500, h: 4000 });
  const grid = new El("div", { w: 1980, h: 3694 }).add(metaCard("111"), metaCard("222"), metaCard("333", false));
  body.add(grid);
  const D = load("www.facebook.com", "/ads/library/", body);
  const items = [...D.items()];
  assert.deepEqual(items.map((i) => i.url), ["https://www.facebook.com/ads/library/?id=111", "https://www.facebook.com/ads/library/?id=222"]); // image-only ad skipped
  assert.ok(items.every((i) => i.el.querySelector("video") && i.el.w <= 400)); // card, not the whole grid
  assert.deepEqual(items.map((i) => i.el.querySelectorAll("span").length), [1, 1]);
  assert.ok(items.every((i) => i.url === canonical(i.url)));
});

test("detect.js: Meta label text off the Ad Library path is ignored", () => {
  const body = new El("div", { w: 2500, h: 4000 }).add(metaCard("111"));
  assert.equal(load("www.facebook.com", "/somepage", body).items().length, 0);
});

test("detect.js: Creative Center card -> detail url, and the mp4 only when the card is playing", () => {
  const card = (id, src) => {
    const a = new El("a", { w: 117, h: 34, attrs: { href: `https://ads.tiktok.com/business/creativecenter/topads/${id}` } });
    const c = new El("div", { w: 282, h: 568 }).add(new El("div", { w: 282, h: 50 }).add(a));
    if (src) c.add(new El("video", { w: 282, h: 500, attrs: { src } }));
    return { a, c };
  };
  const playing = card("1001", "https://v16m-default.tiktokcdn.com/x/video/tos/?mime_type=video_mp4"), idle = card("1002");
  const body = new El("div", { w: 1200, h: 900 }).add(playing.c, idle.c);
  const D = load("ads.tiktok.com", "/business/creativecenter/inspiration/topads/pc/en", body, [playing.a, idle.a]);
  const byUrl = Object.fromEntries([...D.items()].map((i) => [i.url, i.direct]));
  assert.deepEqual(byUrl, {
    "https://ads.tiktok.com/business/creativecenter/topads/1001": "https://v16m-default.tiktokcdn.com/x/video/tos/?mime_type=video_mp4",
    "https://ads.tiktok.com/business/creativecenter/topads/1002": undefined,
  });
});

// ---- wiring: real background.js, mocked chrome + helper port ----
test("background: select-mode directs and the cover setting reach the helper; the library keeps source/thumbnail", async () => {
  const store = {}, posted = [], L = {};
  globalThis.chrome = {
    alarms: { create() {}, onAlarm: { addListener() {} } },
    runtime: {
      lastError: undefined, getURL: (p) => "chrome-extension://abc/" + p, getManifest: () => ({ version: "9.9.9", optional_host_permissions: [] }), reload() {},
      onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener: (f) => (L.msg = f) },
      connectNative: () => {
        const ls = [];
        return {
          onMessage: { addListener: (f) => ls.push(f) }, onDisconnect: { addListener() {} }, disconnect() {},
          postMessage(m) {
            posted.push(m);
            const meta = m.url.includes("facebook") ? { source: "meta-ads", extractor_key: "FacebookAds", thumbnail: "https://scontent.fbcdn.net/t.jpg" }
              : m.url.includes("ads.tiktok.com") ? { source: "tiktok-cc", extractor_key: "TikTokAds" } : { extractor_key: "TikTok" };
            setTimeout(() => ls.forEach((f) => f({ id: m.id, ok: true, meta: { webpage_url: m.url, file: "/x/" + m.id + ".mp4", ...meta } })), 0);
          },
        };
      },
    },
    commands: { onCommand: { addListener() {} } }, action: { onClicked: { addListener() {} }, setBadgeText() {}, setBadgeBackgroundColor() {} },
    contextMenus: { create() {}, onClicked: { addListener() {} } }, notifications: { create() {} },
    storage: { local: { get: async (k) => ({ [k]: structuredClone(store[k]) }), set: async (o) => { Object.assign(store, o); } } },
    scripting: {}, tabs: {},
  };
  await import("../extension/background.js");
  const ask = (m) => new Promise((res) => L.msg(m, { url: "chrome-extension://abc/dashboard.html" }, res));
  const direct = "https://v16m-default.tiktokcdn.com/x/video/tos/?mime_type=video_mp4";

  store.settings = { cover: true };
  await ask({ type: "enqueue-many", hrefs: [FB, CC + "/pc/en", "https://www.tiktok.com/@a/video/5"], directs: { [CC]: direct, "https://www.tiktok.com/@a/video/5": "https://evil.example/a.mp4" }, folder: "" });
  await new Promise((r) => setTimeout(r, 200));
  const byUrl = Object.fromEntries(posted.map((m) => [m.url, m]));
  assert.equal(byUrl[CC].direct, direct);                       // the played card's mp4 is forwarded for its detail url
  assert.equal(byUrl[FB].direct, undefined);                    // no direct for a url that has none
  assert.equal(byUrl["https://www.tiktok.com/@a/video/5"].direct, undefined); // a direct link is only forwarded for Creative Center urls (the helper allowlist is the second gate: host/test_media.py)
  assert.ok(posted.every((m) => m.cover === true));
  const lib = Object.fromEntries(store.library.map((v) => [v.url, v]));
  assert.deepEqual([lib[FB].source, lib[FB].thumbnail, lib[CC].source, lib["https://www.tiktok.com/@a/video/5"].source], ["meta-ads", "https://scontent.fbcdn.net/t.jpg", "tiktok-cc", undefined]);
  await new Promise((r) => setTimeout(r, 400));
  assert.ok(store.jobs.length === 3 && store.jobs.every((j) => j.direct === undefined)); // the signed link is not kept after the job

  posted.length = 0; store.settings = {};
  await ask({ type: "enqueue-many", hrefs: ["https://www.tiktok.com/@a/video/6"] });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(posted[0].cover, undefined);                      // cover only when the setting is on
});
