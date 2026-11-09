// On/off switches for everything beyond downloading. Downloading itself is always on.
// Stored as `features` in chrome.storage.local; a switch that was never set uses its default.
export const FEATURES = [
  { key: "research", name: "Research and analysis", def: true,
    desc: "Overview, Projects, Creators, Formats, Keywords and Ideas tabs, transcripts, and the 6 h / 1 / 7 / 30 day view rechecks. Off = a plain downloader." },
  { key: "ai", name: "AI features (your own API key)", def: null, // null: on when a key is saved
    desc: "AI tags, products, ad concepts, scripts and project plans. Each call goes to api.anthropic.com with your key and is billed to you." },
  { key: "autoScan", name: "Daily account scan", def: false,
    desc: "Once a day, re-scan the accounts you scanned in each project and notify you about new videos at 1.5x+ of that account's median." },
  { key: "comments", name: "Viewer comments", def: false,
    desc: "Fetch comments (YouTube through the helper; TikTok and Instagram from the open video page) and pull out questions and objections." },
  { key: "adStudio", name: "Ad Studio bridge", def: false,
    desc: "Send a reference video and product link to Ad Studio to make an ad, and cut remix-bank clips into its library (Ad Studio must run on this Mac)." },
  { key: "ownAds", name: "My ads tracking", def: false,
    desc: "Enter or import (CSV) your own ads' spend and results per project, and compare them by reference video, hook and format." },
];

// The switches in effect. Everything except "research" also needs research on (they live on its tabs).
export function featuresOf(stored, { hasKey = false } = {}) {
  const s = stored && typeof stored === "object" ? stored : {};
  const raw = Object.fromEntries(FEATURES.map((f) => [f.key, typeof s[f.key] === "boolean" ? s[f.key] : f.def === null ? !!hasKey : f.def]));
  return Object.fromEntries(FEATURES.map((f) => [f.key, f.key === "research" ? raw.research : raw.research && raw[f.key]]));
}

export async function loadFeatures(store = chrome.storage.local) {
  const { features, aiKey } = await store.get(["features", "aiKey"]);
  return featuresOf(features, { hasKey: !!aiKey });
}

// body classes the stylesheet uses to hide what is switched off: "no-research", "no-ai", ...
export const offClasses = (f) => FEATURES.filter((x) => !f[x.key]).map((x) => "no-" + x.key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()));
