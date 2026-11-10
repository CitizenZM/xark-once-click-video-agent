"""Wiring tests: drive the real host over the native-messaging protocol with a stub the engine."""
import json, os, stat, struct, subprocess, sys, tempfile, unittest
os.environ.setdefault("ONECLICK_LOG", os.path.join(tempfile.gettempdir(), "oneclick-test.log"))  # never write tests into the real log

HOST = os.path.join(os.path.dirname(__file__), "oneclick_host.py")


def session(msgs, env_extra):
    """Send all msgs, close stdin, return {id: reply}."""
    data = b"".join(struct.pack("<I", len(b)) + b for b in (json.dumps(m).encode() for m in msgs))
    p = subprocess.run([sys.executable, HOST], input=data, capture_output=True, env={**os.environ, "ONECLICK_FFPROBE": "", **env_extra})  # no real ffprobe unless a test supplies a stub
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

    def test_expand_with_stats_returns_numbers_and_drops_junk(self):
        lines = ['{"url": "https://www.tiktok.com/@a/video/1", "title": "t", "view_count": 900, "like_count": 9, "duration": 12, "timestamp": 1790000000}',
                 '{"url": "http://127.0.0.1/x", "view_count": 1}', 'not json', '{"url": "https://www.tiktok.com/@a/video/2", "view_count": -5, "like_count": true, "title": null}']
        path, d = stub('echo "$@" > "$(dirname "$0")/args"; cat <<\'EOF\'\n' + "\n".join(lines) + '\nEOF')
        r = session([{"id": 7, "type": "expand", "url": "https://www.tiktok.com/@a", "limit": 30, "stats": True}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})[7]
        self.assertTrue(r["ok"])
        self.assertEqual(r["items"], [{"url": "https://www.tiktok.com/@a/video/1", "title": "t", "view_count": 900, "like_count": 9, "duration": 12, "timestamp": 1790000000},
                                      {"url": "https://www.tiktok.com/@a/video/2", "title": "", "view_count": None, "like_count": None, "duration": None, "timestamp": None}])
        with open(os.path.join(d, "args")) as f:
            self.assertIn("%(.{url,title,view_count,like_count,duration,timestamp})j", f.read())
        plain = session([{"id": 8, "type": "expand", "url": "https://www.tiktok.com/@a", "stats": "yes"}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})[8]
        self.assertNotIn("items", plain)  # only a real true turns stats on

    def test_private_targets_and_lookalike_cookie_hosts_are_refused(self):
        path, d = stub('echo "$@" >> "$(dirname "$0")/args"; echo "ERROR: login required" >&2; exit 1')
        env = {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d}
        for u in ("http://127.0.0.1:8080/x", "http://169.254.169.254/latest", "http://localhost/x", "http://192.168.1.5/x", "http://[::1]/x"):
            self.assertEqual(session([{"id": 1, "url": u}], env)[1]["error"], "invalid url", u)
            self.assertFalse(session([{"id": 2, "type": "expand", "url": u}], env)[2]["ok"], u)
        self.assertFalse(os.path.exists(os.path.join(d, "args")))  # the engine never ran
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

    def test_tiktok_numeric_uploader_id_is_replaced_by_handle_in_meta_and_filename(self):
        path, d = stub('touch "$(dirname "$0")/107955 - 77.mp4"; echo \'{"extractor_key":"TikTok","uploader":"tiktok","uploader_id":"107955","filepath":"\'"$(dirname "$0")"\'/107955 - 77.mp4"}\'')
        r = session([{"id": 1, "url": "https://www.tiktok.com/@tiktok/video/77"}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})[1]
        self.assertEqual(r["meta"]["uploader_id"], "tiktok")
        self.assertTrue(r["meta"]["file"].endswith("/tiktok - 77.mp4") and os.path.exists(r["meta"]["file"]))
        self.assertFalse(os.path.exists(os.path.join(d, "107955 - 77.mp4")))

    def test_tiktok_rename_also_renames_the_cover_beside_the_video(self):
        path, d = stub('touch "$(dirname "$0")/107955 - 77.mp4" "$(dirname "$0")/107955 - 77.jpg"; echo \'{"extractor_key":"TikTok","uploader":"tiktok","uploader_id":"107955","filepath":"\'"$(dirname "$0")"\'/107955 - 77.mp4"}\'')
        session([{"id": 1, "url": "https://www.tiktok.com/@tiktok/video/77", "cover": True}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})
        self.assertTrue(os.path.exists(os.path.join(d, "tiktok - 77.jpg")))
        self.assertFalse(os.path.exists(os.path.join(d, "107955 - 77.jpg")))

    def test_ping(self):
        path, d = stub('[ "$1" = "--version" ] && echo 9.9.9')
        r = session([{"id": 7, "type": "ping"}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})[7]
        self.assertEqual((r["type"], r["engine"], r["outDir"]), ("pong", "9.9.9", d))



def make_video(body_after, probe_json=None):
    """Stub the engine that writes a 20 KB file and reports it; optional stub ffprobe printing probe_json."""
    path, d = stub('echo "$@" > "$(dirname "$0")/args"; f="$(dirname "$0")/v.mp4"; head -c 20000 /dev/zero > "$f"; '
                   'echo \'{"id":"1","filepath":"\'"$f"\'"}\'' + body_after)
    probe = None
    if probe_json is not None:
        probe = os.path.join(d, "ffprobe")
        with open(probe, "w") as f:
            f.write("#!/bin/bash\necho '%s'\n" % probe_json)
        os.chmod(probe, 0o755)
    return path, d, probe


URL = "https://www.tiktok.com/@a/video/1"


class Reliability(unittest.TestCase):
    def test_max_seconds_adds_match_filter_and_skip_is_reported_as_too_long(self):
        path, d = stub('echo "$@" > "$(dirname "$0")/args"; true  # real the engine is quiet here because of --print: no output at all ')
        r = session([{"id": 1, "url": URL, "maxSeconds": 180}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})[1]
        self.assertEqual((r["ok"], r.get("skipped")), (False, "too long"))
        self.assertIn("--match-filter duration <=? 180", open(os.path.join(d, "args")).read())
        # without the setting the flag is absent
        r2 = session([{"id": 2, "url": URL}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})[2]
        self.assertNotIn("--match-filter", open(os.path.join(d, "args")).read())
        self.assertNotIn("skipped", r2)
        # no metadata and no length limit: nothing was saved, so it must not count as a success
        self.assertEqual((r2["ok"], r2.get("error")), (False, "The engine finished without saving a file"))

    def test_ffprobe_without_video_stream_is_incomplete(self):
        path, d, probe = make_video("", '{"streams":[{"codec_type":"audio"}],"format":{"duration":"5.0"}}')
        r = session([{"id": 1, "url": URL}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d, "ONECLICK_FFPROBE": probe})[1]
        self.assertEqual((r["ok"], r["error"]), (False, "File is incomplete (failed check)"))

    def test_ffprobe_good_file_is_verified_and_audio_only_needs_audio(self):
        good = '{"streams":[{"codec_type":"video"},{"codec_type":"audio"}],"format":{"duration":"5.0"}}'
        path, d, probe = make_video("", good)
        r = session([{"id": 1, "url": URL}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d, "ONECLICK_FFPROBE": probe})[1]
        self.assertTrue(r["ok"]); self.assertIs(r["verified"], True)
        path, d, probe = make_video("", '{"streams":[{"codec_type":"video"}],"format":{"duration":"5.0"}}')
        r = session([{"id": 2, "url": URL, "quality": "audio"}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d, "ONECLICK_FFPROBE": probe})[2]
        self.assertFalse(r["ok"])  # audio-only wants an audio stream
        path, d, probe = make_video("", '{"streams":[{"codec_type":"video"}],"format":{"duration":"0"}}')
        r = session([{"id": 3, "url": URL}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d, "ONECLICK_FFPROBE": probe})[3]
        self.assertFalse(r["ok"])  # zero duration

    def test_tiny_file_is_incomplete(self):
        path, d, probe = make_video("", '{"streams":[{"codec_type":"video"}],"format":{"duration":"5.0"}}')
        path2, d2 = stub('f="$(dirname "$0")/v.mp4"; echo tiny > "$f"; echo \'{"filepath":"\'"$f"\'"}\'')
        r = session([{"id": 1, "url": URL}], {"ONECLICK_ENGINE": path2, "ONECLICK_OUT": d2, "ONECLICK_FFPROBE": probe})[1]
        self.assertEqual(r["error"], "File is incomplete (failed check)")

    def test_missing_ffprobe_skips_check_and_reports_unverified(self):
        path, d, _ = make_video("")
        r = session([{"id": 1, "url": URL}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d, "ONECLICK_FFPROBE": ""})[1]
        self.assertTrue(r["ok"]); self.assertIs(r["verified"], False)

    def test_http_429_is_retryable_with_friendly_text(self):
        for text in ("ERROR: unable to download: HTTP Error 429: Too Many Requests", "ERROR: rate limit reached, slow down"):
            path, d = stub('echo "%s" >&2; exit 1' % text)
            r = session([{"id": 1, "url": URL}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})[1]
            self.assertEqual((r["ok"], r.get("retryable")), (False, True), text)
            self.assertIn("rate-limiting", r["error"])
        path, d = stub('echo "ERROR: Private video" >&2; exit 1')
        r = session([{"id": 2, "url": URL}], {"ONECLICK_ENGINE": path, "ONECLICK_OUT": d})[2]
        self.assertNotIn("retryable", r)


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
