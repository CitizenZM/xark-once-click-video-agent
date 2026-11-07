#!/bin/bash
# Real-page regression: loads each page in ego lite, injects detect.js + select.js with a stub chrome API,
# clicks the middle of a tile with the real mouse, and checks the page did not navigate and the right links came back.
# Usage: bash test/real/run.sh [name-filter]      Needs: ego-browser (ego lite) running.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="${TMPDIR:-/tmp}/oneclick-real"; mkdir -p "$OUT"
node -e '
const fs = require("fs");
fs.writeFileSync(process.argv[1], JSON.stringify({ det: fs.readFileSync("extension/detect.js", "utf8"), sel: fs.readFileSync("extension/select.js", "utf8"),
  cases: JSON.parse(fs.readFileSync("test/real/cases.json", "utf8")).filter((c) => !process.argv[2] || c.name.toLowerCase().includes(process.argv[2].toLowerCase())) }));
' "$OUT/inj.json" "${1:-}"
ego-browser nodejs <<EOF | tee "$OUT/result.txt"
const fs = await import("node:fs/promises");
const { det, sel, cases } = JSON.parse(await fs.readFile("$OUT/inj.json", "utf8"));
const task = await taskSpace(process.env.ONECLICK_REAL_SPACE || "oneclick real-page tests");
const page = task.page("p1");
let fail = 0;
for (const c of cases) {
  const r = { name: c.name, ok: true, notes: [] };
  try {
    await page.goto(c.url, { timeout: 30000 }); await page.waitForTimeout(6000);
    const info = await page.evaluate(async ({ det, sel }) => {
      window.__sent = [];
      window.chrome = { runtime: { sendMessage: async (m) => { window.__sent.push(m); return { queued: (m.hrefs || []).length, saved: 0 }; } }, storage: { local: { get: async () => ({}) } } };
      (0, eval)(det); (0, eval)(sel); await new Promise((r) => setTimeout(r, 900));
      const items = window.__oneclickDetect.items();
      const vis = items.map((i) => ({ url: i.url, r: i.el.getBoundingClientRect() })).filter((i) => i.r.top > 60 && i.r.bottom < innerHeight - 80 && i.r.width > 0);
      return { url: location.href, n: items.length, sample: items.slice(0, 2).map((i) => i.url), current: window.__oneclickDetect.current(),
        all: items.map((i) => ({ url: i.url, views: i.views })), tile: vis[0] ? { url: vis[0].url, x: vis[0].r.left + vis[0].r.width / 2, y: vis[0].r.top + vis[0].r.height / 2 } : null };
    }, { det, sel });
    if (/login|accounts\\/login|auth_platform/.test(info.url)) { r.ok = null; r.notes.push("login wall: skipped"); }
    else {
      r.found = info.n; r.sample = info.sample;
      if (info.n < c.minItems) { r.ok = false; r.notes.push(\`found \${info.n} < \${c.minItems}\`); }
      if (c.expect && !(info.sample.concat(info.current || []).some((u) => u.includes(c.expect)))) { r.ok = false; r.notes.push("no link matches " + c.expect); }
      if (c.current) { r.current = info.current; if (!info.current) { r.ok = false; r.notes.push("current() found nothing"); } }
      if (c.views) {
        const withViews = info.all.filter((i) => i.views > 0).length;
        r.withViews = withViews;
        if (withViews < 6) { r.ok = false; r.notes.push(\`only \${withViews} items have views\`); }
        else {
          const got = await page.evaluate(async () => {
            window.__sent.length = 0; const S = window.__oneclickSelect;
            S.click("none"); S.click("top"); S.click("go"); await new Promise((r) => setTimeout(r, 400));
            return (window.__sent[0] && window.__sent[0].hrefs) || [];
          });
          r.top = got.length;
          const byUrl = new Map(info.all.map((i) => [i.url, i.views])), vs = got.map((u) => byUrl.get(u));
          if (got.length !== 10) { r.ok = false; r.notes.push("Select top 10 gave " + got.length); }
          else if (vs.some((v, i) => !(v > 0) || (i && v > vs[i - 1]))) { r.ok = false; r.notes.push("top 10 not sorted by views desc: " + vs.join(",")); }
        }
      }
      if (c.clickTile && info.tile) {
        const before = await page.url();
        await page.mouse.click(info.tile.x, info.tile.y, { label: "click tile middle" });
        await page.waitForTimeout(1200);
        const after = await page.url();
        const picked = await page.evaluate(() => document.documentElement.lastElementChild && window.__oneclickSelect ? true : false);
        if (after !== before) { r.ok = false; r.notes.push("tile click navigated to " + after); }
        if (!picked) { r.ok = false; r.notes.push("select mode closed after click"); }
      }
    }
    await page.evaluate(() => window.__oneclickSelect && window.__oneclickSelect.stop());
  } catch (e) { r.ok = false; r.notes.push(String(e.message || e).slice(0, 160)); }
  if (r.ok === false) fail++;
  console.log((r.ok === null ? "SKIP " : r.ok ? "PASS " : "FAIL ") + JSON.stringify(r));
}
await task.finish({ keep: [] });
console.log(fail ? \`RESULT: \${fail} failed\` : "RESULT: all passed");
EOF
grep -q "RESULT: all passed" "$OUT/result.txt"
