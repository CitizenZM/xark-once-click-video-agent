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

    def test_progress_events_stream_before_final_reply(self):
        path, d = stub('printf "[PCT]  10.0%%\n[PCT]  55.5%%\n[PCT] 100%%\n"; echo \'{"filepath":"/x/v.mp4"}\'')
        data = json.dumps({"id": 3, "url": "https://www.tiktok.com/@a/video/3"}).encode()
        p = subprocess.run([sys.executable, HOST], input=struct.pack("<I", len(data)) + data, capture_output=True,
                           env={**os.environ, "ONECLICK_ENGINE": path, "ONECLICK_OUT": d})
        msgs, i = [], 0
        while i < len(p.stdout):
            n = struct.unpack("<I", p.stdout[i:i + 4])[0]; msgs.append(json.loads(p.stdout[i + 4:i + 4 + n])); i += 4 + n
        self.assertEqual([m.get("pct") for m in msgs if m.get("type") == "progress"], [10, 55, 100])
        self.assertTrue(msgs[-1]["ok"] and msgs[-1]["id"] == 3)

    def test_folder_inside_home_ok_outside_rejected_and_naming_applied(self):
        path, d = stub('echo "$@" > "$(dirname "$0")/args"; echo \'{"filepath":"/x/v.mp4"}\'')
        home = tempfile.mkdtemp()
        env = {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d, "HOME": home}
        ok = session([{"id": 1, "url": "https://www.tiktok.com/@a/video/1", "folder": home + "/vids", "naming": "creator-id"}], env)[1]
        self.assertTrue(ok["ok"])
        with open(os.path.join(d, "args")) as f:
            args = f.read()
        self.assertIn(os.path.realpath(home) + "/vids/%(uploader_id,uploader|site)s - %(id)s.%(ext)s", args)
        bad = session([{"id": 2, "url": "https://www.tiktok.com/@a/video/2", "folder": "/etc"}], env)[2]
        self.assertFalse(bad["ok"]); self.assertIn("inside your home folder", bad["error"])

    def test_transient_error_is_retried_permanent_is_not(self):
        flaky, d = stub('f="$(dirname "$0")/n"; n=$(cat "$f" 2>/dev/null || echo 0); echo $((n+1)) > "$f"; '
                        '[ "$n" -lt 2 ] && { echo "ERROR: timed out" >&2; exit 1; }; echo \'{"filepath":"/x/v.mp4"}\'')
        env = {"ONECLICK_ENGINE": flaky, "ONECLICK_OUT": d, "ONECLICK_RETRY_SEC": "0"}
        self.assertTrue(session([{"id": 1, "url": "https://www.tiktok.com/@a/video/1"}], env)[1]["ok"])
        self.assertEqual(open(os.path.join(d, "n")).read().strip(), "3")  # failed twice, third try succeeded
        perm, d2 = stub('f="$(dirname "$0")/n"; n=$(cat "$f" 2>/dev/null || echo 0); echo $((n+1)) > "$f"; echo "ERROR: Private video" >&2; exit 1')
        r = session([{"id": 2, "url": "https://www.tiktok.com/@a/video/2"}], {**env, "ONECLICK_ENGINE": perm, "ONECLICK_OUT": d2})[2]
        self.assertFalse(r["ok"]); self.assertEqual(open(os.path.join(d2, "n")).read().strip(), "1")  # no retry

    def test_expand_lists_urls_and_clamps_limit(self):
        path, d = stub('echo "$@" > "$(dirname "$0")/args"; printf "https://www.tiktok.com/@a/video/1\\nnot-a-url\\nhttps://www.tiktok.com/@a/video/2\\n"')
        r = session([{"id": 4, "type": "expand", "url": "https://www.tiktok.com/@a", "limit": 500}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})[4]
        self.assertEqual(r["urls"], ["https://www.tiktok.com/@a/video/1", "https://www.tiktok.com/@a/video/2"])
        with open(os.path.join(d, "args")) as f:
            self.assertIn("--playlist-end 100", f.read())
        bad = session([{"id": 5, "type": "expand", "url": "javascript:alert(1)"}], {})[5]
        self.assertFalse(bad["ok"])

    def test_private_targets_and_lookalike_cookie_hosts_are_refused(self):
        path, d = stub('echo "$@" >> "$(dirname "$0")/args"; echo "ERROR: login required" >&2; exit 1')
        env = {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d}
        for u in ("http://127.0.0.1:8080/x", "http://169.254.169.254/latest", "http://localhost/x", "http://192.168.1.5/x", "http://[::1]/x"):
            self.assertEqual(session([{"id": 1, "url": u}], env)[1]["error"], "invalid url", u)
            self.assertFalse(session([{"id": 2, "type": "expand", "url": u}], env)[2]["ok"], u)
        self.assertFalse(os.path.exists(os.path.join(d, "args")))  # engine never ran
        session([{"id": 3, "url": "https://notinstagram.com/p/x"}], env)   # lookalike host: no cookie retry
        with open(os.path.join(d, "args")) as f:
            self.assertNotIn("cookies-from-browser", f.read())

    def test_expand_drops_private_urls_and_bad_limit_does_not_hang(self):
        path, d = stub('printf "https://www.tiktok.com/@a/video/1\\nhttp://127.0.0.1/x\\n"')
        r = session([{"id": 6, "type": "expand", "url": "https://www.tiktok.com/@a", "limit": "abc"}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})[6]
        self.assertEqual(r["urls"], ["https://www.tiktok.com/@a/video/1"])

    def test_percent_in_folder_is_escaped_and_log_is_private_and_redacted(self):
        path, d = stub('echo "$@" > "$(dirname "$0")/args"; echo \'{"filepath":"/x/v.mp4"}\'')
        home = tempfile.mkdtemp(); logf = os.path.join(home, "h.log")
        env = {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d, "HOME": home, "ONECLICK_LOG": logf}
        session([{"id": 1, "url": "https://www.tiktok.com/@a/video/1?token=SECRET", "folder": home + "/50%off"}], env)
        with open(os.path.join(d, "args")) as f:
            self.assertIn("50%%off", f.read())
        text = open(logf).read()
        self.assertNotIn("SECRET", text); self.assertEqual(oct(os.stat(logf).st_mode & 0o777), "0o600")

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
