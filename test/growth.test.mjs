import test from "node:test";
import assert from "node:assert/strict";
import { dueForCheck, appendHistory, growthRate, fastestGrowing, markStatsFailed } from "../extension/growth.js";

const D = 86400000, NOW = Date.UTC(2026, 10, 6);
const saved = (daysAgo, extra = {}) => ({ url: `https://www.tiktok.com/@a/video/${daysAgo}-${Math.random().toString(36).slice(2, 6)}`, at: NOW - daysAgo * D, view_count: 1000, like_count: 100, comment_count: 10, ...extra });
const pt = (daysAgo, views) => ({ at: NOW - daysAgo * D, views, likes: 1, comments: 1 });

test("dueForCheck: a video is due once it is 1, 7 or 30 days old and no later history point covers that checkpoint", () => {
  const young = saved(0.5), day1 = saved(1), day3 = saved(3);
  const day3done = saved(3, { history: [pt(3, 1000), pt(1.5, 1200)] });            // checked at day 1.5: day 1 is covered
  const day8 = saved(8, { history: [pt(8, 1000), pt(7, 2000)] });                  // checked at day 1 (7 days ago): day 7 is due now
  const day8late = saved(8, { history: [pt(8, 1000), pt(0.1, 2000)] });            // one late check covers day 1 and day 7
  const day31 = saved(31, { history: [pt(31, 1000), pt(23, 2000), pt(1, 3000)] }); // the day-1 point covers 1 and 7, not 30... 30 is covered by the point 1 day ago
  const day31due = saved(31, { history: [pt(31, 1000), pt(23, 2000)] });            // day 30 not covered yet
  const lib = [young, day1, day3, day3done, day8, day8late, day31, day31due];
  assert.deepEqual(dueForCheck(lib, NOW), [day31due, day8, day3, day1].map((v) => v.url)); // oldest first
});

test("dueForCheck: the checkpoint is inclusive, the first history point (saved numbers) is not a check", () => {
  assert.equal(dueForCheck([saved(1)], NOW).length, 1);
  assert.equal(dueForCheck([{ ...saved(1), at: NOW - D + 1 }], NOW).length, 0);                // 1 ms short of a day
  assert.equal(dueForCheck([saved(2, { history: [pt(2, 1000)] })], NOW).length, 1);            // only the saved numbers so far
});

test("dueForCheck: caps at 50 (oldest first) and skips entries the helper keeps failing on or that have no saved time", () => {
  const lib = Array.from({ length: 70 }, (_, i) => saved(2 + i / 100));
  const due = dueForCheck(lib, NOW);
  assert.equal(due.length, 50);
  assert.deepEqual(due, [...lib].sort((a, b) => a.at - b.at).slice(0, 50).map((v) => v.url));
  assert.equal(dueForCheck([saved(5, { statsFails: 3 }), saved(5, { statsFails: 2 }), { url: "https://x/y" }, { at: NOW - 9 * D }], NOW).length, 1);
  assert.deepEqual(dueForCheck(undefined, NOW), []);
});

test("appendHistory: first point = numbers saved with the video, then the new check; the entry is not mutated", () => {
  const e = saved(3);
  const a = appendHistory(e, { view_count: 1500, like_count: 120, comment_count: 12 }, NOW);
  assert.deepEqual(a.history, [{ at: e.at, views: 1000, likes: 100, comments: 10 }, { at: NOW, views: 1500, likes: 120, comments: 12 }]);
  assert.equal(e.history, undefined);
  const b = appendHistory(a, { view_count: 2000, like_count: null, comment_count: undefined }, NOW + D);
  assert.equal(b.history.length, 3);
  assert.deepEqual(b.history[2], { at: NOW + D, views: 2000, likes: null, comments: null });
  assert.equal(b.history[0].views, 1000);
  assert.equal(appendHistory({ ...e, statsFails: 2 }, { view_count: 1 }, NOW).statsFails, undefined); // a good read clears the failure count
  assert.equal(appendHistory({ ...e, view_count: null }, { view_count: 5 }, NOW).history[0].views, null);
  assert.equal(markStatsFailed(markStatsFailed(e)).statsFails, 2);
});

test("growthRate: (latest - first) / first, per day; null without a trend", () => {
  const h = (...p) => ({ history: p });
  assert.equal(growthRate(h({ at: 0, views: 1000 }, { at: 2 * D, views: 1500 })), 0.25);           // +50% over 2 days
  assert.equal(growthRate(h({ at: 0, views: 1000 }, { at: D, views: 1100 }, { at: 4 * D, views: 3000 })), 0.5); // uses the latest point
  assert.equal(growthRate(h({ at: 0, views: 1000 }, { at: D, views: 500 })), -0.5);               // views can drop
  assert.equal(growthRate({}), null);
  assert.equal(growthRate(h({ at: 0, views: 1000 })), null);                                       // one point
  assert.equal(growthRate(h({ at: 0, views: 0 }, { at: D, views: 500 })), null);                   // started at 0
  assert.equal(growthRate(h({ at: 0, views: null }, { at: D, views: 500 })), null);                // no saved numbers
  assert.equal(growthRate(h({ at: 0, views: 100 }, { at: D, views: null })), null);                // latest unreadable
  assert.equal(growthRate(h({ at: D, views: 100 }, { at: D, views: 200 })), null);                 // no time between points
  assert.equal(growthRate(null), null);
});

test("fastestGrowing: best rate first, only growers, at most 6, with the number of checks", () => {
  const grow = (name, from, to, days, checks = 1) => ({ url: name, history: [{ at: 0, views: from }, ...Array.from({ length: checks - 1 }, (_, i) => ({ at: D, views: from })), { at: days * D, views: to }] });
  const lib = [grow("slow", 1000, 1100, 5), grow("fast", 1000, 3000, 2), grow("drop", 1000, 500, 1), { url: "none" }, grow("mid", 1000, 2000, 4, 3),
    ...Array.from({ length: 6 }, (_, i) => grow("g" + i, 1000, 1010 + i, 9))];
  const f = fastestGrowing(lib);
  assert.equal(f.length, 6);
  assert.deepEqual(f.slice(0, 3).map((r) => r.video.url), ["fast", "mid", "slow"]);
  assert.deepEqual([f[0].rate, f[0].checks, f[1].checks], [1, 1, 3]);
  assert.ok(!f.some((r) => r.video.url === "drop" || r.video.url === "none"));
});

// ---- wiring: the real background.js, a mocked chrome, a mocked helper ----
test("background: the daily 'growth' alarm asks the helper only for due videos and stores the history", async () => {
  const realNow = Date.now;
  let fake = NOW;
  Date.now = () => fake;
  const store = {}, posted = [], L = { alarms: [], created: [], changed: [], startup: [], installed: [] };
  const lib = [
    { url: "https://www.tiktok.com/@a/video/1", at: NOW - 2 * D, view_count: 1000, like_count: 100, comment_count: 10, file: "/x/1.mp4", title: "due: day 2" },
    { url: "https://www.tiktok.com/@a/video/2", at: NOW - 0.5 * D, view_count: 50, like_count: 5, comment_count: 1, title: "too young" },
    { url: "https://www.tiktok.com/@a/video/3", at: NOW - 40 * D, view_count: 900, like_count: 90, comment_count: 9, history: [{ at: NOW - 40 * D, views: 900, likes: 90, comments: 9 }, { at: NOW - 35 * D, views: 4000, likes: 300, comments: 20 }], title: "due: day 7+30" },
    { url: "https://www.tiktok.com/@a/video/4", at: NOW - 3 * D, view_count: 700, like_count: 70, comment_count: 7, history: [{ at: NOW - 3 * D, views: 700, likes: 70, comments: 7 }, { at: NOW - 1.5 * D, views: 800, likes: 80, comments: 8 }], title: "checked at day 1.5" },
    { url: "https://www.tiktok.com/@a/video/5", at: NOW - 100 * D, view_count: 10, like_count: 1, comment_count: 0, statsFails: 3, title: "given up" },
    { url: "https://www.tiktok.com/@a/video/6", at: NOW - 5 * D, view_count: 300, like_count: 30, comment_count: 3, title: "due but private" },
  ];
  store.library = structuredClone(lib);
  const statsFor = (u) => u.endsWith("/6") ? { url: u, ok: false, view_count: null, like_count: null, comment_count: null, error: "This video is private" }
    : { url: u, ok: true, view_count: u.endsWith("/1") ? 1500 : 9000, like_count: 200, comment_count: 30, error: null };
  globalThis.__oneclickTiming = { mirrorMs: 30 };
  globalThis.chrome = {
    alarms: { create: (name, info) => L.created.push([name, info]), onAlarm: { addListener: (f) => L.alarms.push(f) } },
    runtime: {
      lastError: undefined, getURL: (p) => "chrome-extension://abc/" + p, getManifest: () => ({ version: "9.9.9", optional_host_permissions: [] }), reload() {},
      onInstalled: { addListener: (f) => L.installed.push(f) }, onStartup: { addListener: (f) => L.startup.push(f) }, onMessage: { addListener() {} },
      connectNative() {
        const ls = [];
        return {
          onMessage: { addListener: (f) => ls.push(f) }, onDisconnect: { addListener() {} }, disconnect() {},
          postMessage(m) {
            posted.push(m);
            const reply = m.type === "stats" ? { type: "stats", ok: true, results: m.urls.map(statsFor) }
              : m.type === "sync-library" ? { type: "synced", ok: true, count: m.items.length } : m.type === "hello" ? { type: "hello", dev: true } : { ok: true };
            setTimeout(() => ls.forEach((f) => f({ id: m.id, ...reply })), 0);
          },
        };
      },
    },
    commands: { onCommand: { addListener() {} } },
    action: { onClicked: { addListener() {} }, setBadgeText() {}, setBadgeBackgroundColor() {} },
    contextMenus: { create() {}, onClicked: { addListener() {} } },
    notifications: { create() {} },
    storage: {
      onChanged: { addListener: (f) => L.changed.push(f) },
      local: {
        get: async (k) => { await new Promise((r) => setTimeout(r, 2)); return { [k]: structuredClone(store[k]) }; },
        set: async (o) => { await new Promise((r) => setTimeout(r, 2)); Object.assign(store, structuredClone(o)); for (const k of Object.keys(o)) L.changed.forEach((f) => f({ [k]: { newValue: o[k] } }, "local")); },
      },
    },
    scripting: {}, tabs: { create() {}, query: async () => [] },
  };
  try {
    await import("../extension/background.js");
    const alarm = async (name) => { for (const f of L.alarms) await f({ name }); await new Promise((r) => setTimeout(r, 120)); };
    const statsMsgs = () => posted.filter((m) => m.type === "stats");

    // the alarm exists once the extension is installed / started
    L.installed.forEach((f) => f()); await new Promise((r) => setTimeout(r, 60));
    assert.ok(L.created.some(([n, i]) => n === "growth" && i.periodInMinutes === 1440));

    // another alarm name does nothing
    await alarm("update-other");
    assert.equal(statsMsgs().length, 0);

    // growth alarm: only the due videos are sent, oldest first
    await alarm("growth");
    assert.equal(statsMsgs().length, 1);
    assert.deepEqual(statsMsgs()[0].urls, [3, 6, 1].map((n) => `https://www.tiktok.com/@a/video/${n}`));
    const after = Object.fromEntries(store.library.map((v) => [v.url.slice(-1), v]));
    assert.deepEqual(after[1].history, [{ at: NOW - 2 * D, views: 1000, likes: 100, comments: 10 }, { at: NOW, views: 1500, likes: 200, comments: 30 }]);
    assert.equal(after[3].history.length, 3); assert.equal(after[3].history[2].views, 9000);
    assert.equal(after[6].history, undefined); assert.equal(after[6].statsFails, 1);
    for (const k of [2, 4, 5]) assert.deepEqual(after[k], lib[k - 1], "not due: untouched");
    assert.equal(after[1].file, "/x/1.mp4"); assert.equal(after[1].view_count, 1000); // saved numbers stay as saved

    // same day again: videos 1 and 3 are covered; only the one that failed is asked for again
    await alarm("growth");
    assert.equal(statsMsgs().length, 2);
    assert.deepEqual(statsMsgs()[1].urls, ["https://www.tiktok.com/@a/video/6"]);
    assert.equal(store.library.find((v) => v.url.endsWith("/6")).statsFails, 2);

    // a week on: videos 6, 4, 1 and 2 reach new checkpoints (oldest first); the third failure ends the retries for video 6
    fake = NOW + 6 * D;
    await alarm("growth");
    assert.equal(statsMsgs().length, 3);
    assert.deepEqual(statsMsgs()[2].urls, [6, 4, 1, 2].map((n) => `https://www.tiktok.com/@a/video/${n}`));
    assert.equal(store.library.find((v) => v.url.endsWith("/1")).history.length, 3);
    assert.equal(store.library.find((v) => v.url.endsWith("/6")).statsFails, 3);
    await alarm("growth");
    assert.equal(statsMsgs().length, 3, "nothing is due any more: no further request");

    // mirror: library writes are debounced into one sync-library message with only the allowed fields
    posted.length = 0;
    await chrome.storage.local.set({ library: store.library });
    await chrome.storage.local.set({ library: store.library });
    await chrome.storage.local.set({ library: store.library });
    await chrome.storage.local.set({ other: 1 }); // not the library: no timer of its own
    await new Promise((r) => setTimeout(r, 150));
    const syncs = posted.filter((m) => m.type === "sync-library");
    assert.equal(syncs.length, 1);
    assert.equal(syncs[0].items.length, store.library.length);
    const keys = new Set(syncs[0].items.flatMap(Object.keys));
    assert.ok(!keys.has("history") && !keys.has("file") && !keys.has("statsFails"));
    assert.ok(["url", "title", "view_count", "at"].every((k) => keys.has(k)));
  } finally {
    Date.now = realNow;
    delete globalThis.__oneclickTiming;
  }
});
