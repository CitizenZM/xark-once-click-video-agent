// Spreadsheet + share-page exports. Pure functions, no DOM, no dependencies.
import { creatorStats, formatStats } from "./insights.js";

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const iso = (t) => (Number.isFinite(+t) && t ? new Date(t).toISOString() : "");
const rate = (v) => (v.view_count > 0 && v.like_count >= 0 ? Math.round((v.like_count / v.view_count) * 10000) / 100 : null);

export const COLUMNS = [
  { h: "saved", v: (v) => iso(v.at) },
  { h: "collection", v: (v) => v.folder || "" },
  { h: "platform", v: (v) => v.platform || "" },
  { h: "creator", v: (v) => v.uploader || v.uploader_id || "" },
  { h: "title", v: (v) => v.title || "" },
  { h: "url", v: (v) => v.url || "" },
  { h: "length (s)", v: (v) => num(Number(v.duration)) },
  { h: "views", v: (v) => num(v.view_count) },
  { h: "likes", v: (v) => num(v.like_count) },
  { h: "comments", v: (v) => num(v.comment_count) },
  { h: "like rate (%)", v: rate },
  { h: "note", v: (v) => v.note || "" },
];

const clean = (s) => String(s).replace(/[\t\r\n]+/g, " ");
export function toTSV(videos) {
  const rows = videos.map((v) => COLUMNS.map((c) => { const x = c.v(v); return x == null ? "" : clean(x); }).join("\t"));
  return [COLUMNS.map((c) => c.h).join("\t"), ...rows].join("\n");
}

// ---------- XLSX (Office Open XML in a STORE zip) ----------
const xmlEsc = (s) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const enc = new TextEncoder();

let CRC_TABLE;
export function crc32(bytes) {
  if (!CRC_TABLE) CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const nameB = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nameB, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nameB.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cdSize = central.reduce((a, p) => a + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
  let o = 0; for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

const colName = (i) => String.fromCharCode(65 + i); // 12 columns, A..L
export function toXLSX(videos) {
  const cell = (x, r, c) => {
    const ref = colName(c) + r;
    if (x == null || x === "") return "";
    return typeof x === "number" ? `<c r="${ref}"><v>${x}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(x)}</t></is></c>`;
  };
  const rowXml = (vals, r) => `<row r="${r}">${vals.map((x, c) => cell(x, r, c)).join("")}</row>`;
  const rows = [rowXml(COLUMNS.map((c) => c.h), 1), ...videos.map((v, i) => rowXml(COLUMNS.map((c) => c.v(v)), i + 2))].join("");
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const HDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  return zipStore([
    ["[Content_Types].xml", `${HDR}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ["_rels/.rels", `${HDR}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `${HDR}<workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Library" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `${HDR}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", `${HDR}<worksheet ${NS}><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${rows}</sheetData></worksheet>`],
  ]);
}

// ---------- Share page ----------
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const fmt = (n) => (n == null ? "" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n));
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
const medianOf = (xs) => { const s = xs.filter((x) => x > 0).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

export function toShareHTML({ name = "Library", videos = [], generatedAt = Date.now() } = {}) {
  const creators = creatorStats(videos).slice(0, 5), formats = formatStats(videos).slice(0, 5);
  const med = medianOf(videos.map((v) => v.view_count));
  const li = (t, sub) => `<li>${esc(t)} <small>${esc(sub)}</small></li>`;
  const rows = videos.map((v) => {
    const u = safeUrl(v.url), t = esc(v.title || v.url || "(untitled)"), r = rate(v);
    return `<tr><td>${u ? `<a href="${esc(u)}" rel="noopener">${t}</a>` : t}</td><td>${esc(v.uploader || v.uploader_id)}</td><td>${esc(v.platform)}</td><td class="n">${esc(fmt(v.view_count))}</td><td class="n">${r == null ? "" : r + "%"}</td><td>${esc(v.note)}</td></tr>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)}</title>
<style>
:root{--bg:#fff;--fg:#1a1a1a;--mute:#666;--line:#e3e3e3;--card:#f6f6f7;--link:#0b5fff}
@media (prefers-color-scheme:dark){:root{--bg:#141416;--fg:#ececec;--mute:#9a9a9f;--line:#2e2e33;--card:#1d1d20;--link:#7aa7ff}}
*{box-sizing:border-box}body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;max-width:1000px;margin-inline:auto}
h1{margin:.2em 0}h2{font-size:1.05em;margin:0 0 .4em}small,.mute{color:var(--mute)}a{color:var(--link)}
.stats{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}.stat{background:var(--card);border-radius:8px;padding:10px 14px}.stat b{display:block;font-size:1.4em}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.card{background:var(--card);border-radius:8px;padding:12px}
ul{margin:0;padding-left:1.1em}.wrap{overflow-x:auto;margin-top:16px}table{border-collapse:collapse;width:100%;min-width:560px}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}.n{text-align:right;white-space:nowrap}
</style></head><body>
<h1>${esc(name)}</h1>
<p class="mute">Shared ${esc(new Date(generatedAt).toISOString().slice(0, 10))}</p>
<div class="stats"><div class="stat"><b>${videos.length}</b>videos</div><div class="stat"><b>${new Set(videos.map((v) => v.uploader_id || v.uploader || "")).size}</b>creators</div><div class="stat"><b>${esc(fmt(med) || "-")}</b>median views</div></div>
<div class="cols">
<div class="card"><h2>Top creators</h2><ul>${creators.map((c) => li(c.creator, `${c.n} videos, median ${fmt(c.medianViews) || "-"} views`)).join("") || "<li>None</li>"}</ul></div>
<div class="card"><h2>Top formats</h2><ul>${formats.map((f) => li(f.format, `${f.n} videos, median ${fmt(f.medianViews) || "-"} views`)).join("") || "<li>None</li>"}</ul></div>
</div>
<div class="wrap"><table>
<thead><tr><th>Title</th><th>Creator</th><th>Platform</th><th class="n">Views</th><th class="n">Like rate</th><th>Note</th></tr></thead>
<tbody>
${rows}
</tbody></table></div>
</body></html>
`;
}
