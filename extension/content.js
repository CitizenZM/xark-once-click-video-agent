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
})();
