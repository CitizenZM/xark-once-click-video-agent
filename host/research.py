"""Research helpers for projects: viewer comments, YouTube search, and the bridge to Ad Studio.

Kept apart from oneclick_host.py; `h` is that module (engine path, PATH, URL checks).
Ad Studio (~/Projects/ad-studio-20261104) runs on this Mac; the helper uploads the already-downloaded video file to
its own API (POST /api/jobs to make an ad, POST /api/library/import to cut clips into its library) instead of
re-implementing cutting or rendering here.
"""
import json, mimetypes, os, re, subprocess, uuid
from urllib import request as urlreq
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus, urlparse

MAX_COMMENTS = 60
VIDEO_EXT = (".mp4", ".mov", ".m4v", ".webm", ".mkv")
MAX_UPLOAD = 300 * 1024 * 1024
LOCAL_BASE = re.compile(r"^http://(localhost|127\.0\.0\.1)(:\d{2,5})?/?$")


def _num(x):
    return x if isinstance(x, (int, float)) and not isinstance(x, bool) and x >= 0 else None


# ---------- comments (engine: works for YouTube; TikTok and Instagram are read from the open page instead) ----------
def comments(msg, h):
    url = msg.get("url", "")
    if not h.valid_url(url):
        return {"type": "comments", "ok": False, "error": "invalid url"}
    cmd = [h.engine, "--skip-download", "--no-warnings", "--write-comments", "-j",
           "--extractor-args", "youtube:max_comments=%d,all,0,0;comment_sort=top" % MAX_COMMENTS, url]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=180, env={**os.environ, "PATH": h.PATH})
    except Exception as e:
        return {"type": "comments", "ok": False, "error": str(e)}
    if p.returncode != 0:
        return {"type": "comments", "ok": False, "error": h.friendly(p.stderr)}
    try:
        meta = json.loads(p.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        return {"type": "comments", "ok": False, "error": "no data"}
    out = clean_comments(meta.get("comments") or [])
    return {"type": "comments", "ok": True, "comments": out, "count": _num(meta.get("comment_count"))}


def clean_comments(raw):
    out = []
    for c in raw if isinstance(raw, list) else []:
        if not isinstance(c, dict) or c.get("parent") not in (None, "root"):
            continue  # top-level comments only
        text = re.sub(r"\s+", " ", str(c.get("text") or "")).strip()[:300]
        if text:
            out.append({"text": text, "likes": _num(c.get("like_count")) or 0})
    out.sort(key=lambda c: -c["likes"])
    return out[:MAX_COMMENTS]


# ---------- search (YouTube only: engine has no TikTok / Instagram search; those use the select bar on the site) ----------
SHORTS_FILTER = "EgIYAQ%253D%253D"  # YouTube "under 4 minutes"


def search(msg, h):
    q = re.sub(r"\s+", " ", str(msg.get("query") or "")).strip()[:80]
    if not q:
        return {"type": "search", "ok": False, "error": "enter a search term"}
    try:
        limit = max(5, min(int(msg.get("limit") or 30), 60))
    except (TypeError, ValueError):
        limit = 30
    url = "https://www.youtube.com/results?search_query=%s&sp=%s" % (quote_plus(q), SHORTS_FILTER)
    fmt = "%(.{url,title,view_count,duration,channel,channel_id,channel_url,uploader_id})j"
    try:
        p = subprocess.run([h.engine, "--flat-playlist", "--no-warnings", "--playlist-end", str(limit), "--print", fmt, url],
                           capture_output=True, text=True, timeout=180, env={**os.environ, "PATH": h.PATH})
    except Exception as e:
        return {"type": "search", "ok": False, "error": str(e)}
    if p.returncode != 0:
        return {"type": "search", "ok": False, "error": h.friendly(p.stderr)}
    items = [x for x in (search_item(l, h) for l in p.stdout.splitlines()) if x][:limit]
    return {"type": "search", "ok": True, "query": q, "platform": "youtube", "items": items}


def search_item(line, h):
    try:
        x = json.loads(line)
    except ValueError:
        return None
    if not isinstance(x, dict) or not isinstance(x.get("url"), str) or not h.valid_url(x["url"]):
        return None
    handle = str(x.get("uploader_id") or "").strip()
    acct = ("https://www.youtube.com/%s" % handle if handle.startswith("@") else
            x.get("channel_url") if isinstance(x.get("channel_url"), str) and x["channel_url"].startswith("https://") else
            "https://www.youtube.com/channel/%s" % x["channel_id"] if re.match(r"^[\w-]{10,40}$", str(x.get("channel_id") or "")) else None)
    return {"url": x["url"], "title": str(x.get("title") or "")[:150], "view_count": _num(x.get("view_count")),
            "duration": _num(x.get("duration")), "account": acct, "name": str(x.get("channel") or "")[:80]}


# ---------- Ad Studio bridge ----------
def _base(b):
    b = str(b or "").strip()
    if not LOCAL_BASE.match(b):
        raise ValueError("Ad Studio address must be http://localhost:PORT (it runs on this Mac)")
    return b.rstrip("/")


def _video_file(f):
    if not f:
        return None
    home = os.path.realpath(os.path.expanduser("~"))
    p = os.path.realpath(os.path.expanduser(str(f)))
    if os.path.commonpath([p, home]) != home or not p.lower().endswith(VIDEO_EXT) or not os.path.isfile(p):
        raise ValueError("The video file is missing (download it again)")
    if os.path.getsize(p) > MAX_UPLOAD:
        raise ValueError("Video over 300MB")
    return p


def multipart(fields, file_path=None):
    """(body bytes, content-type) for a form with text fields and one optional file named 'file'."""
    b = "----oneclick" + uuid.uuid4().hex
    parts = []
    for k, v in fields.items():
        if v is None or v == "":
            continue
        parts.append(('--%s\r\nContent-Disposition: form-data; name="%s"\r\n\r\n%s\r\n' % (b, k, v)).encode())
    if file_path:
        name = os.path.basename(file_path).replace('"', "")
        ctype = mimetypes.guess_type(file_path)[0] or "video/mp4"
        with open(file_path, "rb") as fh:
            data = fh.read()
        parts.append(('--%s\r\nContent-Disposition: form-data; name="file"; filename="%s"\r\nContent-Type: %s\r\n\r\n' % (b, name, ctype)).encode() + data + b"\r\n")
    parts.append(("--%s--\r\n" % b).encode())
    return b"".join(parts), "multipart/form-data; boundary=" + b


def _http(method, url, body=None, ctype=None, timeout=300):
    req = urlreq.Request(url, data=body, method=method, headers={"content-type": ctype} if ctype else {})
    try:
        with urlreq.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"{}")
    except HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {}
    except URLError as e:
        raise ConnectionError("Ad Studio is not running at that address (%s)" % e.reason)


def adstudio(msg, h):
    action = msg.get("action")
    try:
        base = _base(msg.get("base"))
        if action == "ping":
            code, lib = _http("GET", base + "/api/library", timeout=10)
            return {"type": "adstudio", "ok": code == 200, "clips": len(lib) if isinstance(lib, list) else 0}
        if action == "job":
            product = str(msg.get("productUrl") or "")
            if not re.match(r"^https?://", product):
                return {"type": "adstudio", "ok": False, "error": "Add the product page link (https://...) first"}
            ref = str(msg.get("refUrl") or "")
            f = _video_file(msg.get("file")) if msg.get("file") else None
            if not f and not h.valid_url(ref):
                return {"type": "adstudio", "ok": False, "error": "No reference video"}
            fields = {"productUrl": product, "refUrl": "" if f else ref, "title": str(msg.get("title") or "")[:80],
                      "notes": str(msg.get("notes") or "")[:2000], "goal": str(msg.get("goal") or "")[:2000],
                      "engine": "generate" if msg.get("engine") == "generate" else "remix", "variants": "1"}
            body, ctype = multipart(fields, f)
            code, r = _http("POST", base + "/api/jobs", body, ctype)
            if code != 200 or not r.get("id"):
                return {"type": "adstudio", "ok": False, "error": r.get("error") or "Ad Studio answered %d" % code}
            return {"type": "adstudio", "ok": True, "id": r["id"], "url": "%s/jobs/%s" % (base, r["id"])}
        if action == "clips":
            if msg.get("rights") not in ("own", "licensed"):
                return {"type": "adstudio", "ok": False, "error": "Confirm you own or have licensed this footage"}
            f = _video_file(msg.get("file"))
            clips = [{"start": c.get("start"), "end": c.get("end"), "role": str(c.get("role") or "")[:20], "text": str(c.get("text") or "")[:200]}
                     for c in (msg.get("clips") or [])[:12] if isinstance(c, dict)]
            body, ctype = multipart({"clips": json.dumps(clips), "rights": msg["rights"], "project": str(msg.get("project") or "")[:60],
                                     "source": json.dumps({k: str((msg.get("source") or {}).get(k) or "")[:300] for k in ("url", "creator", "title")})}, f)
            code, r = _http("POST", base + "/api/library/import", body, ctype)
            if code != 200 or not r.get("ok"):
                return {"type": "adstudio", "ok": False, "error": r.get("error") or "Ad Studio answered %d" % code}
            return {"type": "adstudio", "ok": True, "clips": [{"id": c.get("id"), "dur": c.get("dur"), "role": c.get("role")} for c in r.get("clips", [])]}
        return {"type": "adstudio", "ok": False, "error": "unknown action"}
    except (ValueError, ConnectionError) as e:
        return {"type": "adstudio", "ok": False, "error": str(e)}
