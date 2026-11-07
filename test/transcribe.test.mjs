import test from "node:test";
import assert from "node:assert/strict";
import { keywordStats, creativeBrief } from "../extension/insights.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 2000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error("timed out waiting"); await sleep(10); } };

// ---- background wiring: real background.js against a mocked chrome + native port ----
test("background: autoTranscribe runs a second stage and fills transcript + hook; off sends nothing; failure keeps the download", async () => {
  const store = {}, posted = [], L = {};
  const reply = (ls, m) => setTimeout(() => ls.forEach((f) => f(m)), 0);
  globalThis.chrome = {
    alarms: { create() {}, onAlarm: { addListener() {} } },
    runtime: {
      lastError: undefined, getURL: (p) => "chrome-extension://abc/" + p, getManifest: () => ({ version: "9.9.9", optional_host_permissions: [] }), reload() {},
      onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener: (f) => (L.msg = f) },
      connectNative() {
        const ls = [];
        return {
          onMessage: { addListener: (f) => ls.push(f) }, onDisconnect: { addListener() {} }, disconnect() {},
          postMessage(m) {
            posted.push(m);
            if (m.type === "transcribe") {
              if (L.tr === "hold") { L.release = () => reply(ls, { id: m.id, ok: true, text: "held words here", hook: "held words here" }); return; }
              if (L.tr === "fail") return reply(ls, { id: m.id, ok: false, error: "Transcription is not set up: brew install whisper-cpp, then download the model (see README)" });
              if (L.tr === "nospeech") return reply(ls, { id: m.id, ok: false, error: "No speech found" });
              return reply(ls, { id: m.id, ok: true, text: "Stop buying protein powder. " + "x".repeat(6000), hook: "Stop buying protein powder.", segments: [], seconds: 1 });
            }
            reply(ls, { id: m.id, ok: true, meta: { webpage_url: m.url, extractor_key: "TikTok", uploader: "Ana", file: "/home/u/" + m.id + ".mp4" } });
          },
        };
      },
    },
    commands: { onCommand: { addListener() {} } },
    action: { onClicked: { addListener: (f) => (L.click = f) }, setBadgeText() {}, setBadgeBackgroundColor() {} },
    contextMenus: { create() {}, onClicked: { addListener() {} } },
    notifications: { create() {} },
    storage: { local: { get: async (k) => ({ [k]: structuredClone(store[k]) }), set: async (o) => { Object.assign(store, o); } } },
    scripting: {}, tabs: { create() {}, query: async () => [] },
  };
  await import("../extension/background.js");
  const trMsgs = () => posted.filter((m) => m.type === "transcribe");
  const ask = (m) => new Promise((res) => L.msg(m, { url: "chrome-extension://abc/dashboard.html" }, res));
  const entry = (u) => store.library.find((v) => v.url === u);

  // off (default): download only, no transcribe message
  const off = "https://www.tiktok.com/@a/video/1";
  await L.click({ id: 1, url: off }); await sleep(50);
  assert.equal(trMsgs().length, 0);
  assert.equal(entry(off).transcript, undefined);

  // on: after the download a transcribe message with the saved file is posted, and the library entry gets transcript (capped) + hook
  store.settings = { autoTranscribe: true };
  const on = "https://www.tiktok.com/@a/video/2";
  await L.click({ id: 1, url: on });
  await until(() => entry(on)?.hook);
  assert.equal(trMsgs().length, 1);
  assert.match(trMsgs()[0].file, /^\/home\/u\/\d+\.mp4$/);
  assert.equal(entry(on).hook, "Stop buying protein powder.");
  assert.equal(entry(on).transcript.length, 5000);
  assert.ok(entry(on).transcript.startsWith("Stop buying protein powder."));
  const jobOf = (u) => (store.jobs || []).find((j) => j.url === u);
  await until(() => jobOf(on)?.state === "done"); // jobs are mirrored to storage on a 250 ms debounce

  // while a transcription is running the job shows "transcribing" and it does not use a download slot (parallel 1, next download still runs)
  store.settings = { autoTranscribe: true, parallel: 1 }; L.tr = "hold";
  const h1 = "https://www.tiktok.com/@a/video/21", h2 = "https://www.tiktok.com/@a/video/22";
  await L.click({ id: 1, url: h1 });
  await until(() => jobOf(h1)?.state === "transcribing");
  await L.click({ id: 1, url: h2 });                    // would hang if the held transcription occupied the only slot
  assert.ok(entry(h2));
  L.release(); L.tr = "ok"; await until(() => entry(h1)?.hook === "held words here");
  await until(() => jobOf(h1)?.state === "done");
  // failure: the download stays done and saved, the library entry has no transcript
  L.tr = "fail"; store.settings = { autoTranscribe: true };
  const bad = "https://www.tiktok.com/@a/video/3";
  const n0 = trMsgs().length;
  const r = await L.click({ id: 1, url: bad });
  assert.equal(r.ok, true);
  await until(() => trMsgs().length === n0 + 1); await sleep(50);
  assert.ok(entry(bad), "download is in the library");
  assert.equal(entry(bad).transcript, undefined);
  await until(() => jobOf(bad)?.reason);
  const job = jobOf(bad);
  assert.equal(job.state, "done");            // not "error"
  assert.match(job.reason, /Transcript: .*not set up/);
  assert.equal(store.errors, undefined);      // nothing added to the error list

  // music / no speech: stored as noSpeech, not an error
  L.tr = "nospeech";
  const mute = "https://www.tiktok.com/@a/video/4";
  await L.click({ id: 1, url: mute });
  await until(() => entry(mute)?.noSpeech);
  await until(() => jobOf(mute)?.state === "done");
  assert.equal(jobOf(mute).reason, undefined);

  // dashboard "Transcribe" link: transcribe-one works on a saved video even with the setting off
  store.settings = {}; L.tr = "ok"; delete entry(off).transcript;
  const n = trMsgs().length;
  assert.deepEqual(await ask({ type: "transcribe-one", url: off }), { ok: true, hook: "Stop buying protein powder." });
  assert.equal(trMsgs().length, n + 1);
  assert.equal(entry(off).hook, "Stop buying protein powder.");
  assert.deepEqual(await ask({ type: "transcribe-one", url: "https://nope" }), { ok: false, error: "File not found" });
  // only extension pages may ask
  assert.deepEqual(await new Promise((res) => L.msg({ type: "transcribe-one", url: off }, { tab: { id: 1 } }, res)), { error: "not allowed" });
});

// ---- insights: transcript words count, hook wins ----
const V = (o) => ({ platform: "TikTok", uploader_id: "a", view_count: 1000, like_count: 10, at: 1, ...o });

test("keywordStats sees a word that only appears in a transcript", () => {
  const withSpeech = [V({ url: "u1", title: "morning routine", transcript: "this zinc gummy changed everything" }), V({ url: "u2", title: "gym bag", transcript: "zinc gummy again" })];
  assert.ok(keywordStats(withSpeech).some((k) => k.keyword === "zinc" && k.n === 2));
  const without = withSpeech.map(({ transcript, ...v }) => v);
  assert.ok(!keywordStats(without).some((k) => k.keyword === "zinc"));
});

test("creativeBrief opening lines prefer the spoken hook over the caption", () => {
  const lib = [
    V({ url: "u1", title: "t1", description: "caption number one here", hook: "Stop buying protein powder", view_count: 9000 }),
    V({ url: "u2", title: "t2", description: "caption number two here", view_count: 5000 }),
    V({ url: "u3", title: "t3", description: "caption number three here", view_count: 1000 }),
  ];
  assert.deepEqual(creativeBrief(lib).hooks, ["Stop buying protein powder", "caption number two here", "caption number three here"]);
});
