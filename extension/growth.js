// View-growth tracking over the saved library. Pure functions; the daily alarm lives in growth-run.js.
// A library entry gains history:[{at, views, likes, comments}]; the first point is the numbers saved with the video.
const D = 86400000;
export const CHECKPOINTS = [1, 7, 30]; // days after saving
export const MAX_PER_RUN = 50;
export const MAX_FAILS = 3;            // a video the helper cannot read this many times is left alone (it must not starve the rest)

const num = (x) => (Number.isFinite(Number(x)) && x !== null && x !== "" ? Number(x) : null);

// URLs whose saved time passed a checkpoint (1, 7 or 30 days) that no history point covers yet. Oldest first, at most 50.
// A point covers every checkpoint already reached when it was taken, so a late first check is not repeated for the earlier ones.
export function dueForCheck(library, now = Date.now()) {
  return (library || [])
    .filter((v) => {
      if (!v || !v.url || !Number.isFinite(v.at) || (v.statsFails || 0) >= MAX_FAILS) return false;
      const taken = (v.history || []).map((p) => p.at); // history[0] is the saved numbers: it predates every checkpoint, so it never covers one
      return CHECKPOINTS.some((c) => v.at + c * D <= now && !taken.some((t) => t >= v.at + c * D));
    })
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_PER_RUN)
    .map((v) => v.url);
}

// Returns a new entry with one more history point (the first point is the original saved numbers).
export function appendHistory(entry, stats, now = Date.now()) {
  const first = { at: entry.at, views: num(entry.view_count), likes: num(entry.like_count), comments: num(entry.comment_count) };
  const history = [...(entry.history && entry.history.length ? entry.history : [first]),
    { at: now, views: num(stats.view_count), likes: num(stats.like_count), comments: num(stats.comment_count) }];
  const { statsFails, ...rest } = entry;
  return { ...rest, history };
}

// The helper could not read the video: count it, so dueForCheck gives up after MAX_FAILS.
export const markStatsFailed = (entry) => ({ ...entry, statsFails: (entry.statsFails || 0) + 1 });

// (latest views - first views) / first views, per day. null when there is no trend to speak of.
export function growthRate(entry) {
  const h = (entry && entry.history) || [];
  if (h.length < 2) return null;
  const first = h[0], last = h[h.length - 1];
  if (!(first.views > 0) || !Number.isFinite(last.views)) return null;
  const days = (last.at - first.at) / D;
  if (!(days > 0)) return null;
  return (last.views - first.views) / first.views / days;
}

// Dashboard card rows: fastest growers first, only videos that actually grew.
export function fastestGrowing(library, limit = 6) {
  return (library || [])
    .map((v) => ({ video: v, rate: growthRate(v), checks: Math.max(0, ((v.history || []).length) - 1) }))
    .filter((r) => r.rate != null && r.rate > 0)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, limit);
}
