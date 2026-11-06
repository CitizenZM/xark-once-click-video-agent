#!/usr/bin/env python3
"""Chrome native-messaging host (long-lived port).

Messages in : {"id", "url", "quality"?}  |  {"id", "type": "ping"}  |  {"id", "type": "update"}
Messages out: {"id", "ok", "meta"|"error"}  |  {"id", "type": "pong", ...}  |  {"id", "type": "updated", ...}
Downloads run in a small thread pool; every reply carries the request id.
"""
import json, os, re, shutil, struct, subprocess, sys, threading, time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

engine = os.environ.get("ONECLICK_ENGINE") or shutil.which("engine") or os.path.expanduser("~/.local/bin/engine")
OUT_DIR = os.environ.get("ONECLICK_OUT") or os.path.expanduser("~/Downloads/OneClick")
PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:" + os.path.expanduser("~/.local/bin")
COOKIE_HOSTS = ("instagram.com",)  # retry with Chrome cookies if the anonymous try fails
WORKERS = 3
PCT_RE = re.compile(r"\[PCT\]\s*([\d.]+)%")
DEV_FILE = os.environ.get("ONECLICK_DEV_FILE") or os.path.expanduser("~/.oneclick-dev")
EXT_DIR = os.environ.get("ONECLICK_EXT_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "extension")
WATCH_SEC = float(os.environ.get("ONECLICK_WATCH_SEC") or 2)
FIELDS = ("id,title,uploader,uploader_id,extractor_key,webpage_url,duration,view_count,"
          "like_count,comment_count,upload_date,description,tags,filepath")
FRIENDLY = (
    ("login required", "Login required: log in to the site in Chrome, then retry"),
    ("rate-limit", "Rate limited by the site: wait a few minutes"),
    ("private video", "This video is private"),
    ("unsupported url", "No downloadable video found on this page"),
    ("not available in your country", "Blocked in your region"),
    ("http error 403", "Site refused the request (403): update engine from the dashboard"),
)


def read_msg():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    return json.loads(sys.stdin.buffer.read(struct.unpack("<I", raw)[0]))


def log(line):
    try:
        with open(os.path.expanduser("~/Library/Logs/oneclick-host.log"), "a") as f:
            f.write(time.strftime("%F %T ") + line + "\n")
    except OSError:
        pass


def run(url, quality="best", cookies=False, on_pct=None):
    """Run engine, streaming progress. Returns (returncode, combined output)."""
    os.makedirs(OUT_DIR, exist_ok=True)
    cmd = [engine, "--no-playlist", "--no-warnings",
           "--windows-filenames",
           "-o", os.path.join(OUT_DIR, "%(uploader_id,uploader|site)s - %(title).60B [%(id)s].%(ext)s"),
           "--print", "after_move:%(.{" + FIELDS + "})j"]
    if quality == "audio":
        cmd += ["-f", "ba/b", "-x", "--audio-format", "mp3"]
    else:
        fmt = "bv*[height<=1080]+ba/b[height<=1080]" if quality == "1080" else "bv*+ba/b"
        cmd += ["-f", fmt, "-S", "vcodec:h264,acodec:m4a", "--merge-output-format", "mp4"]
    if cookies:
        cmd += ["--cookies-from-browser", "chrome"]
    cmd += ["--newline", "--progress-template", "download:[PCT] %(progress._percent_str)s"]
    proc = subprocess.Popen(cmd + [url], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                            env={**os.environ, "PATH": PATH})
    timer = threading.Timer(900, proc.kill)
    timer.start()
    out, last = [], -1
    try:
        for line in proc.stdout:
            out.append(line)
            m = PCT_RE.search(line)
            if m and on_pct and int(float(m.group(1))) != last:
                last = int(float(m.group(1)))
                on_pct(last)
        proc.wait()
    finally:
        timer.cancel()
    return proc.returncode, "".join(out)


def friendly(stderr):
    lines = (stderr or "").strip().splitlines()
    last = lines[-1] if lines else "engine failed"
    for needle, text in FRIENDLY:
        if needle in (stderr or "").lower():
            return text
    return last[:300]


def download(msg, on_pct=None):
    url = msg.get("url", "")
    u = urlparse(url)
    if u.scheme not in ("http", "https") or not u.netloc:
        return {"ok": False, "error": "invalid url"}
    quality = msg.get("quality", "best")
    try:
        code, out = run(url, quality, on_pct=on_pct)
        if code != 0 and u.netloc.endswith(COOKIE_HOSTS):
            code, out = run(url, quality, cookies=True, on_pct=on_pct)
    except Exception as e:  # missing engine, ...
        return {"ok": False, "error": str(e)}
    if code != 0:
        return {"ok": False, "error": friendly(out)}
    for line in reversed(out.strip().splitlines()):
        if line.startswith("{"):
            meta = json.loads(line)
            meta["file"] = meta.pop("filepath", None)
            return {"ok": True, "meta": meta}
    return {"ok": True, "meta": {"webpage_url": url, "file": None}}


def ping():
    try:
        v = subprocess.run([engine, "--version"], capture_output=True, text=True, timeout=20,
                           env={**os.environ, "PATH": PATH}).stdout.strip() or None
    except Exception:
        v = None
    return {"type": "pong", "engine": v, "ffmpeg": bool(shutil.which("ffmpeg", path=PATH)), "outDir": OUT_DIR}


def update():
    pipx = shutil.which("pipx", path=PATH)
    cmd = [pipx, "upgrade", "engine"] if pipx else [engine, "-U"]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=300, env={**os.environ, "PATH": PATH})
        out = (p.stdout + p.stderr).strip().splitlines()
        return {"type": "updated", "ok": p.returncode == 0, "output": out[-1] if out else ""}
    except Exception as e:
        return {"type": "updated", "ok": False, "output": str(e)}


def dev_mode():
    return os.path.exists(DEV_FILE)


def ext_stamp():
    """Newest mtime under the extension folder (dev auto-reload)."""
    latest = 0.0
    for root, _dirs, files in os.walk(EXT_DIR):
        for f in files:
            try:
                latest = max(latest, os.path.getmtime(os.path.join(root, f)))
            except OSError:
                pass
    return latest


def handle(msg, on_pct=None):
    kind = (msg or {}).get("type")
    if kind == "hello":
        return {"type": "hello", "dev": dev_mode()}
    if kind == "ping":
        return ping()
    if kind == "update":
        return update()
    return download(msg or {}, on_pct)


def main():
    lock = threading.Lock()

    def reply(obj):
        data = json.dumps(obj).encode()
        with lock:
            try:
                sys.stdout.buffer.write(struct.pack("<I", len(data)) + data)
                sys.stdout.buffer.flush()
            except OSError:
                pass

    watcher = []

    def watch():
        last = ext_stamp()
        while True:
            time.sleep(WATCH_SEC)
            now = ext_stamp()
            if now != last:
                last = now
                reply({"type": "reload", "id": None})

    def work(msg):
        pct = lambda p: reply({"type": "progress", "id": msg.get("id"), "pct": p})
        res = handle(msg, pct)
        res["id"] = msg.get("id")
        log("%s %s" % (msg.get("type") or msg.get("url"), json.dumps({k: res.get(k) for k in ("ok", "error")})
                                                           if msg.get("type") != "hello" else "v" + str(msg.get("version")) + " dev=" + str(res["dev"])))
        reply(res)
        if res.get("type") == "hello" and res["dev"] and not watcher:
            watcher.append(threading.Thread(target=watch, daemon=True))
            watcher[0].start()

    with ThreadPoolExecutor(WORKERS) as ex:
        while True:
            msg = read_msg()
            if msg is None:
                break
            ex.submit(work, msg)


if __name__ == "__main__":
    main()
