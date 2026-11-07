import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { toTSV, toXLSX, toShareHTML, COLUMNS } from "../extension/export.js";

const NOW = Date.UTC(2026, 10, 6);
const lib = [
  { url: "https://www.tiktok.com/@ana/video/1", platform: "TikTok", uploader: "Ana", uploader_id: "ana", title: "Tabs\tand\nnewlines", folder: "Skin", duration: 12, view_count: 1000, like_count: 200, comment_count: 7, note: "keep", at: NOW },
  { url: "https://www.tiktok.com/@ana/video/2", platform: "TikTok", uploader: "Ana", uploader_id: "ana", title: "Hook <&> test", duration: 25, view_count: 5000, like_count: 100, at: NOW },
  { url: "https://www.instagram.com/reel/x/", platform: "Instagram", uploader: "Bo", uploader_id: "bo_official", title: "plain", duration: 40, view_count: 2000, like_count: 20, at: NOW },
];

test("toTSV: header, escaping, numbers, empty", () => {
  const lines = toTSV(lib).split("\n");
  assert.equal(lines.length, 4);
  assert.deepEqual(lines[0].split("\t"), COLUMNS.map((c) => c.h));
  const first = lines[1].split("\t");
  assert.equal(first.length, COLUMNS.length);
  assert.equal(first[4], "Tabs and newlines");
  assert.equal(first[7], "1000");
  assert.equal(first[10], "20");
  assert.equal(toTSV([]).split("\n").length, 1);
});

const py = `
import sys, zipfile, json, xml.etree.ElementTree as ET
z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
root = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
rows = []
for r in root.iter("{%s}row" % ns["m"]):
    out = {}
    for c in r.findall("m:c", ns):
        t = c.get("t"); v = c.find("m:v", ns)
        txt = "".join(x.text or "" for x in c.iter("{%s}t" % ns["m"]))
        out[c.get("r")] = {"t": t, "v": v.text if v is not None else txt}
    rows.append(out)
print(json.dumps({"names": z.namelist(), "rows": rows}))
`;
test("toXLSX: valid zip, header + rows, numeric cells, exact text round-trip", () => {
  const dir = mkdtempSync(join(tmpdir(), "xlsx-"));
  const f = join(dir, "t.xlsx");
  writeFileSync(f, toXLSX(lib));
  const r = JSON.parse(execFileSync("python3", ["-I", "-c", py, f], { encoding: "utf8" }));
  for (const n of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/worksheets/sheet1.xml"]) assert.ok(r.names.includes(n), n);
  assert.equal(r.rows.length, 1 + lib.length);
  assert.equal(r.rows[0].A1.v, "saved");
  assert.equal(r.rows[1].H2.t, null);            // views is numeric, not inlineStr
  assert.equal(r.rows[1].H2.v, "1000");
  assert.equal(r.rows[2].E3.v, "Hook <&> test");  // text round-trips exactly
  assert.equal(r.rows[2].E3.t, "inlineStr");
});

test("toShareHTML: no script, escapes hostile strings, one row per video, top creator", () => {
  const evil = `<img src=x onerror=alert(1)>`;
  const html = toShareHTML({ name: `Col <b>${evil}`, videos: [...lib, { ...lib[2], title: evil, note: evil, url: "javascript:alert(1)" }], generatedAt: NOW });
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes(evil));
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(!html.includes('href="javascript:'));
  assert.equal((html.match(/<tr>/g) || []).length, 4 + 1); // 4 videos + header row
  assert.ok(html.includes("ana"));
  assert.ok(html.includes('rel="noopener"'));
  assert.ok(html.includes("prefers-color-scheme:dark"));
});
