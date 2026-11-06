// Select mode: tick videos on the page, then download the ticked ones. Injected on demand (activeTab); toggled by running again.
(() => {
  if (window.__oneclickSelect) return window.__oneclickSelect.stop();
  const VIDEO = [
    /^https?:\/\/(www\.)?tiktok\.com\/@[\w.]+\/video\/\d+/, /^https?:\/\/(www\.)?instagram\.com\/(reel|reels|p|tv)\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/, /^https?:\/\/(www\.)?youtube\.com\/watch\?(?:.*&)?v=[\w-]+/, /^https?:\/\/(www\.)?(x|twitter)\.com\/\w+\/status\/\d+/,
  ];
  const clean = (h) => { try { const u = new URL(h); return u.pathname === "/watch" ? `${u.origin}/watch?v=${u.searchParams.get("v")}` : u.origin + u.pathname.replace(/\/$/, ""); } catch { return null; } };
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
    .box{position:fixed;z-index:2147483646;width:26px;height:26px;border-radius:7px;border:2px solid #fff;background:rgba(0,0,0,.55);cursor:pointer;box-shadow:0 1px 6px rgba(0,0,0,.5);color:#fff;font:700 16px/22px sans-serif;text-align:center}
    .box.on{background:#2563eb}.box.on::after{content:"✓"}
    .bar{position:fixed;z-index:2147483647;left:50%;bottom:18px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;background:#111827;color:#fff;
      font:600 14px -apple-system,Segoe UI,sans-serif;padding:10px 14px;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,.4)}
    .bar input{all:unset;width:140px;padding:6px 10px;border-radius:999px;background:#1f2937;border:1px solid #374151;font-weight:500}.bar button{all:unset;cursor:pointer;padding:6px 12px;border-radius:999px;background:#374151}.bar button.go{background:#2563eb}.bar button[disabled]{opacity:.5;cursor:default}</style>
    <div class="bar"><span id="n"></span><input id="col" list="cols" placeholder="Collection (optional)" maxlength="60"><datalist id="cols"></datalist><button id="all">Select all</button><button id="none">Clear</button><button class="go" id="go">Download</button><button id="x">Close</button></div>`;
  const $ = (id) => root.querySelector("#" + id);
  const boxes = new Map(); // clean url -> {el, on}
  const links = () => { const m = new Map(); for (const a of document.links) { if (!VIDEO.some((p) => p.test(a.href))) continue; const k = clean(a.href); const r = a.getBoundingClientRect(); if (k && r.width > 40 && r.height > 40 && !m.has(k)) m.set(k, r); } return m; };
  const count = () => [...boxes.values()].filter((b) => b.on).length;
  const paintBar = () => { $("n").textContent = `${count()} of ${boxes.size} selected`; $("go").disabled = !count(); };
  const place = () => {
    const seen = links();
    for (const [k, r] of seen) {
      let b = boxes.get(k);
      if (!b) {
        const el = document.createElement("div"); el.className = "box"; b = { el, on: false }; boxes.set(k, b);
        el.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); b.on = !b.on; el.classList.toggle("on", b.on); paintBar(); }, true);
        root.appendChild(el);
      }
      const inView = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
      b.el.style.display = inView ? "" : "none"; b.el.style.left = Math.max(4, r.left + 6) + "px"; b.el.style.top = Math.max(4, r.top + 6) + "px";
    }
    for (const [k, b] of boxes) if (!seen.has(k) && !b.on) { b.el.remove(); boxes.delete(k); }
    paintBar();
  };
  const tick = setInterval(place, 400);
  addEventListener("scroll", place, true); addEventListener("resize", place);
  const stop = () => { clearInterval(tick); removeEventListener("scroll", place, true); removeEventListener("resize", place); host.remove(); delete window.__oneclickSelect; };
  window.__oneclickSelect = { stop };
  $("all").onclick = () => { for (const b of boxes.values()) { b.on = true; b.el.classList.add("on"); } paintBar(); };
  $("none").onclick = () => { for (const b of boxes.values()) { b.on = false; b.el.classList.remove("on"); } paintBar(); };
  $("x").onclick = stop;
  $("go").onclick = async () => {
    const hrefs = [...boxes].filter(([, b]) => b.on).map(([k]) => k);
    $("go").disabled = true; $("n").textContent = `Queued ${hrefs.length}…`;
    let r; try { r = await chrome.runtime.sendMessage({ type: "page-download", href: "", hrefs, folder: $("col").value.trim() }); } catch (e) { r = { error: String(e) }; }
    $("n").textContent = r && !r.error ? `✓ ${r.ok} saved${r.skipped ? `, ${r.skipped} already saved` : ""}${r.failed ? `, ${r.failed} failed` : ""}` : "✗ " + ((r && r.error) || "failed");
    for (const b of boxes.values()) { b.on = false; b.el.classList.remove("on"); }
  };
  document.documentElement.appendChild(host);
  place();
  chrome.storage.local.get(["folders", "library"]).then(({ folders = [], library = [] }) => {
    const names = [...new Set([...folders, ...library.map((v) => v.folder).filter(Boolean)])];
    for (const n of names) { const o = document.createElement("option"); o.value = n; $("cols").appendChild(o); }
  }).catch(() => {});
})();
