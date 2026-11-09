"""Wiring tests for comments, YouTube search and the Ad Studio bridge, through the real host process."""
import json, os, tempfile, threading, unittest, uuid
from http.server import BaseHTTPRequestHandler, HTTPServer

from test_host import session, stub


class FakeStudio(BaseHTTPRequestHandler):
    seen = []

    def log_message(self, *a):
        pass

    def _send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(b))); self.end_headers(); self.wfile.write(b)

    def do_GET(self):
        self._send(200, [{"id": "a"}, {"id": "b"}] if self.path == "/api/library" else {})

    def do_POST(self):
        body = self.rfile.read(int(self.headers["content-length"]))
        FakeStudio.seen.append((self.path, self.headers["content-type"], body))
        if self.path == "/api/jobs":
            return self._send(200, {"id": "20261108-abcde", "ids": ["20261108-abcde"]})
        if self.path == "/api/library/import":
            return self._send(200, {"ok": True, "clips": [{"id": "im_1_0", "dur": 2.5, "role": "hook", "desc": "x"}]})
        self._send(404, {"error": "no"})


class R(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = HTTPServer(("127.0.0.1", 0), FakeStudio)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = "http://127.0.0.1:%d" % cls.srv.server_port
        cls.video = os.path.expanduser("~/.cache/oneclick-test-%s.mp4" % uuid.uuid4().hex[:8])
        os.makedirs(os.path.dirname(cls.video), exist_ok=True)
        with open(cls.video, "wb") as f:
            f.write(b"FAKEVIDEO" * 100)

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown(); os.remove(cls.video)

    def test_comments_keep_top_level_sorted_by_likes(self):
        meta = {"comment_count": 9, "comments": [
            {"text": "how long does it last?", "like_count": 3, "parent": "root"},
            {"text": "a reply", "like_count": 99, "parent": "abc"},
            {"text": "  too   expensive ", "like_count": 40, "parent": "root"},
            {"text": "", "like_count": 1, "parent": "root"}]}
        path, d = stub("echo \"$@\" > \"$(dirname \"$0\")/args\"; echo '%s'" % json.dumps(meta))
        r = session([{"id": 1, "type": "comments", "url": "https://www.youtube.com/watch?v=abc"}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})[1]
        self.assertTrue(r["ok"])
        self.assertEqual(r["comments"], [{"text": "too expensive", "likes": 40}, {"text": "how long does it last?", "likes": 3}])
        with open(os.path.join(d, "args")) as f:
            self.assertIn("--write-comments", f.read())
        bad = session([{"id": 2, "type": "comments", "url": "http://127.0.0.1/x"}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})[2]
        self.assertFalse(bad["ok"])

    def test_youtube_search_groups_by_account_link(self):
        lines = [json.dumps({"url": "https://www.youtube.com/watch?v=1", "title": "t", "view_count": 500, "channel": "Rich", "uploader_id": "@rich"}),
                 json.dumps({"url": "https://www.youtube.com/watch?v=2", "view_count": 9, "channel_id": "UCiXnYhmzpTfWJ-V5HZuY49Q"}),
                 json.dumps({"url": "http://10.0.0.1/x"}), "junk"]
        path, d = stub('echo "$@" > "$(dirname "$0")/args"; cat <<\'EOF\'\n' + "\n".join(lines) + "\nEOF")
        r = session([{"id": 1, "type": "search", "query": "air fryer liner", "limit": 20}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})[1]
        self.assertTrue(r["ok"])
        self.assertEqual([(x["url"], x["account"]) for x in r["items"]], [("https://www.youtube.com/watch?v=1", "https://www.youtube.com/@rich"),
                                                                          ("https://www.youtube.com/watch?v=2", "https://www.youtube.com/channel/UCiXnYhmzpTfWJ-V5HZuY49Q")])
        with open(os.path.join(d, "args")) as f:
            self.assertIn("search_query=air+fryer+liner", f.read())
        self.assertFalse(session([{"id": 2, "type": "search", "query": "  "}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})[2]["ok"])

    def test_adstudio_job_uploads_the_local_video(self):
        FakeStudio.seen.clear()
        r = session([{"id": 1, "type": "adstudio", "action": "job", "base": self.base, "file": self.video, "refUrl": "https://www.tiktok.com/@a/video/1",
                      "productUrl": "https://shop.example.com/p/liner", "notes": "Remix: hook from @a", "engine": "remix"}], {})[1]
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["url"], self.base + "/jobs/20261108-abcde")
        self.assertEqual(r["jobId"], "20261108-abcde")  # "id" is the message id the host adds
        path, ctype, body = FakeStudio.seen[-1]
        self.assertEqual(path, "/api/jobs")
        self.assertIn("multipart/form-data", ctype)
        self.assertIn(b"FAKEVIDEO", body)
        self.assertIn(b"https://shop.example.com/p/liner", body)
        self.assertIn(b'name="engine"\r\n\r\nremix', body)
        self.assertNotIn(b'name="refUrl"', body)  # the uploaded file is the reference

    def test_adstudio_clips_need_rights_and_go_to_the_import_route(self):
        FakeStudio.seen.clear()
        msg = {"id": 1, "type": "adstudio", "action": "clips", "base": self.base, "file": self.video, "clips": [{"start": 0, "end": 2.5, "role": "hook", "text": "Stop"}],
               "source": {"url": "https://www.tiktok.com/@a/video/1", "creator": "a"}, "project": "Air fryer"}
        self.assertFalse(session([msg], {})[1]["ok"])
        self.assertEqual(FakeStudio.seen, [])
        r = session([{**msg, "rights": "own"}], {})[1]
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["clips"], [{"id": "im_1_0", "dur": 2.5, "role": "hook"}])
        path, _, body = FakeStudio.seen[-1]
        self.assertEqual(path, "/api/library/import")
        self.assertIn(b'"start": 0', body)
        self.assertIn(b'name="rights"\r\n\r\nown', body)

    def test_adstudio_refuses_remote_addresses_and_files_outside_home(self):
        for base in ("https://evil.example.com", "http://10.0.0.5:5310", "http://localhost.evil.com"):
            r = session([{"id": 1, "type": "adstudio", "action": "ping", "base": base}], {})[1]
            self.assertFalse(r["ok"]); self.assertIn("localhost", r["error"])
        outside = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False, dir="/tmp")
        outside.close()
        r = session([{"id": 2, "type": "adstudio", "action": "job", "base": self.base, "file": outside.name, "productUrl": "https://x.com/p"}], {})[2]
        os.remove(outside.name)
        self.assertFalse(r["ok"])
        self.assertTrue(session([{"id": 3, "type": "adstudio", "action": "ping", "base": self.base}], {})[3]["ok"])


if __name__ == "__main__":
    unittest.main()
