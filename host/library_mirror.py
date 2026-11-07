"""Mirror of the extension's library for the MCP server: ~/.oneclick/library.json, owner-only, written atomically."""
import json, os, tempfile, time

# Same allowlist as the extension sends (extension/growth-run.js): what the statistics and search need.
KEEP = ("url", "title", "platform", "uploader", "uploader_id", "duration", "view_count", "like_count", "comment_count",
        "channel_follower_count", "tags", "description", "upload_date", "at", "note", "folder", "hook", "transcript")
MAX_ITEMS = 5000
MAX_TRANSCRIPT = 20000


def library_path():
    return os.environ.get("ONECLICK_LIBRARY_FILE") or os.path.expanduser("~/.oneclick/library.json")


def clean(item):
    out = {k: item[k] for k in KEEP if k in item}  # null counts are kept: the statistics treat null and missing differently
    if isinstance(out.get("transcript"), str):
        out["transcript"] = out["transcript"][:MAX_TRANSCRIPT]
    return out


def write_atomic(path, data):
    d = os.path.dirname(path) or "."
    os.makedirs(d, mode=0o700, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".library-", suffix=".tmp")  # mkstemp creates the file 0600
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)  # readers see the old file or the new one, never half of it
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def sync(items):
    if not isinstance(items, list):
        return {"type": "synced", "ok": False, "error": "items must be a list"}
    rows = [clean(i) for i in items[-MAX_ITEMS:] if isinstance(i, dict) and i.get("url")]
    try:
        write_atomic(library_path(), {"version": 1, "synced_at": int(time.time() * 1000), "items": rows})
    except OSError as e:
        return {"type": "synced", "ok": False, "error": str(e)}
    return {"type": "synced", "ok": True, "count": len(rows)}
