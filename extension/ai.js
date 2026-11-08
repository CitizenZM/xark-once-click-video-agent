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

export function buildPrompt(mode, lib, folders, stats = {}) {
  const src = (mode === "sort" ? lib.filter((v) => !v.folder) : lib).slice(0, 60);
  const items = sample(src);
  const data = JSON.stringify(items);
  if (mode === "sort") {
    return { urls: src.map((v) => v.url), text: `You organise a marketer's saved short videos into collections.\nExisting collections: ${JSON.stringify(folders)}.\nVideos (JSON): ${data}\n\nAssign each video to ONE collection, reusing existing names when they fit and creating at most 6 new short names (2-3 words, by topic, hook style or product category). Reply with JSON only: {"assignments":[{"i":0,"collection":"name"}]}` };
  }
  if (mode === "brief") {
    const st = JSON.stringify({ formats: (stats.formats || []).map((f) => ({ format: f.format, videos: f.n, lift: f.lift && +f.lift.toFixed(2), likeRate: f.avgLikeRate && +f.avgLikeRate.toFixed(4) })),
      keywords: (stats.keywords || []).map((k) => ({ keyword: k.keyword, videos: k.n, lift: k.lift && +k.lift.toFixed(2) })) });
    return { urls: src.map((v) => v.url), text: `You are a performance creative strategist for affiliate and DTC brands.\nReference videos the marketer saved (JSON, capped): ${data}\nMeasured patterns in this set (lift = median views vs the set's median): ${st}\n\nWrite 5 short-form video ad concepts that reuse the patterns that measurably work here (prefer formats and keywords with lift > 1). Do not copy any video. Reply with JSON only:\n{"concepts":[{"name":"short name","format":"format","length":"e.g. 20-30s","hook":"spoken or on-screen line for the first 2 seconds","beats":["shot or line", "..."],"cta":"call to action","why":"which measured pattern this uses"}]}` };
  }
  return { urls: src.map((v) => v.url), text: `You advise an affiliate and performance marketer who saves reference short videos.\nTheir saved videos (JSON, capped): ${data}\n\nUsing only patterns visible in this data, reply with JSON only:\n{"summary":"2-3 sentences on what they collect and what works","patterns":["short pattern..."],"hooks":["opening-line or format ideas to test"],"search_ideas":[{"platform":"TikTok|Instagram|YouTube","query":"search or hashtag to try","why":"one sentence"}],"accounts_to_verify":[{"platform":"...","handle":"...","why":"..."}]}\nRules: at most 5 items per list; never invent statistics; accounts_to_verify are guesses the user must check, include only if you are fairly sure they exist.` };
}

export function parseJson(text) {
  const m = /\{[\s\S]*\}/.exec(String(text || ""));
  if (!m) throw new Error("The model did not return JSON");
  return JSON.parse(m[0]);
}

// Sonnet 5.5 thinks by default (effort high) and thinking counts toward max_tokens, so keep effort low
// for these short JSON tasks and leave room for the answer.
export const REQUEST = (text) => ({ model: MODEL, max_tokens: 8000, output_config: { effort: "low" }, messages: [{ role: "user", content: text }] });

export async function ask(key, text, fetchImpl = fetch) {
  const r = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify(REQUEST(text)),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body.error && body.error.message) || `API error ${r.status}`);
  if (body.stop_reason === "max_tokens") throw new Error("The answer was cut off (output limit reached). Try again with fewer videos.");
  return parseJson((body.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join(""));
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

// ---------- AI tags: hook type, angle, audience, emotion (+ selling point, CTA) per video ----------
export const HOOK_TYPES = ["question", "bold claim", "problem / pain", "result first", "curiosity gap", "pov / skit", "demo", "list / number", "story", "trend / sound", "other"];
export const EMOTIONS = ["curiosity", "humor", "aspiration", "fear / urgency", "relief", "surprise", "trust", "excitement", "other"];
export const TAG_BATCH = 40;
const clip = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

// Only text the user already has in the library: title, first caption lines, hashtags, the spoken hook and the start of the transcript.
export function buildTagPrompt(videos) {
  const vs = videos.slice(0, TAG_BATCH);
  const data = JSON.stringify(vs.map((v, i) => ({ i, platform: v.platform, title: clip(v.title, 100), caption: clip(v.description, 240),
    tags: (v.tags || []).slice(0, 8), spoken_hook: clip(v.hook, 160) || undefined, transcript: clip(v.transcript, 400) || undefined, seconds: v.duration || undefined })));
  return { urls: vs.map((v) => v.url), text: `You label short-form videos for a performance marketer, so they can see which creative choices win.\nVideos (JSON): ${data}\n\nFor every video give:\n- hook: how the first 3 seconds grab attention, exactly one of ${JSON.stringify(HOOK_TYPES)}\n- angle: the persuasion angle in 1-3 words (e.g. "price value", "social proof", "transformation", "convenience", "expert tip")\n- audience: who it speaks to in 1-3 words (e.g. "busy moms", "gym beginners", "skincare fans")\n- emotion: the main emotion, exactly one of ${JSON.stringify(EMOTIONS)}\n- usp: the product benefit or claim in at most 6 words, or "" if none\n- cta: the call to action in at most 6 words, or "" if none\nJudge from the text only; when unsure use "other". Reply with JSON only: {"tags":[{"i":0,"hook":"","angle":"","audience":"","emotion":"","usp":"","cta":""}]}` };
}

// The model's answer -> {url: tags}. Unknown indexes are dropped; hook and emotion outside the fixed lists become "other".
export function applyTags(result, urls) {
  const out = {};
  for (const t of (result && result.tags) || []) {
    const url = urls[t && t.i];
    if (!url) continue;
    const pick = (x, list) => (list.includes(String(x || "").toLowerCase().trim()) ? String(x).toLowerCase().trim() : "other");
    out[url] = { hook: pick(t.hook, HOOK_TYPES), angle: clip(t.angle, 40).toLowerCase() || "other", audience: clip(t.audience, 40).toLowerCase() || "other",
      emotion: pick(t.emotion, EMOTIONS), usp: clip(t.usp, 60), cta: clip(t.cta, 60) };
  }
  return out;
}

// ---------- "Make a script like this": one reference video -> a new script for the user's product ----------
export function buildScriptPrompt(v, product = "", signals = []) {
  const ref = JSON.stringify({ platform: v.platform, creator: v.uploader || v.uploader_id, title: clip(v.title, 150), caption: clip(v.description, 500),
    hashtags: (v.tags || []).slice(0, 10), seconds: v.duration || undefined, views: v.view_count || undefined, likes: v.like_count || undefined,
    spoken_hook: clip(v.hook, 200) || undefined, transcript: clip(v.transcript, 2500) || undefined, labels: v.ai_tags || undefined,
    why_saved: signals.length ? signals : undefined, note: clip(v.note, 200) || undefined });
  const prod = clip(product, 300);
  return `You are a performance creative strategist. A marketer picked this reference video because it performs:\n${ref}\n\n${prod ? `Write a new short-form video ad script for: ${prod}.` : "Write a new short-form video ad script for the same product category."} Keep what makes the reference work (hook mechanism, pacing, structure, proof, CTA style) but do not copy its words, people or brand. If there is no transcript, infer the structure from the title and caption and say so in "summary".\nReply with JSON only:\n{"summary":"one sentence on what the reference does","why_it_works":["short point"],"script":{"length":"e.g. 25s","hook":"line for the first 2 seconds","beats":[{"t":"0-3s","visual":"what we see","line":"what is said or shown as text"}],"cta":"call to action"},"keep":["element kept from the reference"],"change":["what is new for this product"],"variants":["alternative hook 1","alternative hook 2"]}\nAt most 8 beats and 4 items per list.`;
}
