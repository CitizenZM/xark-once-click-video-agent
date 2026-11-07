import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const YT = "https://www.youtube.com/shorts/x", TT = "https://www.tiktok.com/@a/video/1";
// dist/ has no package.json, so load the built file as an .mjs copy
const load = async (rel) => { const f = join(mkdtempSync(join(tmpdir(), "store-")), "urls.mjs"); copyFileSync(join(root, rel), f); return import(f); };

test("store build drops YouTube from urls, detect and manifest; unpacked build keeps it", async () => {
  execFileSync("bash", ["scripts/build-zip.sh"], { cwd: root, stdio: "pipe", env: { ...process.env, NO_SITE_COPY: "1" } });
  {
    const store = await load("dist/store/urls.js"), full = await load("dist/unpacked/urls.js");
    assert.deepEqual(store.videoUrls([YT, "https://www.youtube.com/watch?v=abc", "https://youtu.be/abc", TT]), [TT]);
    assert.deepEqual(full.videoUrls([YT, TT]), ["https://www.youtube.com/shorts/x", TT]);
    assert.equal(store.dedupeKey("https://youtu.be/abc"), "https://youtu.be/abc"); // no yt: key, and no ReferenceError

    const read = (p) => readFileSync(join(root, p), "utf8");
    assert.ok(!/youtube|youtu\.be/i.test(read("dist/store/detect.js")));
    assert.ok(/youtube/i.test(read("dist/unpacked/detect.js")));
    const hosts = (p) => JSON.parse(read(p)).optional_host_permissions;
    assert.ok(!hosts("dist/store/manifest.json").some((o) => /youtube/.test(o)));
    assert.ok(hosts("dist/unpacked/manifest.json").some((o) => /youtube/.test(o)));
    assert.ok(!("key" in JSON.parse(read("dist/store/manifest.json"))) && "key" in JSON.parse(read("dist/unpacked/manifest.json")));
  }
});
