// Optional AI helper. Runs only when the user clicks a button, with the user's own Anthropic API key (stored locally).
export const MODEL = "claude-sonnet-5-5";

// A compact, capped view of the library: what the model sees is exactly this, never files or cookies.
export function sample(lib, n = 60) {
  return lib.slice(0, n).map((v, i) => ({
    i, platform: v.platform, creator: v.uploader || v.uploader_id, title: String(v.title || "").slice(0, 100),
    caption: String(v.description || "").split("\n")[0].slice(0, 120), tags: (v.tags || []).slice(0, 6),
    views: v.view_count || 0, likes: v.like_count || 0, seconds: v.duration || 0, collection: v.folder || null,
  }));
}

export function buildPrompt(mode, lib, folders) {
  const src = (mode === "sort" ? lib.filter((v) => !v.folder) : lib).slice(0, 60);
  const items = sample(src);
  const data = JSON.stringify(items);
  if (mode === "sort") {
    return { urls: src.map((v) => v.url), text: `You organise a marketer's saved short videos into collections.\nExisting collections: ${JSON.stringify(folders)}.\nVideos (JSON): ${data}\n\nAssign each video to ONE collection, reusing existing names when they fit and creating at most 6 new short names (2-3 words, by topic, hook style or product category). Reply with JSON only: {"assignments":[{"i":0,"collection":"name"}]}` };
  }
  return { urls: src.map((v) => v.url), text: `You advise an affiliate and performance marketer who saves reference short videos.\nTheir saved videos (JSON, capped): ${data}\n\nUsing only patterns visible in this data, reply with JSON only:\n{"summary":"2-3 sentences on what they collect and what works","patterns":["short pattern..."],"hooks":["opening-line or format ideas to test"],"search_ideas":[{"platform":"TikTok|Instagram|YouTube","query":"search or hashtag to try","why":"one sentence"}],"accounts_to_verify":[{"platform":"...","handle":"...","why":"..."}]}\nRules: at most 5 items per list; never invent statistics; accounts_to_verify are guesses the user must check, include only if you are fairly sure they exist.` };
}

export function parseJson(text) {
  const m = /\{[\s\S]*\}/.exec(String(text || ""));
  if (!m) throw new Error("The model did not return JSON");
  return JSON.parse(m[0]);
}

export async function ask(key, text, fetchImpl = fetch) {
  const r = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, messages: [{ role: "user", content: text }] }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body.error && body.error.message) || `API error ${r.status}`);
  return parseJson((body.content || []).map((c) => c.text || "").join(""));
}

// Turn the model's assignments into {collection: [url]}, ignoring unknown indexes and empty names.
export function groupAssignments(result, urls) {
  const out = {};
  for (const a of (result && result.assignments) || []) {
    const url = urls[a.i], name = String(a.collection || "").trim().slice(0, 60);
    if (url && name) (out[name] ||= []).push(url);
  }
  return out;
}
