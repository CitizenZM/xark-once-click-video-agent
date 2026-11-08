// Winner signals over the saved library (pure functions): views per hour, beating the creator's own typical video,
// how long an ad has been running, and lift per AI tag.
import { creatorKey, median, baselines, groupStats } from "./insights.js";

const H = 3600000, D = 86400000;

// When the video was posted (ms). engine's timestamp is exact; a bare upload_date is only trusted once the video is
// 3+ days old at save time (taken as midday UTC, so the error stays under ~10%).
export function postedAt(v) {
  if (Number(v.timestamp) > 0) return Number(v.timestamp) * 1000;
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(v.upload_date || ""));
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], 12);
  return Number.isFinite(v.at) && v.at - t >= 3 * D ? t : null;
}

// Views per hour. lifetime = views at save ÷ hours since posting; recent = views gained between the last two checks.
// now = recent when there is one (it shows whether the video is still climbing), else lifetime.
export function velocity(v) {
  const posted = postedAt(v);
  const lifetime = posted && v.view_count > 0 && v.at - posted >= H ? v.view_count / ((v.at - posted) / H) : null;
  const h = (v.history || []).filter((p) => Number.isFinite(p.views) && p.views != null);
  let recent = null;
  if (h.length >= 2) {
    const a = h[h.length - 2], b = h[h.length - 1];
    if (b.at - a.at >= H) recent = Math.max(0, (b.views - a.views) / ((b.at - a.at) / H));
  }
  return { lifetime, recent, now: recent ?? lifetime, ageHours: posted ? (v.at - posted) / H : null };
}

export function fastestNow(lib, limit = 6) {
  return lib.map((v) => ({ video: v, ...velocity(v) })).filter((r) => r.now > 0).sort((a, b) => b.now - a.now).slice(0, limit);
}

// The creator's typical video. A median read off their profile grid when the video was picked there (select mode),
// else the median of the videos saved from them (3 or more). Where views are hidden (Instagram) it compares likes.
export function creatorBaselines(lib) {
  const by = new Map();
  for (const v of lib) { const k = creatorKey(v); if (!by.has(k)) by.set(k, []); by.get(k).push(v); }
  const out = new Map();
  for (const [k, vs] of by) {
    const views = vs.filter((v) => v.view_count > 0), likes = vs.filter((v) => !(v.view_count > 0) && v.like_count > 0);
    out.set(k, { views: views.length >= 3 ? median(views.map((v) => v.view_count)) : null, viewsN: views.length,
      likes: likes.length >= 3 ? median(likes.map((v) => v.like_count)) : null, likesN: likes.length });
  }
  return out;
}

export function vsCreator(v, bases) {
  if (v.view_count > 0 && v.creator_median_views > 0)
    return { multiple: v.view_count / v.creator_median_views, by: "views", basis: `${(v.view_count / v.creator_median_views).toFixed(1)}x the creator's typical views (median of ${v.creator_median_n || "their"} videos on their profile)` };
  const b = bases.get(creatorKey(v));
  if (!b) return null;
  if (v.view_count > 0 && b.views) return { multiple: v.view_count / b.views, by: "views", basis: `${(v.view_count / b.views).toFixed(1)}x the median views of ${b.viewsN} saved videos from this creator` };
  if (!(v.view_count > 0) && v.like_count > 0 && b.likes) return { multiple: v.like_count / b.likes, by: "likes", basis: `${(v.like_count / b.likes).toFixed(1)}x the median likes of ${b.likesN} saved videos from this creator` };
  return null;
}

// Videos at 2x or more of their own creator's typical video.
export function creatorOutliers(lib, limit = 6, min = 2) {
  const bases = creatorBaselines(lib);
  return lib.map((v) => ({ video: v, ...vsCreator(v, bases) })).filter((r) => r.multiple >= min)
    .sort((a, b) => b.multiple - a.multiple).slice(0, limit);
}

// Ad run length in days, from the dates the Meta Ad Library shows. An ad still active is counted up to when it was saved.
export const LONG_RUN_DAYS = 30;
export function adRun(v) {
  if (!(v.ad_start > 0)) return null;
  const end = v.ad_active === false && v.ad_end > 0 ? v.ad_end : v.ad_seen || v.at;
  if (!(end >= v.ad_start)) return null;
  const days = Math.floor((end - v.ad_start) / D) + 1;
  return { days, active: v.ad_active !== false, start: v.ad_start, end, long: days >= LONG_RUN_DAYS };
}

export function longRunningAds(lib, limit = 8) {
  const ads = lib.map((v) => ({ video: v, ...adRun(v) })).filter((r) => r.days);
  return { ads: ads.sort((a, b) => b.days - a.days || (b.active ? 1 : 0) - (a.active ? 1 : 0)).slice(0, limit), withDates: ads.length,
    long: ads.filter((a) => a.long).length, medianDays: median(ads.map((a) => a.days)), adsTotal: lib.filter((v) => v.source).length };
}

// Lift per AI tag value (hook type, angle, audience, emotion), against the whole view as the baseline.
export const TAG_DIMS = ["hook", "angle", "audience", "emotion"];
export function tagStats(lib, dim) {
  const base = baselines(lib), by = new Map();
  for (const v of lib) {
    const t = v.ai_tags && String(v.ai_tags[dim] || "").trim().toLowerCase();
    if (!t) continue;
    if (!by.has(t)) by.set(t, []);
    by.get(t).push(v);
  }
  return [...by].map(([value, vs]) => ({ value, ...groupStats(vs, base) })).sort((a, b) => b.n - a.n || (b.lift || 0) - (a.lift || 0));
}
export const taggedCount = (lib) => lib.filter((v) => v.ai_tags).length;
