// Select mode (needs detect.js injected first). The whole tile is the click target, so clicks never open the post.
// Click a tile to tick it; "+" on a tile adds that video to the queue at once. Running the script again closes it.
(() => {
  if (window.__oneclickSelect) return window.__oneclickSelect.stop();
  const D = window.__oneclickDetect;
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
    .tile{position:fixed;z-index:2147483645;box-sizing:border-box;border-radius:10px;cursor:pointer;background:rgba(15,23,42,.08);border:2px solid transparent;transition:background .1s,border-color .1s}
    .tile:hover{background:rgba(37,99,235,.18);border-color:rgba(37,99,235,.7)}
    .tile.on{background:rgba(37,99,235,.28);border:3px solid #2563eb}
    .chk{position:absolute;left:8px;top:8px;width:26px;height:26px;border-radius:8px;border:2px solid #fff;background:rgba(15,23,42,.55);box-shadow:0 1px 6px rgba(0,0,0,.4);
      color:#fff;font:700 16px/22px -apple-system,sans-serif;text-align:center}
    .tile.on .chk{background:#2563eb;border-color:#2563eb}.tile.on .chk::after{content:"✓"}
    .add{position:absolute;right:8px;top:8px;height:32px;padding:0 14px;border-radius:999px;border:0;background:#0f172a;color:#fff;cursor:pointer;opacity:0;
      font:700 13px/32px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4)}
    .tile:hover .add,.add.done{opacity:1}.add:hover{background:#2563eb}.add.done{background:#16a34a}
    .badge{position:absolute;pointer-events:none;font:800 13px/1 -apple-system,sans-serif;padding:5px 8px;border-radius:999px;box-shadow:0 1px 6px rgba(0,0,0,.45)}
    .rank{right:8px;bottom:8px;background:#0f172a;color:#fff}.hot{left:50%;top:8px;transform:translateX(-50%);background:#16a34a;color:#fff}
    .bar{position:fixed;z-index:2147483647;left:50%;bottom:20px;transform:translateX(-50%);display:flex;flex-wrap:wrap;gap:6px;align-items:center;max-width:calc(100vw - 24px);
      background:#0f172a;color:#f1f5f9;font:500 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:8px 10px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.45)}
    .n{font-weight:700;padding:0 6px;min-width:90px}
    .bar button,.bar input{all:unset;font:inherit;cursor:pointer;padding:7px 11px;border-radius:9px;background:#1e293b}
    .bar button:hover{background:#334155}.go{background:#2563eb!important;font-weight:700}.go:hover{background:#1d4ed8!important}.bar button[disabled]{opacity:.45;cursor:default}
    .bar input{cursor:text;width:130px;border:1px solid #334155}.msg{color:#94a3b8;padding:0 4px;font-size:12px}</style>
    <div id="tiles"></div>
    <div class="bar"><span class="n" id="n"></span>
      <button id="all" title="Tick every video visible now">Select visible</button>
      <button id="more" title="Scroll down and tick new videos as they load">Auto-scroll +20</button>
      <button id="sort" title="Show each tile's rank by views">Sort by views</button>
      <button id="hot" title="Badge videos with at least 2x the page median views">Mark outliers</button>
      <button id="top" title="Tick the 10 videos with the most views">Select top 10</button>
      <button id="none">Clear</button>
      <input id="col" list="cols" placeholder="Collection (optional)" maxlength="60"><datalist id="cols"></datalist>
      <button class="go" id="go">Add to queue</button>
      <button id="x" title="Close (Esc)">✕</button><span class="msg" id="msg">Click a video to select it · + adds it to the queue now</span></div>`;
  const $ = (id) => root.querySelector("#" + id);
  const picked = new Set(), added = new Set(), tiles = new Map(); // url -> tile element
  let found = [], flags = new Map(), sortOn = false, hotOn = false; // url -> {rank, multiple, outlier}
  const NOVIEWS = "This page doesn't show view counts (on Instagram, open the Reels tab)";
  const send = (hrefs) => chrome.runtime.sendMessage({ type: "enqueue-many", hrefs, folder: $("col").value.trim() });
  const paint = () => { $("n").textContent = `${picked.size} selected`; $("go").disabled = !picked.size; };
  const toggle = (url, on = !picked.has(url)) => { on ? picked.add(url) : picked.delete(url); const t = tiles.get(url); if (t) t.classList.toggle("on", on); paint(); };
  function make(url) {
    const t = document.createElement("div"); t.className = "tile";
    t.innerHTML = `<div class="chk"></div><button class="add" title="Add this video to the queue now">${added.has(url) ? "✓ Queued" : "+ Queue"}</button>`;
    if (added.has(url)) t.querySelector(".add").classList.add("done");
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    for (const ev of ["pointerdown", "mousedown", "pointerup", "mouseup"]) t.addEventListener(ev, stop, true); // the page never sees the press
    t.addEventListener("click", (e) => {
      stop(e);
      if (e.target.closest(".add")) {
        const b = e.target.closest(".add"); b.textContent = "…";
        send([url]).then((r) => { added.add(url); b.textContent = r && r.saved ? "✓ Saved before" : "✓ Queued"; b.classList.add("done"); }, () => (b.textContent = "✗ Retry"));
        return;
      }
      toggle(url);
    }, true);
    if (picked.has(url)) t.classList.add("on");
    $("tiles").appendChild(t); tiles.set(url, t);
    return t;
  }
  function place() {
    found = D.items();
    const now = new Set(found.map((f) => f.url));
    for (const { url, el } of found) {
      const t = tiles.get(url) || make(url), r = el.getBoundingClientRect();
      const vis = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width > 0;
      t.style.display = vis ? "" : "none";
      if (vis) Object.assign(t.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    }
    const fl = D.outlierFlags(found.map((f) => f.views));
    flags = new Map(found.map((f, i) => [f.url, fl[i]]));
    const any = fl.some((f) => f.rank);
    for (const id of ["sort", "hot", "top"]) { $(id).disabled = !any; const b = $(id); b.dataset.t = b.dataset.t || b.title; b.title = any ? b.dataset.t : NOVIEWS; }
    for (const { url } of found) {
      const t = tiles.get(url), f = flags.get(url);
      t.querySelectorAll(".badge").forEach((b) => b.remove());
      if (sortOn && f.rank) t.insertAdjacentHTML("beforeend", `<span class="badge rank">#${f.rank}</span>`);
      if (hotOn && f.outlier) t.insertAdjacentHTML("beforeend", `<span class="badge hot">${f.multiple.toFixed(1)}x</span>`);
    }
    for (const [url, t] of tiles) if (!now.has(url)) { t.remove(); tiles.delete(url); }
    if (!found.length) $("msg").textContent = "No videos found here yet. Scroll a little, or right-click a video link → Add to the download queue.";
    paint();
  }
  const visible = () => found.filter(({ el }) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
  $("all").onclick = () => visible().forEach((f) => toggle(f.url, true));
  $("sort").onclick = () => { sortOn = !sortOn; $("sort").style.outline = sortOn ? "2px solid #2563eb" : ""; place(); };
  $("hot").onclick = () => { hotOn = !hotOn; $("hot").style.outline = hotOn ? "2px solid #16a34a" : ""; place(); };
  $("top").onclick = () => found.filter((f) => f.views > 0).sort((a, b) => b.views - a.views).slice(0, 10).forEach((f) => toggle(f.url, true));
  $("none").onclick = () => [...picked].forEach((u) => toggle(u, false));
  let scrolling = false;
  $("more").onclick = async () => {
    if (scrolling) { scrolling = false; return; }
    scrolling = true; $("more").textContent = "Stop";
    const target = picked.size + 20;
    for (let i = 0; i < 40 && scrolling && picked.size < target; i++) {
      found.forEach((f) => picked.size < target && toggle(f.url, true));
      scrollBy({ top: innerHeight * 0.85, behavior: "smooth" });
      await new Promise((r) => setTimeout(r, 1200)); // let the feed load (gentle on the site)
      place();
    }
    found.forEach((f) => picked.size < target && toggle(f.url, true));
    scrolling = false; $("more").textContent = "Auto-scroll +20";
  };
  $("go").onclick = async () => {
    const hrefs = [...picked];
    $("go").disabled = true; $("msg").textContent = `Adding ${hrefs.length}…`;
    let r; try { r = await send(hrefs); } catch (e) { r = { error: String(e) }; }
    $("msg").textContent = r && !r.error ? `✓ ${r.queued} added to the queue${r.saved ? `, ${r.saved} already saved` : ""}. Click the extension icon to watch progress.` : "✗ " + ((r && r.error) || "failed");
    hrefs.forEach((u) => added.add(u));
    [...picked].forEach((u) => toggle(u, false));
  };
  const key = (e) => { if (e.key === "Escape") stop(); };
  const tick = setInterval(place, 400);
  addEventListener("scroll", place, true); addEventListener("resize", place); addEventListener("keydown", key, true);
  function stop() { scrolling = false; clearInterval(tick); removeEventListener("scroll", place, true); removeEventListener("resize", place); removeEventListener("keydown", key, true); host.remove(); delete window.__oneclickSelect; }
  window.__oneclickSelect = { stop, click: (id) => $(id).click() }; // click(): lets the real-page test press the bar's buttons (the shadow root is closed)
  $("x").onclick = stop;
  document.documentElement.appendChild(host);
  chrome.storage.local.get(["folders", "library"]).then(({ folders = [], library = [] }) => {
    for (const n of new Set([...folders, ...library.map((v) => v.folder).filter(Boolean)])) { const o = document.createElement("option"); o.value = n; $("cols").appendChild(o); }
  }).catch(() => {});
  place();
})();
