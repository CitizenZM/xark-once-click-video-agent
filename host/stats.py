"""View-count lookups for the growth tracker: `engine --skip-download -J <url>` per URL, politely spaced."""
import json, os, subprocess, time

MAX_URLS = 50
FIELDS = ("view_count", "like_count", "comment_count")


def gap_seconds():
    try:
        return max(0.0, float(os.environ.get("ONECLICK_STATS_GAP_SEC", 2)))
    except ValueError:
        return 2.0


def parse_stats(stdout):
    """The JSON object engine -J printed (the last line that starts with '{'), reduced to the three counters."""
    for line in reversed((stdout or "").strip().splitlines()):
        if line.startswith("{"):
            info = json.loads(line)
            if info.get("_type") == "playlist":  # a profile or playlist URL: no single video to count
                raise ValueError("not a single video")
            return {k: info.get(k) if isinstance(info.get(k), (int, float)) else None for k in FIELDS}
    raise ValueError("engine printed no JSON")


def one(url, host, cookies=False):
    cmd = [host.engine, "--skip-download", "--no-warnings", "--no-playlist", "-J"]
    if cookies:
        cmd += ["--cookies-from-browser", "chrome"]
    return subprocess.run(cmd + [url], capture_output=True, text=True, timeout=120, env={**os.environ, "PATH": host.PATH})


def fetch_stats(urls, host):
    """host = the oneclick_host module (engine, PATH, valid_url, COOKIE_HOSTS, friendly). Never raises."""
    from urllib.parse import urlparse
    results = []
    for i, url in enumerate((urls if isinstance(urls, list) else [])[:MAX_URLS]):
        row = {"url": url, "ok": False, "view_count": None, "like_count": None, "comment_count": None, "error": None}
        if not isinstance(url, str) or not host.valid_url(url):
            row["error"] = "invalid url"
            results.append(row)
            continue
        if i:
            time.sleep(gap_seconds())
        try:
            p = one(url, host)
            if p.returncode != 0 and urlparse(url).hostname in host.COOKIE_HOSTS:
                p = one(url, host, cookies=True)
            if p.returncode != 0:
                row["error"] = host.friendly(p.stderr)
            else:
                row.update(parse_stats(p.stdout), ok=True)
        except Exception as e:  # timeout, missing engine, bad JSON
            row["error"] = str(e)[:300]
        results.append(row)
    return results
