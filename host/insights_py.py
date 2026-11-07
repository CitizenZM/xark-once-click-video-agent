"""Python port of the library statistics in extension/insights.js (creatorStats, formatStats, keywordStats, creativeBrief).

The MCP server must give the numbers the dashboard shows, so this follows the JavaScript line by line, including its quirks:
  * like_count null counts as 0 in the like rate (null >= 0 is true in JS); a missing like_count is "no rate".
  * strings are sliced and measured in UTF-16 units, toFixed rounds half up, \b is ASCII-only.
Ties in the alphabetical ordering use a case-insensitive key that approximates localeCompare for lowercase tags and keywords.
test/parity.test.mjs writes test/fixtures/expected.json from insights.js; host/test_mcp.py asserts this port matches it.
"""
import re
from decimal import Decimal, ROUND_HALF_UP

_MISSING = object()


def _num(x):
    """JS numeric coercion for stored counts: numbers only (bool and strings are not counts)."""
    return x if isinstance(x, (int, float)) and not isinstance(x, bool) else None


def _count(arr):
    m = {}
    for k in arr:
        if k:
            m[k] = m.get(k, 0) + 1
    return sorted(({"k": k, "n": n} for k, n in m.items()), key=lambda r: (-r["n"], r["k"].casefold(), r["k"].swapcase()))


def _eng(v):
    vc, lc = _num(v.get("view_count")), v.get("like_count", _MISSING)
    if lc is None:
        lc = 0  # JS: null >= 0 is true and null / n is 0
    lc = _num(lc) if lc is not _MISSING else None
    return lc / vc if vc is not None and vc > 0 and lc is not None and lc >= 0 else None


def _avg(xs):
    return sum(xs) / len(xs) if xs else None


def _utf16_len(s):
    return len(s.encode("utf-16-le", "surrogatepass")) // 2


def _js_slice(s, n):
    return s.encode("utf-16-le", "surrogatepass")[: 2 * n].decode("utf-16-le", "ignore")


def to_fixed(x, digits):
    """Number.prototype.toFixed: the exact binary value rounded half up."""
    q = Decimal(abs(x)).quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP)
    return ("-" if x < 0 else "") + format(q, "f")


def _str(x):
    return "" if x is None else str(x)


def hashtags_of(v):
    tags = [_str(t).lower() for t in (v.get("tags") or [])]
    tags = [t[1:] if t.startswith("#") else t for t in tags]
    desc = [m.lower() for m in re.findall(r"#(\w+)", _str(v.get("description")))]
    return list(dict.fromkeys(tags + desc))


def _bucket(d):
    d = _num(d)
    return "unknown" if d is None else "<15s" if d < 15 else "15-30s" if d < 30 else "30-60s" if d < 60 else "60s+"


BUCKETS = ["<15s", "15-30s", "30-60s", "60s+"]


def handle_of(v):
    if v.get("platform") == "TikTok":
        m = re.search(r"tiktok\.com/@([\w.]+)", v.get("url") or "")
        if m:
            return m.group(1)
    return v.get("uploader_id") or v.get("uploader") or "unknown"


def median(xs):
    s = sorted(x for x in (_num(x) for x in xs) if x is not None and x > 0)
    if not s:
        return None
    return s[(len(s) - 1) // 2] if len(s) % 2 else (s[len(s) // 2 - 1] + s[len(s) // 2]) / 2


def bucket_stats(lib):
    out = []
    for k in BUCKETS:
        vs = [v for v in lib if _bucket(v.get("duration")) == k]
        out.append({"k": k, "n": len(vs), "avgEng": _avg([e for e in map(_eng, vs) if e is not None])})
    return out


# ---------- formats ----------
_F = re.IGNORECASE | re.ASCII
FORMATS = [
    ("Tutorial / how-to", re.compile(r"\b(how to|tutorial|step[- ]by[- ]step|guide|tips?|hack|learn)\b", _F)),
    ("Review", re.compile(r"\b(review|honest|worth it|tested|rating|verdict)\b", _F)),
    ("Unboxing / haul", re.compile(r"\b(unbox(ing)?|haul|what i got|first look)\b", _F)),
    ("Before / after", re.compile(r"\b(before (and|&) after|transformation|glow ?up|results?)\b", _F)),
    ("Comparison", re.compile(r"\b(vs\.?|versus|compare|comparison|which is better)\b", _F)),
    ("List / top N", re.compile(r"\b(top \d+|\d+ (things|ways|reasons|tips|products|mistakes))\b", _F)),
    ("Routine / GRWM / day in life", re.compile(r"\b(grwm|get ready with me|routine|day in (my|the) life|diml|morning|night ?time)\b", _F)),
    ("Recipe / food", re.compile(r"\b(recipe|cook(ing)?|meal ?prep|protein (shake|bar|pancakes?)|ingredients?)\b", _F)),
    ("POV / skit", re.compile(r"\b(pov|skit|when you|me when|comedy|funny)\b", _F)),
    ("Story / testimonial", re.compile(r"\b(story ?time|my journey|i lost|i gained|testimonial|changed my life)\b", _F)),
    ("Challenge / trend", re.compile(r"\b(challenge|trend|trending|duet|stitch)\b", _F)),
    ("Sponsored / ad", re.compile(r"(#ad\b|#sponsored|\bpaid partnership\b|\bpartner(ed)? with\b|\bcode [A-Z0-9]{3,}\b|\bdiscount code\b)", _F)),
]


def _text_of(v):
    return "%s %s %s" % (_str(v.get("title")), _js_slice(_str(v.get("description")), 400), _str(v.get("transcript")))  # same as insights.js textOf


def formats_of(v):
    t = "%s %s" % (_text_of(v), " ".join(_str(x) for x in (v.get("tags") or [])))
    hit = [n for n, rx in FORMATS if rx.search(t)]
    first = (_str(v.get("description") or v.get("title"))).split("\n")[0]
    if "?" in first:
        hit.append("Question hook")
    return hit or ["Other"]


def _group_stats(vs, base):
    med = median([v.get("view_count") for v in vs])
    rates = [e for e in map(_eng, vs) if e is not None]
    secs = [d for d in (_num(v.get("duration")) for v in vs) if d is not None and d > 0]
    return {"n": len(vs), "medianViews": med, "avgLikeRate": _avg(rates), "avgSeconds": _avg(secs),
            "lift": med / base if med and base else None}


def _views(v):
    return _num(v.get("view_count")) or 0


def creator_stats(lib):
    base = median([v.get("view_count") for v in lib])
    by = {}
    for v in lib:
        by.setdefault(handle_of(v), []).append(v)
    rows = []
    for k, vs in by.items():
        best = sorted(vs, key=lambda v: -_views(v))[0]
        followers = max([0] + [_num(v.get("channel_follower_count")) or 0 for v in vs]) or None
        tags = [t["k"] for t in _count([t for v in vs for t in hashtags_of(v)])[:3]]
        formats = [f["k"] for f in [f for f in _count([f for v in vs for f in formats_of(v)]) if f["k"] != "Other"][:2]]
        s = _group_stats(vs, base)
        rows.append({"creator": k, "platform": vs[0].get("platform"), **s, "totalViews": sum(_views(v) for v in vs),
                     "followers": followers, "viewsPerFollower": followers and s["medianViews"] and s["medianViews"] / followers or None,
                     "best": best, "tags": tags, "formats": formats, "lastSaved": max(_num(v.get("at")) or 0 for v in vs)})
    return sorted(rows, key=lambda r: (-r["n"], -(r["medianViews"] or 0)))


def format_stats(lib):
    base = median([v.get("view_count") for v in lib])
    by = {}
    for v in lib:
        for f in formats_of(v):
            by.setdefault(f, []).append(v)
    rows = [{"format": f, **_group_stats(vs, base), "example": sorted(vs, key=lambda v: -_views(v))[0]} for f, vs in by.items()]
    return sorted(rows, key=lambda r: -r["n"])


STOP = set((
    "the a an and or but if then so to of in on at for with from by is are was were be been it its this "
    "that these those i me my we our you your he she they them his her their what which who how why when "
    "where all any some more most no not only just can will would should could do does did have has had "
    "get got into out up down over than too very also about as like one two new now here there day today "
    "video videos reel reels post follow link bio comment comments share save tiktok instagram youtube "
    "shorts fyp foryou foryoupage viral explore trending dont don't im i'm it's thats that's make made "
    "makes use using used try need know want see look watch let lets going really much many every"
).split(" "))

_URL = re.compile(r"https?://\S+")
_HASH = re.compile(r"#\w+")
_WORD = re.compile(r"[^\W\d_](?:[^\W_]|['-]){2,}")


def keyword_stats(lib, min_n=2):
    base = median([v.get("view_count") for v in lib])
    by = {}
    for v in lib:
        text = _HASH.sub(" ", _URL.sub(" ", _text_of(v).lower()))
        words = list(dict.fromkeys(w for w in _WORD.findall(text) if w not in STOP))
        keys = list(dict.fromkeys(words + ["#" + t for t in hashtags_of(v) if t not in STOP]))
        for k in keys:
            by.setdefault(k, []).append(v)
    rows = [{"keyword": k, **_group_stats(vs, base), "creators": len({handle_of(x) for x in vs})} for k, vs in by.items() if len(vs) >= min_n]
    return sorted(rows, key=lambda r: (-r["n"], -(r["lift"] or 0)))


def creative_brief(lib):
    if len(lib) < 3:
        return None
    fm = sorted((f for f in format_stats(lib) if f["n"] >= 2 and f["format"] != "Other" and f["lift"] is not None), key=lambda f: -f["lift"])
    kw = sorted((k for k in keyword_stats(lib) if k["n"] >= 2 and k["lift"] is not None), key=lambda k: -k["lift"])
    lens = sorted((b for b in bucket_stats(lib) if b["n"] >= 2 and b["avgEng"] is not None), key=lambda b: -b["avgEng"])
    top = sorted(lib, key=lambda v: -_views(v))
    firsts = [_str(v.get("hook") or v.get("description") or v.get("title")).split("\n")[0].strip() for v in top]  # spoken hook first
    hooks = list(dict.fromkeys(h for h in firsts if _utf16_len(h) > 8))[:4]
    ideas = []
    if fm:
        ideas.append({"title": 'Lead with the "%s" format' % fm[0]["format"],
                      "basis": "%d saved videos, median views %sx your library median" % (fm[0]["n"], to_fixed(fm[0]["lift"], 1))})
    if len(fm) > 1:
        ideas.append({"title": 'Test "%s" as the second angle' % fm[1]["format"], "basis": "%d videos, %sx median views" % (fm[1]["n"], to_fixed(fm[1]["lift"], 1))})
    if lens:
        ideas.append({"title": "Keep it %s" % lens[0]["k"],
                      "basis": "highest like rate in your library (%s%%, %d videos)" % (to_fixed(lens[0]["avgEng"] * 100, 1), lens[0]["n"])})
    if kw:
        ideas.append({"title": "Work these words into hooks and captions: %s" % ", ".join(k["keyword"] for k in kw[:5]),
                      "basis": "keywords whose videos get the most views (2+ videos each)"})
    return {"ideas": ideas, "hooks": hooks, "topCreators": [c["creator"] for c in creator_stats(lib) if c["n"] >= 2][:3]}
