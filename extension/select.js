// Select mode (needs detect.js injected first). Tick videos, or auto-scroll to collect more, then add them to the queue.
// Running it again closes it.
(() => {
  if (window.__oneclickSelect) return window.__oneclickSelect.stop();
  const D = window.__oneclickDetect;
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
    :host{all:initial}
    .box{position:fixed;z-index:2147483646;width:28px;height:28px;border-radius:8px;border:2px solid #fff;background:rgba(15,23,42,.55);cursor:pointer;
      box-shadow:0 1px 8px rgba(0,0,0,.45);color:#fff;font:700 17px/24px -apple-system,sans-serif;text-align:center;transition:transform .08s}
    .box:hover{transform:scale(1.12)}.box.on{background:#2563eb;border-color:#2563eb}.box.on::after{content:"✓"}
    .ring{position:fixed;z-index:2147483645;pointer-events:none;border:3px solid #2563eb;border-radius:10px}
    .bar{position:fixed;z-index:2147483647;left:50%;bottom:20px;transform:translateX(-50%);display:flex;flex-wrap:wrap;gap:6px;align-items:center;max-width:calc(100vw - 24px);
      background:#0f172a;color:#f1f5f9;font:500 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:8px 10px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.45)}
    .n{font-weight:700;padding:0 6px;min-width:96px}
    button,select,input{all:unset;font:inherit;cursor:pointer;padding:7px 11px;border-radius:9px;background:#1e293b}
    button:hover{background:#334155}.go{background:#2563eb;font-weight:700}.go:hover{background:#1d4ed8}button[disabled]{opacity:.45;cursor:default}
    input{cursor:text;width:130px;border:1px solid #334155}.msg{color:#94a3b8;padding:0 4px}</style>
    <div class="bar"><span class="n" id="n"></span>
      <button id="all" title="Tick every video visible now">Select visible</button>
      <button id="more" title="Scroll down and tick new videos as they load">Auto-scroll +20</button>
      <button id="none">Clear</button>
      <input id="col" list="cols" placeholder="Collection (optional)" maxlength="60"><datalist id="cols"></datalist>
      <button class="go" id="go">Add to queue</button>
      <button id="x" title="Close (Esc)">✕</button><span class="msg" id="msg"></span></div>`;
  const $ = (id) => root.querySelector("#" + id);
  const picked = new Set();           // urls; kept while the tile scrolls away
  const boxes = new Map();            // url -> {box, ring}
  let found = [];
  const paint = () => { $("n").textContent = `${picked.size} selected`; $("go").disabled = !picked.size; };
  const toggle = (url, on = !picked.has(url)) => { on ? picked.add(url) : picked.delete(url); const b = boxes.get(url); if (b) { b.box.classList.toggle("on", on); b.ring.style.display = on ? "" : "none"; } paint(); };
  function place() {
    found = D.items();
    const now = new Set(found.map((f) => f.url));
    for (const { url, el } of found) {
      let b = boxes.get(url);
      if (!b) {
        b = { box: document.createElement("div"), ring: document.createElement("div") };
        b.box.className = "box"; b.ring.className = "ring";
        b.box.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); toggle(url); }, true);
        root.append(b.ring, b.box); boxes.set(url, b);
        if (picked.has(url)) b.box.classList.add("on");
      }
      const r = el.getBoundingClientRect(), vis = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
      b.box.style.display = vis ? "" : "none";
      b.box.style.left = Math.max(4, r.left + 8) + "px"; b.box.style.top = Math.max(4, r.top + 8) + "px";
      Object.assign(b.ring.style, { display: vis && picked.has(url) ? "" : "none", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    }
    for (const [url, b] of boxes) if (!now.has(url)) { b.box.remove(); b.ring.remove(); boxes.delete(url); }
    $("msg").textContent = found.length ? "" : "No videos found here yet. Try scrolling, or right-click a video link.";
    paint();
  }
  const visible = () => found.filter(({ el }) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
  $("all").onclick = () => visible().forEach((f) => toggle(f.url, true));
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
    let r; try { r = await chrome.runtime.sendMessage({ type: "enqueue-many", hrefs, folder: $("col").value.trim() }); } catch (e) { r = { error: String(e) }; }
    $("msg").textContent = r && !r.error ? `✓ ${r.queued} added to the queue${r.saved ? `, ${r.saved} already saved` : ""}. Open the icon to watch progress.` : "✗ " + ((r && r.error) || "failed");
    [...picked].forEach((u) => toggle(u, false));
  };
  const key = (e) => { if (e.key === "Escape") stop(); };
  const tick = setInterval(place, 500);
  addEventListener("scroll", place, true); addEventListener("resize", place); addEventListener("keydown", key, true);
  function stop() { scrolling = false; clearInterval(tick); removeEventListener("scroll", place, true); removeEventListener("resize", place); removeEventListener("keydown", key, true); host.remove(); delete window.__oneclickSelect; }
  window.__oneclickSelect = { stop };
  $("x").onclick = stop;
  document.documentElement.appendChild(host);
  chrome.storage.local.get(["folders", "library"]).then(({ folders = [], library = [] }) => {
    for (const n of new Set([...folders, ...library.map((v) => v.folder).filter(Boolean)])) { const o = document.createElement("option"); o.value = n; $("cols").appendChild(o); }
  }).catch(() => {});
  place();
})();
