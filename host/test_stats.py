"""F5 helper side: {type:"stats"} with a stub engine that prints a real `engine -J` document (host/fixtures/engine_J_tiktok.json)."""
import json, os, sys, tempfile, unittest
os.environ.setdefault("ONECLICK_LOG", os.path.join(tempfile.gettempdir(), "oneclick-test.log"))  # never write tests into the real log

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_host import session, stub  # noqa: E402
import stats  # noqa: E402

FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "engine_J_tiktok.json")
OK = "https://www.tiktok.com/@khaby.lame/video/7704740944427388191"
# Stub: log "<epoch> <args>", then answer by URL. The fixture is a trimmed copy of a real `engine --skip-download -J` output.
BODY = '''
log="$(dirname "$0")/calls"
echo "$(perl -MTime::HiRes=time -e 'printf "%.3f", time') $*" >> "$log"
for last; do :; done
case "$last" in
  *bad*) echo "ERROR: [TikTok] 1: Private video" >&2; exit 1 ;;
  *list*) echo '{"_type":"playlist","id":"x","entries":[]}' ;;
  *nolikes*) python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); d["like_count"]=None; d.pop("comment_count"); print(json.dumps(d))' "@F@" ;;
  *) tr -d '\n' < "@F@"; echo ;;  # engine -J prints one line
esac
'''.replace("@F@", FIXTURE)


def run(urls, gap="0", path_dir=None):
    path, d = stub(BODY)
    r = session([{"id": 1, "type": "stats", "urls": urls}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d, "ONECLICK_STATS_GAP_SEC": gap})[1]
    log = os.path.join(d, "calls")
    calls = []
    if os.path.exists(log):
        with open(log) as f:
            calls = f.read().splitlines()
    return r, calls


class Stats(unittest.TestCase):
    def test_fixture_is_a_real_yt_dlp_document(self):
        with open(FIXTURE) as f:
            info = json.load(f)
        for k in ("id", "extractor_key", "view_count", "like_count", "comment_count", "webpage_url", "uploader_id", "formats"):
            self.assertIn(k, info)
        self.assertEqual(stats.parse_stats(json.dumps(info)), {"view_count": 454900, "like_count": 55600, "comment_count": 1675})

    def test_reply_has_counts_per_url_and_runs_engine_as_specified(self):
        r, calls = run([OK])
        self.assertEqual((r["type"], r["ok"]), ("stats", True))
        self.assertEqual(r["results"], [{"url": OK, "ok": True, "view_count": 454900, "like_count": 55600, "comment_count": 1675, "error": None}])
        self.assertEqual(len(calls), 1)
        for needle in ("--skip-download", "--no-warnings", " -J ", OK):
            self.assertIn(needle, calls[0] + " ")

    def test_failures_are_reported_per_url_and_do_not_stop_the_rest(self):
        urls = [OK, "https://www.tiktok.com/@a/video/bad1", "http://127.0.0.1:8080/x", "ftp://example.com/v", "https://www.tiktok.com/@a/video/list1", OK.replace("7704", "7705")]
        r, calls = run(urls)
        res = {x["url"]: x for x in r["results"]}
        self.assertEqual([x["url"] for x in r["results"]], urls)
        self.assertTrue(res[OK]["ok"] and res[urls[-1]]["ok"])
        self.assertEqual((res[urls[1]]["ok"], res[urls[1]]["error"]), (False, "This video is private"))
        self.assertEqual(res[urls[2]]["error"], "invalid url"); self.assertEqual(res[urls[3]]["error"], "invalid url")
        self.assertFalse(res[urls[4]]["ok"]); self.assertIn("not a single video", res[urls[4]]["error"])
        self.assertEqual(len(calls), 4)  # the two invalid URLs never reached engine

    def test_missing_counters_are_null_not_zero(self):
        r, _ = run(["https://www.tiktok.com/@a/video/nolikes1"])
        x = r["results"][0]
        self.assertTrue(x["ok"]); self.assertEqual((x["view_count"], x["like_count"], x["comment_count"]), (454900, None, None))

    def test_urls_are_spaced_by_the_gap(self):
        r, calls = run([OK, OK.replace("7704", "7705"), OK.replace("7704", "7706")], gap="0.4")
        t = [float(c.split()[0]) for c in calls]
        self.assertEqual(len(t), 3)
        self.assertTrue(all(b - a >= 0.35 for a, b in zip(t, t[1:])), t)

    def test_at_most_50_urls_per_call(self):
        urls = ["https://www.tiktok.com/@a/video/%d" % i for i in range(60)]
        r, calls = run(urls)
        self.assertEqual((len(r["results"]), len(calls)), (50, 50))
        self.assertEqual(r["results"][-1]["url"], urls[49])

    def test_bad_urls_field_is_an_empty_result_not_a_crash(self):
        path, d = stub(BODY)
        r = session([{"id": 1, "type": "stats", "urls": "nope"}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})[1]
        self.assertEqual((r["ok"], r["results"]), (True, []))


if __name__ == "__main__":
    unittest.main()
