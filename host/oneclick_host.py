#!/usr/bin/python3
"""Chrome native-messaging host: receives {"url": ...}, runs engine, replies {"ok":..., "file"/"error":...}."""
import json, os, struct, subprocess, sys, time
from urllib.parse import urlparse

engine = os.environ.get("ONECLICK_ENGINE") or os.path.expanduser("~/.local/bin/engine")
OUT_DIR = os.environ.get("ONECLICK_OUT") or os.path.expanduser("~/Downloads/OneClick")
PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"  # ffmpeg lives in /opt/homebrew/bin
COOKIE_HOSTS = ("instagram.com",)  # retry with Chrome cookies if the anonymous try fails


def read_msg():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    return json.loads(sys.stdin.buffer.read(struct.unpack("<I", raw)[0]))


def send_msg(obj):
    data = json.dumps(obj).encode()
    sys.stdout.buffer.write(struct.pack("<I", len(data)) + data)
    sys.stdout.buffer.flush()


def run(url, cookies=False):
    os.makedirs(OUT_DIR, exist_ok=True)
    cmd = [engine, "--no-playlist", "-f", "bv*+ba/b", "-S", "vcodec:h264,acodec:m4a", "--merge-output-format", "mp4",
           "-o", os.path.join(OUT_DIR, "%(uploader|site)s - %(title).80B [%(id)s].%(ext)s"),
           "--print", "after_move:filepath", "--no-warnings"]
    if cookies:
        cmd += ["--cookies-from-browser", "chrome"]
    p = subprocess.run(cmd + [url], capture_output=True, text=True, timeout=600,
                       env={**os.environ, "PATH": PATH})
    return p


def handle(msg):
    url = (msg or {}).get("url", "")
    u = urlparse(url)
    if u.scheme not in ("http", "https") or not u.netloc:
        return {"ok": False, "error": "invalid url"}
    try:
        p = run(url)
        if p.returncode != 0 and u.netloc.endswith(COOKIE_HOSTS):
            p = run(url, cookies=True)
    except Exception as e:  # missing engine, timeout, ...
        return {"ok": False, "error": str(e)}
    if p.returncode != 0:
        lines = (p.stderr or "").strip().splitlines()
        return {"ok": False, "error": lines[-1][:300] if lines else "engine failed"}
    out = (p.stdout or "").strip().splitlines()
    return {"ok": True, "file": out[-1] if out else OUT_DIR}


def log(line):
    try:
        with open(os.path.expanduser("~/Library/Logs/oneclick-host.log"), "a") as f:
            f.write(time.strftime("%F %T ") + line + "\n")
    except OSError:
        pass


if __name__ == "__main__":
    msg = read_msg()
    log("request " + json.dumps(msg))
    res = handle(msg)
    log("result " + json.dumps(res))
    send_msg(res)
