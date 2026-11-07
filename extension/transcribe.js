// Second stage of a download: local speech-to-text through the helper. Never turns a saved video into an error.
const MAX_CHARS = 5000;

export function createTranscriber({ call, get, locked, patchJob }) {
  let tail = Promise.resolve(); // one transcription at a time (whisper is CPU heavy); separate from the download slots

  const save = (url, fields) => locked(async () => {
    const lib = await get("library", []);
    const i = lib.findIndex((v) => v.url === url);
    if (i < 0) return false;
    lib[i] = { ...lib[i], ...fields };
    await chrome.storage.local.set({ library: lib });
    return true;
  });

  async function transcribeFile(url, file) {
    let r;
    try { r = await call({ type: "transcribe", file }); } catch (e) { r = { ok: false, error: e.message }; }
    if (r.ok) await save(url, { transcript: String(r.text || "").slice(0, MAX_CHARS), hook: r.hook || "", noSpeech: undefined });
    else if (r.error === "No speech found") await save(url, { transcript: "", hook: "", noSpeech: true });
    return r;
  }

  const queued = (fn) => (tail = tail.then(fn, fn));

  // Called by the download queue after a video is saved and the download job has already settled.
  function stage(job, meta) {
    if (!meta || !meta.file) return;
    patchJob(job, { state: "transcribing" });
    queued(async () => {
      const r = await transcribeFile(meta.webpage_url || job.url, meta.file);
      patchJob(job, { state: "done", reason: r.ok || r.error === "No speech found" ? undefined : "Transcript: " + r.error });
    }).catch(() => {});
  }

  // Dashboard "Transcribe" link for one saved video.
  async function one({ url }) {
    const v = (await get("library", [])).find((x) => x.url === url);
    if (!v || !v.file) return { ok: false, error: "File not found" };
    const r = await queued(() => transcribeFile(url, v.file));
    return r.ok ? { ok: true, hook: r.hook } : { ok: false, error: r.error };
  }

  return { stage, one };
}
