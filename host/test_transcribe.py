"""Transcription tests: the real host over the native-messaging protocol, with stub ffmpeg and whisper-cli.
The whisper stub writes <-of path>.json in the exact shape whisper.cpp writes (captured from a real run)."""
import glob, json, os, stat, struct, subprocess, sys, tempfile, unittest
os.environ.setdefault("ONECLICK_LOG", os.path.join(tempfile.gettempdir(), "oneclick-test.log"))

HOST = os.path.join(os.path.dirname(__file__), "oneclick_host.py")


def session(msgs, env_extra):
    data = b"".join(struct.pack("<I", len(b)) + b for b in (json.dumps(m).encode() for m in msgs))
    p = subprocess.run([sys.executable, HOST], input=data, capture_output=True, env={**os.environ, **env_extra})
    out, i = {}, 0
    while i < len(p.stdout):
        n = struct.unpack("<I", p.stdout[i:i + 4])[0]
        r = json.loads(p.stdout[i + 4:i + 4 + n]); out[r["id"]] = r; i += 4 + n
    return out


def script(d, name, body):
    path = os.path.join(d, name)
    with open(path, "w") as f:
        f.write("#!/bin/bash\n" + body)
    os.chmod(path, os.stat(path).st_mode | stat.S_IEXEC)
    return path


def real_json(segments):
    """Same structure whisper-cli -oj writes (tab indented, ' text' with a leading space, offsets in ms)."""
    ts = lambda ms: "%02d:%02d:%02d,%03d" % (ms // 3600000, ms // 60000 % 60, ms // 1000 % 60, ms % 1000)
    return json.dumps({"systeminfo": "WHISPER : ...", "model": {"type": "base", "multilingual": False},
                       "params": {"model": "m.bin", "language": "en", "translate": False}, "result": {"language": "en"},
                       "transcription": [{"timestamps": {"from": ts(a), "to": ts(b)}, "offsets": {"from": a, "to": b}, "text": " " + t}
                                         for a, b, t in segments]}, indent="\t")


class T(unittest.TestCase):
    def setUp(self):
        self.home = os.path.realpath(tempfile.mkdtemp())          # fake HOME so "inside home" is testable
        self.bin = tempfile.mkdtemp()
        self.clip = os.path.join(self.home, "clip.mp4")
        open(self.clip, "wb").write(b"not really a video")
        self.model = os.path.join(self.home, "model.bin"); open(self.model, "wb").write(b"m")
        # ffmpeg stub: records its args, writes a wav at the last argument, like the real `... -ac 1 out.wav`
        self.ffmpeg = script(self.bin, "ffmpeg", 'echo "$@" > "%s/ffargs"; for a; do last="$a"; done; echo RIFF > "$last"' % self.bin)

    def whisper(self, segments, extra=""):
        doc = os.path.join(self.bin, "doc.json"); open(doc, "w").write(real_json(segments))
        # parse args like the real CLI: -of <base> -> writes <base>.json; also records the wav it was given
        return script(self.bin, "whisper-cli",
                      'while [ $# -gt 0 ]; do case "$1" in -of) of="$2"; shift;; -f) f="$2"; shift;; -m) m="$2"; shift;; esac; shift; done\n'
                      'echo "$f" > "%s/wavpath"; echo "$m" > "%s/modelarg"; [ -f "$f" ] || exit 3\n%scp "%s" "$of.json"' % (self.bin, self.bin, extra, doc))

    def env(self, whisper, **kw):
        return {"HOME": self.home, "ONECLICK_WHISPER": whisper, "ONECLICK_FFMPEG": self.ffmpeg, "ONECLICK_WHISPER_MODEL": self.model, **kw}

    def run_one(self, env, file=None):
        return session([{"id": 1, "type": "transcribe", "file": file or self.clip}], env)[1]

    def test_hook_segments_and_seconds(self):
        w = self.whisper([(0, 2400, "Stop buying protein powder."), (2400, 5200, "Until you watch this."), (3100, 9000, "It will change your routine.")])
        r = self.run_one(self.env(w))
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["hook"], "Stop buying protein powder. Until you watch this.")  # only segments starting before 3.0 s
        self.assertEqual(r["segments"][0], {"start": 0.0, "end": 2.4, "text": "Stop buying protein powder."})
        self.assertEqual(r["segments"][2]["start"], 3.1)
        self.assertEqual(r["text"], "Stop buying protein powder. Until you watch this. It will change your routine.")
        self.assertIsInstance(r["seconds"], float)
        with open(os.path.join(self.bin, "ffargs")) as f:
            self.assertIn("-ar 16000 -ac 1", f.read())
        with open(os.path.join(self.bin, "modelarg")) as f:
            self.assertEqual(f.read().strip(), self.model)

    def test_missing_whisper_gives_setup_message(self):
        r = self.run_one(self.env(""))
        self.assertFalse(r["ok"]); self.assertIn("brew install whisper-cpp", r["error"]); self.assertIn("see README", r["error"])

    def test_missing_model_gives_setup_message(self):
        r = self.run_one(self.env(self.whisper([(0, 1000, "hi")]), ONECLICK_WHISPER_MODEL=os.path.join(self.home, "nope.bin")))
        self.assertFalse(r["ok"]); self.assertIn("not set up", r["error"])

    def test_empty_text_is_no_speech(self):
        r = self.run_one(self.env(self.whisper([(0, 3000, "   ")])))
        self.assertEqual((r["ok"], r["error"]), (False, "No speech found"))

    def test_file_outside_home_rejected_without_running_tools(self):
        outside = tempfile.mkdtemp(); f = os.path.join(outside, "v.mp4"); open(f, "wb").write(b"x")
        r = self.run_one(self.env(self.whisper([(0, 1000, "hi")])), file=f)
        self.assertFalse(r["ok"]); self.assertIn("inside your home folder", r["error"])
        self.assertFalse(os.path.exists(os.path.join(self.bin, "ffargs")))  # ffmpeg never ran

    def test_temp_wav_removed_on_success_and_failure(self):
        for extra, ok in (("", True), ("exit 1\n", False)):
            tmp = tempfile.mkdtemp()
            r = self.run_one(self.env(self.whisper([(0, 1000, "hi")], extra=extra), TMPDIR=tmp))
            self.assertEqual(r["ok"], ok, r)
            with open(os.path.join(self.bin, "wavpath")) as f:
                self.assertTrue(f.read().strip().startswith(tmp))   # the wav really lived under our TMPDIR...
            self.assertEqual(os.listdir(tmp), [])                    # ...and is gone now

    def test_timeout(self):
        r = self.run_one(self.env(self.whisper([(0, 1000, "hi")], extra="sleep 5\n"), ONECLICK_TRANSCRIBE_TIMEOUT="1"))
        self.assertEqual((r["ok"], r["error"]), (False, "Transcription timed out"))

    def test_ping_reports_whisper(self):
        engine = script(self.bin, "engine", "echo 1.0")
        on = session([{"id": 1, "type": "ping"}], {**self.env(self.whisper([(0, 1, "x")])), "ONECLICK_ENGINE": engine})[1]
        off = session([{"id": 1, "type": "ping"}], {**self.env(""), "ONECLICK_ENGINE": engine})[1]
        self.assertIs(on["whisper"], True); self.assertIs(off["whisper"], False)


if __name__ == "__main__":
    unittest.main()
