// Floating download button. Injected only after the user opts in (dashboard > Settings).
(() => {
  if (window.__oneclick) return;
  window.__oneclick = true;
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>button{all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;font:600 14px -apple-system,Segoe UI,sans-serif;
    background:#2563eb;color:#fff;border-radius:999px;padding:10px 16px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3)}
    button:hover{background:#1d4ed8}button[disabled]{opacity:.7;cursor:default}button[hidden]{display:none}</style><button hidden></button>`;
  const btn = root.querySelector("button");
  document.documentElement.appendChild(host);

  let state = null, last = "", busy = false;
  const hrefs = () => [...document.links].map((a) => a.href);
  const paint = () => {
    btn.hidden = !state || !state.kind;
    if (!btn.hidden && !busy) btn.textContent = state.kind === "single" ? "⬇ Save video" : `⬇ Save ${state.n} videos`;
  };
  async function refresh() {
    const sig = location.href + "|" + document.links.length;
    if (sig === last || busy) return;
    last = sig;
    try { state = await chrome.runtime.sendMessage({ type: "page-state", href: location.href, hrefs: hrefs() }); } catch { return; }
    paint();
  }
  btn.addEventListener("click", async () => {
    busy = true; btn.disabled = true; btn.textContent = "Saving…";
    let r;
    try { r = await chrome.runtime.sendMessage({ type: "page-download", href: location.href, hrefs: hrefs() }); } catch (e) { r = { error: String(e) }; }
    btn.textContent = r && !r.error && r.ok ? `✓ Saved ${r.ok}${r.skipped ? ` (${r.skipped} already saved)` : ""}` : "✗ " + ((r && r.error) || (r && r.failed ? "Failed" : "Nothing new"));
    setTimeout(() => { busy = false; btn.disabled = false; last = ""; refresh(); }, 2500);
  });
  setInterval(refresh, 1500);
  refresh();

  // Hover "+ Queue" on every video tile (needs detect.js, registered together with this file).
  const D = window.__oneclickDetect;
  if (!D) return;
  const pillHost = document.createElement("div"), pr = pillHost.attachShadow({ mode: "closed" });
  pr.innerHTML = `<style>b{position:fixed;z-index:2147483647;display:none;height:28px;padding:0 11px;border-radius:999px;background:#0f172a;color:#fff;cursor:pointer;
    font:700 12px/28px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.45)}b:hover{background:#2563eb}b.done{background:#16a34a}</style><b></b>`;
  const pill = pr.querySelector("b");
  document.documentElement.appendChild(pillHost);
  let items = [], cur = null, hideT = null;
  const queued = new Set();
  setInterval(() => { items = D.items(); }, 1500); items = D.items();
  const show = (it) => {
    cur = it; const r = it.el.getBoundingClientRect();
    Object.assign(pill.style, { display: "block", left: Math.max(4, r.right - 96) + "px", top: Math.max(4, r.top + 8) + "px" });
    pill.textContent = queued.has(it.url) ? "✓ Queued" : "+ Queue"; pill.classList.toggle("done", queued.has(it.url));
  };
  document.addEventListener("mouseover", (e) => {
    const it = items.find((i) => i.el.contains(e.target));
    if (it) { clearTimeout(hideT); if (it !== cur) show(it); }
    else if (!pillHost.contains(e.target)) { clearTimeout(hideT); hideT = setTimeout(() => { pill.style.display = "none"; cur = null; }, 300); }
  }, true);
  pill.addEventListener("mouseenter", () => clearTimeout(hideT));
  for (const ev of ["pointerdown", "mousedown"]) pill.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); }, true);
  pill.addEventListener("click", async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!cur) return;
    const it = cur; pill.textContent = "…";
    try { await chrome.runtime.sendMessage({ type: "enqueue-many", hrefs: [it.url] }); queued.add(it.url); if (cur === it) show(it); } catch { pill.textContent = "✗"; }
  }, true);
  addEventListener("scroll", () => { if (cur) show(cur); }, true);
})();
