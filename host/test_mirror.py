"""F7 helper side: {type:"sync-library"} writes ~/.oneclick/library.json (here: a temp path) owner-only and atomically."""
import json, os, stat, sys, tempfile, threading, unittest
os.environ.setdefault("ONECLICK_LOG", os.path.join(tempfile.gettempdir(), "oneclick-test.log"))

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_host import session  # noqa: E402
import library_mirror  # noqa: E402


class Mirror(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.path = os.path.join(self.dir, "sub", "library.json")  # the folder does not exist yet
        self.env = {"ONECLICK_LIBRARY_FILE": self.path}
        self.umask = os.umask(0o022)  # a permissive umask: the 0600 must come from the code, not from the machine's setting
        self.addCleanup(os.umask, self.umask)

    def test_message_writes_the_file_0600_with_only_the_allowed_fields(self):
        items = [{"url": "https://www.tiktok.com/@a/video/1", "title": "t", "view_count": 5, "like_count": None, "file": "/Users/x/secret.mp4",
                  "formats": [{"url": "https://cdn/secret"}], "history": [{"at": 1}], "transcript": "w" * 30000, "folder": "refs"},
                 {"title": "no url: dropped"}, "junk"]
        r = session([{"id": 1, "type": "sync-library", "items": items}], self.env)[1]
        self.assertEqual((r["type"], r["ok"], r["count"]), ("synced", True, 1))
        self.assertEqual(stat.S_IMODE(os.stat(self.path).st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(os.stat(os.path.dirname(self.path)).st_mode), 0o700)
        with open(self.path) as f:
            data = json.load(f)
        row = data["items"][0]
        self.assertEqual(sorted(row), ["folder", "like_count", "title", "transcript", "url", "view_count"])  # no file path, formats or history
        self.assertIsNone(row["like_count"])  # null stays null: the statistics treat it differently from missing
        self.assertEqual(len(row["transcript"]), library_mirror.MAX_TRANSCRIPT)
        self.assertEqual(os.listdir(os.path.dirname(self.path)), ["library.json"])  # no temp file left behind

    def test_second_sync_replaces_the_first(self):
        for n in (3, 1):
            session([{"id": 1, "type": "sync-library", "items": [{"url": "https://x/%d" % i} for i in range(n)]}], self.env)
        with open(self.path) as f:
            self.assertEqual(len(json.load(f)["items"]), 1)

    def test_not_a_list_is_refused_and_nothing_is_written(self):
        r = session([{"id": 1, "type": "sync-library", "items": "x"}], self.env)[1]
        self.assertFalse(r["ok"]); self.assertFalse(os.path.exists(self.path))

    def test_atomic_readers_never_see_a_partial_file(self):
        os.environ["ONECLICK_LIBRARY_FILE"] = self.path
        try:
            big = [{"url": "https://x/%d" % i, "description": "d" * 400} for i in range(4000)]
            library_mirror.sync(big[:10])
            stop, bad, reads = threading.Event(), [], [0]

            def reader():
                while not stop.is_set():
                    try:
                        with open(self.path) as f:
                            json.load(f)
                        reads[0] += 1
                    except ValueError as e:  # half-written JSON
                        bad.append(e)

            t = threading.Thread(target=reader); t.start()
            for _ in range(25):
                library_mirror.sync(big)
            stop.set(); t.join()
            self.assertEqual(bad, [])
            self.assertGreater(reads[0], 10)
        finally:
            os.environ.pop("ONECLICK_LIBRARY_FILE", None)

    def test_failed_write_keeps_the_old_file_and_cleans_up(self):
        os.environ["ONECLICK_LIBRARY_FILE"] = self.path
        try:
            library_mirror.sync([{"url": "https://x/1"}])
            os.chmod(os.path.dirname(self.path), 0o500)  # cannot create the temp file
            r = library_mirror.sync([{"url": "https://x/2"}, {"url": "https://x/3"}])
            os.chmod(os.path.dirname(self.path), 0o700)
            self.assertFalse(r["ok"])
            with open(self.path) as f:
                self.assertEqual(len(json.load(f)["items"]), 1)
        finally:
            os.environ.pop("ONECLICK_LIBRARY_FILE", None)


if __name__ == "__main__":
    unittest.main()
