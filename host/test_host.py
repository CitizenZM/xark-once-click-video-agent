"""Wiring tests: drive the real host over the native-messaging protocol with a stub engine."""
import json, os, stat, struct, subprocess, sys, tempfile, unittest

HOST = os.path.join(os.path.dirname(__file__), "oneclick_host.py")


def call(url, env_extra):
    msg = json.dumps({"url": url}).encode()
    p = subprocess.run([sys.executable, HOST], input=struct.pack("<I", len(msg)) + msg,
                       capture_output=True, env={**os.environ, **env_extra})
    n = struct.unpack("<I", p.stdout[:4])[0]
    return json.loads(p.stdout[4:4 + n])


class T(unittest.TestCase):
    def stub(self, body):
        d = tempfile.mkdtemp()
        path = os.path.join(d, "engine")
        open(path, "w").write("#!/bin/bash\n" + body)
        os.chmod(path, os.stat(path).st_mode | stat.S_IEXEC)
        return path, d

    def test_success_returns_file_and_passes_url(self):
        path, d = self.stub('echo "$@" > "$(dirname "$0")/args"; echo /x/video.mp4')
        r = call("https://www.tiktok.com/@a/video/1", {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})
        self.assertEqual(r, {"ok": True, "file": "/x/video.mp4"})
        self.assertIn("https://www.tiktok.com/@a/video/1", open(os.path.join(d, "args")).read())

    def test_failure_surfaces_last_stderr_line(self):
        path, d = self.stub('echo "ERROR: Unsupported URL" >&2; exit 1')
        r = call("https://example.com/x", {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})
        self.assertFalse(r["ok"]); self.assertIn("Unsupported URL", r["error"])

    def test_instagram_retries_with_cookies(self):
        path, d = self.stub('case "$*" in *cookies-from-browser*) echo /x/ig.mp4;; *) echo "ERROR: login" >&2; exit 1;; esac')
        r = call("https://www.instagram.com/reel/abc/", {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})
        self.assertEqual(r, {"ok": True, "file": "/x/ig.mp4"})

    def test_rejects_non_http(self):
        r = call("file:///etc/passwd", {})
        self.assertEqual(r, {"ok": False, "error": "invalid url"})


if __name__ == "__main__":
    unittest.main()
