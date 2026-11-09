// The one way the dashboard calls the AI: checks the AI switch, the key and the monthly cap, shows the estimate,
// then records what the call actually cost (from the API's usage numbers).
import { ask, MODEL } from "./ai.js";
import { featuresOf } from "./features.js";

// claude-sonnet-5-5 list prices: $2 / $10 per million input / output tokens (cache reads $0.20).
export const PRICE = { in: 2 / 1e6, out: 10 / 1e6 };
export const MAX_OUT = 8000, LIKELY_OUT = 2500, DEFAULT_CAP = 10;
export const month = (now = Date.now()) => new Date(now).toISOString().slice(0, 7);
export const usageNow = (u, now = Date.now()) => (u && u.month === month(now) ? u : { month: month(now), usd: 0, calls: 0 });

// ~3.5 characters per token for this mostly-English JSON; "max" assumes the full output allowance is used.
export function estimate(text) {
  const inTok = Math.ceil(String(text || "").length / 3.5);
  return { inTok, likely: inTok * PRICE.in + LIKELY_OUT * PRICE.out, max: inTok * PRICE.in + MAX_OUT * PRICE.out };
}
export const costOf = (u = {}) => (u.input_tokens || 0) * PRICE.in + (u.cache_creation_input_tokens || 0) * PRICE.in * 1.25
  + (u.cache_read_input_tokens || 0) * PRICE.in * 0.1 + (u.output_tokens || 0) * PRICE.out;
export const usd = (x) => "$" + (x < 0.1 ? x.toFixed(3) : x.toFixed(2));

// null when the call may go ahead, else the reason it may not
export function gate({ features, key, usage, cap }, est, now = Date.now()) {
  if (!features.ai) return "AI features are off: turn them on in Settings";
  if (!key) return "Add your AI API key in Settings";
  const u = usageNow(usage, now);
  if (cap > 0 && u.usd + est.max > cap) return `Monthly AI limit: ${usd(u.usd)} of $${cap} used this month; this call could cost up to ${usd(est.max)}. Raise the limit in Settings.`;
  return null;
}

export async function callAI(text, { store = chrome.storage.local, fetchImpl = fetch, confirmFn = (m) => confirm(m), label = "AI", now = () => Date.now() } = {}) {
  const s = await store.get(["features", "aiKey", "aiUsage", "settings"]);
  const settings = s.settings || {}, cap = Number.isFinite(settings.aiCapUsd) ? settings.aiCapUsd : DEFAULT_CAP;
  const est = estimate(text), features = featuresOf(s.features, { hasKey: !!s.aiKey });
  const why = gate({ features, key: s.aiKey, usage: s.aiUsage, cap }, est, now());
  if (why) throw new Error(why);
  const used = usageNow(s.aiUsage, now());
  if (settings.aiConfirm !== false && !confirmFn(`${label} (${MODEL}, your key)\n\nEstimated cost: about ${usd(est.likely)}, at most ${usd(est.max)}.\nThis month so far: ${usd(used.usd)} of $${cap} (${used.calls} calls).\n\nGo ahead?`))
    throw new Error("Cancelled");
  let usage = null;
  try { return await ask(s.aiKey, text, fetchImpl, (u) => (usage = u)); }
  finally {
    if (usage) { // re-read just before writing: other calls may have finished meanwhile
      const cur = usageNow((await store.get("aiUsage")).aiUsage, now());
      await store.set({ aiUsage: { month: cur.month, usd: +(cur.usd + costOf(usage)).toFixed(6), calls: cur.calls + 1 } });
    }
  }
}
