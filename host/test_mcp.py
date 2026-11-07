"""F7: the Python port of the statistics equals insights.js (via test/fixtures/expected.json), and mcp_server.py speaks MCP over stdio."""
import json, os, subprocess, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "..", "test", "fixtures")
sys.path.insert(0, HERE)
import insights_py as I  # noqa: E402

def read(name):
    with open(os.path.join(FIX, name)) as f:
        return json.load(f)


LIB = read("library.json")["items"]
EXPECTED = read("expected.json")


def rounded(x):
    if isinstance(x, float):
        return round(x, 6)
    if isinstance(x, list):
        return [rounded(i) for i in x]
    if isinstance(x, dict):
        return {k: rounded(v) for k, v in x.items()}
    return x


class Parity(unittest.TestCase):
    def check(self, name, got):
        self.assertEqual(rounded(got), rounded(EXPECTED[name]), name)

    def test_creator_stats(self): self.check("creatorStats", I.creator_stats(LIB))
    def test_format_stats(self): self.check("formatStats", I.format_stats(LIB))
    def test_keyword_stats(self): self.check("keywordStats", I.keyword_stats(LIB))
    def test_keyword_stats_min3(self): self.check("keywordStats_min3", I.keyword_stats(LIB, 3))
    def test_creative_brief(self): self.check("creativeBrief", I.creative_brief(LIB))

    def test_patterns_and_stop_words_are_the_same_as_insights_js(self):
        self.assertEqual([[n, rx.pattern, "i"] for n, rx in I.FORMATS], EXPECTED["formatPatterns"])
        self.assertEqual(sorted(I.STOP), EXPECTED["stopWords"])

    def test_brief_needs_three_videos(self):
        self.assertIsNone(I.creative_brief(LIB[:2]))

    def test_js_quirks_are_kept(self):
        # null like_count counts as a 0% like rate; a missing like_count is "no rate" (JS: null >= 0 is true)
        self.assertEqual(I._eng({"view_count": 100, "like_count": None}), 0)
        self.assertIsNone(I._eng({"view_count": 100}))
        self.assertEqual(I.to_fixed(0.25, 1), "0.3")  # toFixed rounds half up, Python's format would give 0.2


class Mcp(unittest.TestCase):
    def talk(self, msgs, lib=None):
        env = {**os.environ, "ONECLICK_LIBRARY_FILE": lib or os.path.join(FIX, "library.json")}
        p = subprocess.run([sys.executable, os.path.join(HERE, "mcp_server.py")], input="\n".join(json.dumps(m) for m in msgs) + "\n",
                           capture_output=True, text=True, env=env, timeout=30)
        self.assertEqual(p.stderr, "")
        return [json.loads(l) for l in p.stdout.splitlines()]

    def call(self, name, args=None, mid=3):
        return {"jsonrpc": "2.0", "id": mid, "method": "tools/call", "params": {"name": name, "arguments": args or {}}}

    def test_handshake_list_and_calls(self):
        out = self.talk([
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "t", "version": "1"}}},
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
            self.call("search_videos", {"query": "serum", "limit": 2}, 3),
            self.call("format_stats", {}, 4),
        ])
        self.assertEqual([m["id"] for m in out], [1, 2, 3, 4])  # the notification got no reply
        init = out[0]["result"]
        self.assertEqual((out[0]["jsonrpc"], init["protocolVersion"], init["serverInfo"]["name"]), ("2.0", "2025-03-26", "xark-video"))
        self.assertIn("tools", init["capabilities"])
        tools = {t["name"]: t for t in out[1]["result"]["tools"]}
        self.assertEqual(set(tools), {"search_videos", "creator_stats", "format_stats", "keyword_stats", "creative_brief"})
        for t in tools.values():
            self.assertEqual(t["inputSchema"]["type"], "object"); self.assertTrue(t["description"])
        s = out[2]["result"]
        self.assertFalse(s["isError"]); self.assertEqual(s["content"][0]["type"], "text")
        found = json.loads(s["content"][0]["text"])
        self.assertEqual((found["total"], found["returned"]), (3, 2))  # three saved videos mention "serum"; limit 2
        serum = sorted((v for v in LIB if "serum" in (v["title"] + v["description"]).lower()), key=lambda v: -v["at"])
        self.assertEqual([v["url"] for v in found["videos"]], [v["url"] for v in serum[:2]])  # newest saved first
        fm = json.loads(out[3]["result"]["content"][0]["text"])["formats"]
        want = {r["format"]: r for r in EXPECTED["formatStats"]}
        self.assertEqual({r["format"]: r["n"] for r in fm}, {k: r["n"] for k, r in want.items()})
        self.assertEqual(rounded({r["format"]: r["lift"] for r in fm}), rounded({k: r["lift"] for k, r in want.items()}))

    def test_tool_numbers_equal_the_dashboard_numbers(self):
        out = self.talk([self.call("creative_brief", {}, 1), self.call("creator_stats", {"name": "kai"}, 2), self.call("keyword_stats", {"min": 3}, 3)])
        brief = json.loads(out[0]["result"]["content"][0]["text"])
        self.assertEqual(brief, EXPECTED["creativeBrief"])
        creators = json.loads(out[1]["result"]["content"][0]["text"])["creators"]
        self.assertEqual([c["creator"] for c in creators], ["kitchen.kai"])
        self.assertEqual(rounded(creators[0]["medianViews"]), rounded(next(c for c in EXPECTED["creatorStats"] if c["creator"] == "kitchen.kai")["medianViews"]))
        kw = json.loads(out[2]["result"]["content"][0]["text"])["keywords"]
        self.assertEqual([k["keyword"] for k in kw], [k["keyword"] for k in EXPECTED["keywordStats_min3"]])

    def test_errors(self):
        d = tempfile.mkdtemp()
        out = self.talk([{"jsonrpc": "2.0", "id": 1, "method": "nope"}, self.call("nope", {}, 2), self.call("creative_brief", {}, 3)], lib=os.path.join(d, "missing.json"))
        self.assertEqual(out[0]["error"]["code"], -32601)
        self.assertEqual(out[1]["error"]["code"], -32602)
        self.assertTrue(out[2]["result"]["isError"]); self.assertIn("not been synced", out[2]["result"]["content"][0]["text"])

    def test_library_is_read_on_every_call(self):
        d = tempfile.mkdtemp(); path = os.path.join(d, "library.json")
        def write(items):
            with open(path, "w") as f:
                json.dump({"items": items}, f)

        write(LIB[:1])
        p = subprocess.Popen([sys.executable, os.path.join(HERE, "mcp_server.py")], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True,
                             env={**os.environ, "ONECLICK_LIBRARY_FILE": path})
        ask = lambda m: (p.stdin.write(json.dumps(m) + "\n"), p.stdin.flush(), json.loads(p.stdout.readline()))[2]
        n = lambda r: json.loads(r["result"]["content"][0]["text"])["total"]
        self.assertEqual(n(ask(self.call("search_videos", {}, 1))), 1)
        write(LIB)
        self.assertEqual(n(ask(self.call("search_videos", {}, 2))), len(LIB))
        p.stdin.close(); p.stdout.close(); p.wait(timeout=5)


if __name__ == "__main__":
    unittest.main()
