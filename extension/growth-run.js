// Background jobs for the library: the daily growth check (F5) and the library mirror for the MCP server (F7).
// background.js passes in its own storage helpers so everything shares one storage lock.
import { dueForCheck, appendHistory, markStatsFailed } from "./growth.js";

export function setupGrowth({ get, locked, call }) {
  async function runGrowth() {
    const urls = dueForCheck(await get("library", []), Date.now());
    if (!urls.length) return { checked: 0 };
    const r = await call({ type: "stats", urls });
    if (!r || !Array.isArray(r.results)) return { checked: 0, error: (r && r.error) || "no stats" };
    const by = new Map(r.results.map((s) => [s.url, s]));
    await locked(async () => { // re-read inside the lock: downloads may have changed the library while the helper worked
      const now = Date.now();
      const lib = (await get("library", [])).map((v) => {
        const s = urls.includes(v.url) && by.get(v.url);
        return !s ? v : s.ok ? appendHistory(v, s, now) : markStatsFailed(v);
      });
      await chrome.storage.local.set({ library: lib });
    });
    return { checked: r.results.length };
  }
  chrome.alarms.onAlarm.addListener((a) => a.name === "growth" && runGrowth().catch(() => {}));
  return { runGrowth, schedule: () => chrome.alarms.create("growth", { periodInMinutes: 1440 }) };
}

// Only what the statistics and search need (plus note/folder/hook/transcript): the helper writes this to ~/.oneclick/library.json.
const KEEP = ["url", "title", "platform", "uploader", "uploader_id", "duration", "view_count", "like_count", "comment_count",
  "channel_follower_count", "tags", "description", "upload_date", "at", "note", "folder", "hook", "transcript"];
export const mirrorItems = (lib) => lib.map((v) => Object.fromEntries(KEEP.filter((k) => v[k] !== undefined).map((k) => [k, v[k]])));

export function setupMirror({ get, call }) {
  let timer = null;
  const wait = () => { const t = globalThis.__oneclickTiming; return (t && t.mirrorMs) ?? 5000; };
  async function sync() {
    try { await call({ type: "sync-library", items: mirrorItems(await get("library", [])) }); } catch { /* helper not installed */ }
  }
  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(sync, wait());
    if (timer.unref) timer.unref(); // Node (tests) only
  };
  chrome.runtime.onStartup.addListener(touch); // first run after an update: write the file even if the library never changes
  chrome.runtime.onInstalled.addListener(touch);
  if (chrome.storage.onChanged) chrome.storage.onChanged.addListener((changes, area) => area === "local" && changes.library && touch());
  return { touch, sync };
}
