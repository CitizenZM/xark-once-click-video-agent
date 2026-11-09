import test from "node:test";
import assert from "node:assert/strict";
import { postedAt, velocity, fastestNow, creatorOutliers, creatorBaselines, vsCreator, adRun, longRunningAds, tagStats } from "../extension/winners.js";
import { buildTagPrompt, applyTags, buildScriptPrompt, HOOK_TYPES, TAG_BATCH } from "../extension/ai.js";
import { cleanExtra } from "../extension/urls.js";

const H = 3600000, D = 86400000, NOW = Date.UTC(2026, 10, 8, 12);
const tt = (id, extra = {}) => ({ url: `https://www.tiktok.com/@${extra.uploader_id || "a"}/video/${id}`, platform: "TikTok", uploader: "a", uploader_id: "a", at: NOW, ...extra }); // the creator is read from the URL handle

test("velocity: views per hour since posting, then between the last two checks", () => {
  const v = tt(1, { timestamp: (NOW - 10 * H) / 1000, view_count: 5000 });
  assert.deepEqual(velocity(v), { lifetime: 500, recent: null, now: 500, ageHours: 10 });
  const checked = { ...v, history: [{ at: NOW, views: 5000 }, { at: NOW + 6 * H, views: 5600 }] };
  assert.equal(velocity(checked).recent, 100);
  assert.equal(velocity(checked).now, 100);                                   // the recent rate wins: is it still climbing?
  assert.equal(velocity({ ...v, history: [{ at: NOW, views: 5000 }, { at: NOW + 6 * H, views: 4000 }] }).recent, 0); // views never "drop" below 0/h
  assert.equal(velocity(tt(2, { view_count: 5000 })).now, null);               // no post date
  assert.equal(postedAt(tt(3, { upload_date: "20261107" })), null);            // a bare date on a 1-day-old video is too coarse
  assert.equal(postedAt(tt(4, { upload_date: "20261101" })), Date.UTC(2026, 10, 1, 12));
  assert.deepEqual(fastestNow([v, checked, tt(5, { timestamp: (NOW - 2 * H) / 1000, view_count: 10000 })]).map((r) => Math.round(r.now)), [5000, 500, 100]);
});

test("creator-relative outliers: library median of 3+ videos, a profile-grid median, and likes where views are hidden", () => {
  const lib = [tt(1, { view_count: 1000 }), tt(2, { view_count: 1200 }), tt(3, { view_count: 900 }), tt(4, { view_count: 5000 }),
    tt(5, { uploader: "b", uploader_id: "b", view_count: 30000, creator_median_views: 10000, creator_median_n: 24 }),
    tt(6, { uploader: "c", uploader_id: "c", view_count: 99999 }), // one video, no baseline
    ...[50, 60, 70, 400].map((l, i) => ({ url: `https://www.instagram.com/reel/I${i}`, platform: "Instagram", uploader: "ig", uploader_id: "123", like_count: l, view_count: null, at: NOW }))];
  const out = creatorOutliers(lib);
  assert.deepEqual(out.map((r) => [r.video.url.slice(-2), +r.multiple.toFixed(2), r.by]), [["I3", 6.15, "likes"], ["/4", 4.55, "views"], ["/5", 3, "views"]]);
  assert.match(out[2].basis, /median of 24 videos on their profile/);
  assert.match(out[1].basis, /4 saved videos from this creator/);
  assert.equal(vsCreator(lib[5], creatorBaselines(lib)), null);
});

test("ad run length: active ads count to when they were saved, stopped ads to their end date; 30+ days is long", () => {
  const ad = (id, x) => ({ url: `https://www.facebook.com/ads/library/?id=${id}`, source: "meta-ads", at: NOW, ...x });
  const lib = [ad(1, { ad_start: NOW - 44 * D, ad_active: true, ad_seen: NOW }), ad(2, { ad_start: NOW - 90 * D, ad_end: NOW - 80 * D, ad_active: false }),
    ad(3, {}), tt(9, { view_count: 5 })];
  assert.deepEqual(adRun(lib[0]), { days: 45, active: true, start: NOW - 44 * D, end: NOW, long: true });
  assert.equal(adRun(lib[1]).days, 11);
  assert.equal(adRun(lib[2]), null);
  const r = longRunningAds(lib);
  assert.deepEqual([r.ads.map((a) => a.days), r.withDates, r.long, r.adsTotal], [[45, 11], 2, 1, 3]);
});

test("tagStats: lift per AI label against the whole view", () => {
  const lib = [["question", 9000], ["question", 11000], ["demo", 1000], ["demo", 1000], [null, 2000]].map(([h, views], i) => tt(i, { view_count: views, ...(h ? { ai_tags: { hook: h } } : {}) }));
  const s = Object.fromEntries(tagStats(lib, "hook").map((r) => [r.value, [r.n, r.lift, r.liftBy]]));
  assert.deepEqual(s, { question: [2, 5, "views"], demo: [2, 0.5, "views"] });
});

test("AI tags prompt and answer: capped batch, only library text, labels forced onto the fixed lists", () => {
  const vs = Array.from({ length: 45 }, (_, i) => tt(i, { title: "t" + i, description: "cap", hook: "Stop doing this", transcript: "x".repeat(900), cookie: "SECRET" }));
  const p = buildTagPrompt(vs);
  assert.equal(p.urls.length, TAG_BATCH);
  assert.ok(!p.text.includes("SECRET") && !p.text.includes("x".repeat(401)));
  const tags = applyTags({ tags: [{ i: 0, hook: "Question", angle: "Price Value", audience: "busy moms", emotion: "joy", usp: "x".repeat(99), cta: "Shop now", product: "Air Fryer", category: "Kitchen", brand: "Cosori" }, { i: 99, hook: "demo" }] }, p.urls);
  assert.deepEqual(Object.keys(tags), [p.urls[0]]);
  assert.deepEqual(tags[p.urls[0]], { hook: "question", angle: "price value", audience: "busy moms", emotion: "other", usp: "x".repeat(60), cta: "Shop now", product: "air fryer", category: "kitchen", brand: "Cosori" });
  assert.ok(HOOK_TYPES.includes("other"));
});

test("script prompt: one reference with its transcript, labels, signals and the user's product", () => {
  const t = buildScriptPrompt(tt(1, { title: "3 mistakes", transcript: "Stop buying cheap fryers", ai_tags: { hook: "bold claim" } }), "Cosori air fryer, $20 off", ["vs creator: 3.0x"]);
  for (const s of ["Stop buying cheap fryers", "bold claim", "Cosori air fryer, $20 off", "vs creator: 3.0x", '"beats"']) assert.ok(t.includes(s), s);
  assert.ok(buildScriptPrompt(tt(2, {})).includes("same product category"));
});

test("cleanExtra: only in-range numbers from the page are kept", () => {
  assert.deepEqual(cleanExtra({ ad: { start: NOW - D, active: true }, page: { median: 5000, n: 12 } }), { ad_start: NOW - D, ad_active: true, creator_median_views: 5000, creator_median_n: 12 });
  assert.deepEqual(cleanExtra({ ad: { start: NOW - 9 * D, end: NOW - D, active: false } }), { ad_start: NOW - 9 * D, ad_active: false, ad_end: NOW - D });
  assert.deepEqual(cleanExtra({ ad: { start: "x" }, page: { median: 5000, n: 2 } }), {});              // junk, and a grid too small to mean anything
  assert.deepEqual(cleanExtra({ ad: { start: Date.now() + 9 * D } }), {});                               // a start date in the future
  assert.deepEqual(cleanExtra(null), {});
});

// ---- wiring: real background.js, mocked chrome + helper port ----
test("background: select-mode page signals land on the saved entry; lib-tags stores cleaned AI labels; timestamp is kept", async () => {
  const store = { library: [] }, L = {};
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
            const meta = m.url.includes("facebook") ? { source: "meta-ads", extractor_key: "FacebookAds" } : { extractor_key: "TikTok", view_count: 30000, timestamp: 1762500000 };
            setTimeout(() => ls.forEach((f) => f({ id: m.id, ok: true, meta: { webpage_url: m.url, file: "/x/" + m.id + ".mp4", ...meta } })), 0);
          },
        };
      },
    },
    commands: { onCommand: { addListener() {} } }, action: { onClicked: { addListener() {} }, setBadgeText() {}, setBadgeBackgroundColor() {} },
    contextMenus: { create() {}, onClicked: { addListener() {} } }, notifications: { create() {} },
    storage: { local: { get: async (k) => ({ [k]: structuredClone(store[k]) }), set: async (o) => { Object.assign(store, structuredClone(o)); } } },
    scripting: {}, tabs: {},
  };
  await import("../extension/background.js");
  const ask = (m, sender = { url: "chrome-extension://abc/dashboard.html" }) => new Promise((res) => L.msg(m, sender, res));
  const FB = "https://www.facebook.com/ads/library/?id=42", TT = "https://www.tiktok.com/@b/video/7";
  const start = Date.UTC(2025, 9, 1, 12);
  await ask({ type: "enqueue-many", hrefs: [FB, TT], extras: { [FB + "&country=US"]: { ad: { start, active: true } }, [TT]: { page: { median: 10000, n: 20 }, evil: 1 } } }, { tab: { id: 3 } });
  await new Promise((r) => setTimeout(r, 200));
  const lib = Object.fromEntries(store.library.map((v) => [v.url, v]));
  assert.deepEqual([lib[FB].ad_start, lib[FB].ad_active, typeof lib[FB].ad_seen], [start, true, "number"]);
  assert.deepEqual([lib[TT].creator_median_views, lib[TT].creator_median_n, lib[TT].evil, lib[TT].timestamp], [10000, 20, undefined, 1762500000]);
  assert.equal(creatorOutliers(store.library)[0].multiple, 3); // the saved entry feeds the dashboard card

  await ask({ type: "lib-tags", tags: { [TT]: { hook: "question", angle: "x".repeat(200), extra: "dropped" } } });
  const tagged = store.library.find((v) => v.url === TT);
  assert.deepEqual(Object.keys(tagged.ai_tags), ["hook", "angle", "audience", "emotion", "usp", "cta", "product", "category", "brand"]);
  assert.equal(tagged.ai_tags.angle.length, 60);
  assert.equal(store.library.find((v) => v.url === FB).ai_tags, undefined);
  assert.deepEqual(await ask({ type: "lib-tags", tags: {} }, { tab: { id: 3 } }), { error: "not allowed" }); // a web page cannot write labels
});
