#!/usr/bin/env python3
"""Stdio MCP server over the saved-video library mirrored by the extension (~/.oneclick/library.json).

JSON-RPC 2.0, one message per line. No third-party packages. The library file is read again on every call.
Register:  claude mcp add xark-video -- python3 ~/.oneclick-downloader/host/mcp_server.py
"""
import datetime, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import insights_py as I  # noqa: E402

SERVER = {"name": "xark-video", "version": "1.0.0"}
PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"]


def library_path():
    return os.environ.get("ONECLICK_LIBRARY_FILE") or os.path.expanduser("~/.oneclick/library.json")


def load_library():
    try:
        with open(library_path(), encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        raise ToolError("The library has not been synced yet. Open the Xark extension (save a video or open its dashboard), wait a few seconds, then retry.")
    except ValueError as e:
        raise ToolError("The library file is unreadable: %s" % e)
    items = data.get("items") if isinstance(data, dict) else data
    return [v for v in items or [] if isinstance(v, dict)]


class ToolError(Exception):
    pass


def scoped(lib, collection):
    if not collection:
        return lib
    c = str(collection).strip().casefold()
    return [v for v in lib if str(v.get("folder") or "").strip().casefold() == c]


def slim(v):
    keys = ("url", "title", "platform", "uploader", "view_count", "like_count", "comment_count", "duration", "folder", "note", "hook")
    out = {k: v[k] for k in keys if v.get(k) not in (None, "")}
    if isinstance(v.get("at"), (int, float)):
        out["saved"] = datetime.datetime.fromtimestamp(v["at"] / 1000, datetime.timezone.utc).strftime("%Y-%m-%d")
    return out


def int_arg(args, name, default, lo, hi):
    try:
        return max(lo, min(hi, int(args.get(name, default))))
    except (TypeError, ValueError):
        raise ToolError("%s must be a number" % name)


def search_videos(args):
    lib = scoped(load_library(), args.get("collection"))
    platform = str(args.get("platform") or "").strip().casefold()
    words = str(args.get("query") or "").casefold().split()

    def hay(v):
        parts = [v.get("title"), v.get("uploader"), v.get("uploader_id"), v.get("note"), v.get("folder"), v.get("platform"),
                 v.get("description"), v.get("hook"), v.get("transcript"), v.get("url")] + [str(t) for t in (v.get("tags") or [])]
        return " ".join(str(p) for p in parts if p).casefold()

    hits = [v for v in lib if (not platform or str(v.get("platform") or "").casefold() == platform) and all(w in hay(v) for w in words)]
    hits.sort(key=lambda v: -(v.get("at") or 0))  # newest saved first, like the dashboard
    limit = int_arg(args, "limit", 20, 1, 100)
    return {"total": len(hits), "returned": min(limit, len(hits)), "videos": [slim(v) for v in hits[:limit]]}


def creator_stats(args):
    q = str(args.get("name") or "").strip().casefold()
    rows = [c for c in I.creator_stats(load_library()) if not q or q in str(c["creator"]).casefold()]
    for c in rows:
        c["best"] = slim(c["best"])
    return {"total": len(rows), "creators": rows[:50]}


def format_stats(args):
    rows = I.format_stats(load_library())
    for r in rows:
        r["example"] = slim(r["example"])
    return {"formats": rows}


def keyword_stats(args):
    rows = I.keyword_stats(load_library(), int_arg(args, "min", 2, 1, 1000))
    return {"total": len(rows), "keywords": rows[:100]}


def creative_brief(args):
    lib = scoped(load_library(), args.get("collection"))
    brief = I.creative_brief(lib)
    if brief is None:
        raise ToolError("Needs at least 3 saved videos%s." % (" in that collection" if args.get("collection") else ""))
    return brief


S = {"type": "string"}
TOOLS = {
    "search_videos": (search_videos, "Search the user's saved videos by words in title, creator, caption, tags, notes, collection or transcript. Newest saved first.",
                      {"query": {**S, "description": "Words that must all appear (any order). Empty matches everything."},
                       "platform": {**S, "description": "TikTok, Instagram, Youtube or Twitter"},
                       "collection": {**S, "description": "Collection (folder) name"},
                       "limit": {"type": "integer", "description": "Max results, default 20, max 100"}}),
    "creator_stats": (creator_stats, "Per-creator statistics over the saved videos: saved count, median views, lift vs the library median, like rate, followers, top hashtags and formats. Sorted by most saved.",
                      {"name": {**S, "description": "Only creators whose name contains this text"}}),
    "format_stats": (format_stats, "Which content formats (tutorial, review, unboxing, POV...) get the most views in the library: videos per format, median views, lift vs the library median, like rate, best example.", {}),
    "keyword_stats": (keyword_stats, "Words and hashtags that appear across saved videos, with video count and lift (median views of those videos vs the library median).",
                      {"min": {"type": "integer", "description": "Minimum number of videos sharing the keyword, default 2"}}),
    "creative_brief": (creative_brief, "An evidence-based creative brief from the library: formats to lead with, ideal length, keywords, hooks from the top videos and creators to study.",
                       {"collection": {**S, "description": "Limit the brief to one collection (folder)"}}),
}


def tool_list():
    return [{"name": n, "description": d, "inputSchema": {"type": "object", "properties": p}} for n, (_f, d, p) in TOOLS.items()]


def call_tool(name, args):
    if name not in TOOLS:
        return None
    try:
        result = TOOLS[name][0](args if isinstance(args, dict) else {})
        return {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False, indent=1)}], "isError": False}
    except ToolError as e:
        return {"content": [{"type": "text", "text": str(e)}], "isError": True}


def respond(msg):
    """Return the JSON-RPC response for a request, or None for a notification / response."""
    if not isinstance(msg, dict) or "method" not in msg:
        return None
    mid, method, params = msg.get("id"), msg["method"], msg.get("params") or {}
    if "id" not in msg:  # notification (notifications/initialized, ...)
        return None

    def ok(result):
        return {"jsonrpc": "2.0", "id": mid, "result": result}

    def err(code, text):
        return {"jsonrpc": "2.0", "id": mid, "error": {"code": code, "message": text}}

    if method == "initialize":
        want = params.get("protocolVersion")
        return ok({"protocolVersion": want if want in PROTOCOLS else PROTOCOLS[0], "capabilities": {"tools": {}}, "serverInfo": SERVER})
    if method == "ping":
        return ok({})
    if method == "tools/list":
        return ok({"tools": tool_list()})
    if method == "tools/call":
        res = call_tool(params.get("name"), params.get("arguments"))
        return ok(res) if res is not None else err(-32602, "Unknown tool: %s" % params.get("name"))
    return err(-32601, "Method not found: %s" % method)


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            out = respond(json.loads(line))
        except ValueError:
            out = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}}
        except Exception as e:  # a bug in a tool must not kill the server
            out = {"jsonrpc": "2.0", "id": None, "error": {"code": -32603, "message": "Internal error: %s" % e}}
        if out is not None:
            sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
