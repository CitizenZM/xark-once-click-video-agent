"""Wiring tests: drive the real host over the native-messaging protocol with a stub engine."""
import json, os, stat, struct, subprocess, sys, tempfile, unittest

HOST = os.path.join(os.path.dirname(__file__), "oneclick_host.py")


def session(msgs, env_extra):
    """Send all msgs, close stdin, return {id: reply}."""
    data = b"".join(struct.pack("<I", len(b)) + b for b in (json.dumps(m).encode() for m in msgs))
    p = subprocess.run([sys.executable, HOST], input=data, capture_output=True, env={**os.environ, **env_extra})
    out, i = {}, 0
    while i < len(p.stdout):
        n = struct.unpack("<I", p.stdout[i:i + 4])[0]
        r = json.loads(p.stdout[i + 4:i + 4 + n]); out[r["id"]] = r; i += 4 + n
    return out


def stub(body):
    d = tempfile.mkdtemp()
    path = os.path.join(d, "engine")
    with open(path, "w") as f:
        f.write("#!/bin/bash\n" + body)
    os.chmod(path, os.stat(path).st_mode | stat.S_IEXEC)
    return path, d


class T(unittest.TestCase):
    def test_download_returns_meta_and_passes_url_and_quality(self):
        path, d = stub('echo "$@" > "$(dirname "$0")/args"; echo \'{"id":"1","uploader":"a","filepath":"/x/v.mp4"}\'')
        r = session([{"id": 1, "url": "https://www.tiktok.com/@a/video/1", "quality": "audio"}],
                    {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})[1]
        self.assertTrue(r["ok"]); self.assertEqual(r["meta"]["file"], "/x/v.mp4"); self.assertEqual(r["meta"]["uploader"], "a")
        with open(os.path.join(d, "args")) as f:
            args = f.read()
        self.assertIn("https://www.tiktok.com/@a/video/1", args); self.assertIn("--audio-format", args)

    def test_failure_maps_to_friendly_error(self):
        path, d = stub('echo "ERROR: Unsupported URL: x" >&2; exit 1')
        r = session([{"id": 1, "url": "https://example.com/x"}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})[1]
        self.assertFalse(r["ok"]); self.assertIn("No downloadable video", r["error"])

    def test_instagram_retries_with_cookies(self):
        path, d = stub('case "$*" in *cookies-from-browser*) echo \'{"filepath":"/x/ig.mp4"}\';; *) echo "ERROR: login required" >&2; exit 1;; esac')
        r = session([{"id": 1, "url": "https://www.instagram.com/reel/abc/"}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})[1]
        self.assertTrue(r["ok"]); self.assertEqual(r["meta"]["file"], "/x/ig.mp4")

    def test_rejects_non_http(self):
        r = session([{"id": 1, "url": "file:///etc/passwd"}], {})[1]
        self.assertEqual((r["ok"], r["error"]), (False, "invalid url"))

    def test_batch_all_ids_answered(self):
        path, d = stub('echo \'{"filepath":"/x/v.mp4"}\'')
        res = session([{"id": i, "url": "https://www.tiktok.com/@a/video/%d" % i} for i in range(1, 7)],
                      {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})
        self.assertEqual(sorted(res), [1, 2, 3, 4, 5, 6]); self.assertTrue(all(r["ok"] for r in res.values()))

    def test_ping(self):
        path, d = stub('[ "$1" = "--version" ] && echo 9.9.9')
        r = session([{"id": 7, "type": "ping"}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})[7]
        self.assertEqual((r["type"], r["engine"], r["outDir"]), ("pong", "9.9.9", d))



class Dev(unittest.TestCase):
    def test_hello_reports_dev_flag_and_dev_mode_pushes_reload_on_change(self):
        import time
        d = tempfile.mkdtemp(); ext = os.path.join(d, "ext"); os.makedirs(ext)
        open(os.path.join(ext, "a.js"), "w").write("1")
        env = {**os.environ, "ONECLICK_DEV_FILE": os.path.join(d, "dev"), "ONECLICK_EXT_DIR": ext, "ONECLICK_WATCH_SEC": "0.1"}
        # no dev file: hello says dev=false
        self.assertFalse(session([{"id": 1, "type": "hello", "version": "1"}], env)[1]["dev"])
        open(env["ONECLICK_DEV_FILE"], "w").close()
        p = subprocess.Popen([sys.executable, HOST], stdin=subprocess.PIPE, stdout=subprocess.PIPE, env=env)
        b = json.dumps({"id": 2, "type": "hello", "version": "1"}).encode()
        p.stdin.write(struct.pack("<I", len(b)) + b); p.stdin.flush()
        rd = lambda: json.loads(p.stdout.read(struct.unpack("<I", p.stdout.read(4))[0]))
        self.assertTrue(rd()["dev"])
        time.sleep(0.3); os.utime(os.path.join(ext, "a.js"), (time.time() + 5, time.time() + 5))
        self.assertEqual(rd()["type"], "reload")
        p.stdin.close(); p.wait(timeout=5)


if __name__ == "__main__":
    unittest.main()
