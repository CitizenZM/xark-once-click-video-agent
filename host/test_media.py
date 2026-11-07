"""Ad libraries, cover images, Stories: the helper's engine argument lists and the direct-link allowlist.

Stubs print what real engine 2026.10 prints (extractor progress lines, then the --print JSON line with `filepath`; the Stories error text
is copied from a real run) so a stub cannot hide a mismatch with the real tool.
"""
import json, os, stat, struct, subprocess, sys, tempfile, unittest
os.environ.setdefault("ONECLICK_LOG", os.path.join(tempfile.gettempdir(), "oneclick-test.log"))  # never write tests into the real log
sys.path.insert(0, os.path.dirname(__file__))
import media  # noqa: E402

HOST = os.path.join(os.path.dirname(__file__), "oneclick_host.py")
FB = "https://www.facebook.com/ads/library/?id=1624078592578665"
CC = "https://ads.tiktok.com/business/creativecenter/topads/7691369945884049416"
CDN = "https://v16m-default.tiktokcdn.com/e9f4f19467/video/tos/alisg/tos-alisg-ve-0051c001-sg/oQnB/?a=0&mime_type=video_mp4&rc=ZjY5&l=2026110710281788681A"
STORY = "https://www.instagram.com/stories/natgeo/3000000000000000000"

# what engine prints for the fields we ask for (keys with no value are left out, like the real thing)
JSON_LINE = '{"id":"1624078592578665","title":"VIDEO by TJ Maxx","uploader":"TJ Maxx","extractor_key":"FacebookAds","webpage_url":"https://www.facebook.com/ads/library/?id=1624078592578665","thumbnail":"https://scontent-lax7-1.xx.fbcdn.net/v/t39.35426-6/825266615_n.jpg?_nc_cat=101","filepath":"%s"}'
# records every call as one block of lines ending in --CALL--; creates the .jpg only when engine would (both flags present)
STUB = r'''
{ printf '%s\n' "$@"; echo '--CALL--'; } >> "$(dirname "$0")/calls"
echo "[facebook:ads] Extracting URL: $2"
echo "[download] Destination: x.f1.mp4"
case "$*" in *"--write-thumbnail"*"--convert-thumbnails jpg"*) : > "$OUTFILE.jpg";; esac
: > "$OUTFILE.mp4"
echo '__JSON__'
'''


def stub(body):
    d = tempfile.mkdtemp()
    path = os.path.join(d, "engine")
    with open(path, "w") as f:
        f.write("#!/bin/bash\n" + body)
    os.chmod(path, os.stat(path).st_mode | stat.S_IEXEC)
    return path, d


def calls(d):
    p = os.path.join(d, "calls")
    if not os.path.exists(p):
        return []
    out, cur = [], []
    with open(p) as f:
        lines = f.read().splitlines()
    for line in lines:
        if line == "--CALL--":
            out.append(cur); cur = []
        else:
            cur.append(line)
    return out


def session(msg, env_extra):
    data = json.dumps(msg).encode()
    p = subprocess.run([sys.executable, HOST], input=struct.pack("<I", len(data)) + data, capture_output=True,
                       env={**os.environ, "ONECLICK_FFPROBE": "", **env_extra})
    n = struct.unpack("<I", p.stdout[:4])[0]
    return json.loads(p.stdout[4:4 + n])


def ok_stub():
    out = tempfile.mkdtemp()
    body = STUB.replace("$OUTFILE", out + "/ad").replace("__JSON__", JSON_LINE % (out + "/ad.mp4"))
    path, d = stub(body)
    return path, d, out


class Covers(unittest.TestCase):
    def run_ad(self, **extra):
        path, d, out = ok_stub()
        r = session({"id": 1, "url": FB, **extra}, {"ONECLICK_ENGINE": path, "ONECLICK_OUT": out})
        return r, calls(d)[0], out

    def test_no_cover_flags_unless_asked(self):
        r, args, out = self.run_ad()
        self.assertTrue(r["ok"], r)
        self.assertNotIn("--write-thumbnail", args); self.assertNotIn("--convert-thumbnails", args)
        self.assertFalse(os.path.exists(out + "/ad.jpg"))

    def test_cover_adds_thumbnail_flags_and_keeps_remote_thumbnail_url(self):
        r, args, out = self.run_ad(cover=True)
        self.assertTrue(r["ok"], r)
        i = args.index("--write-thumbnail")
        self.assertEqual(args[args.index("--convert-thumbnails") + 1], "jpg")
        self.assertTrue(os.path.exists(out + "/ad.jpg"))        # the stub only writes it when both flags are there
        self.assertTrue(r["meta"]["thumbnail"].startswith("https://scontent-lax7-1.xx.fbcdn.net/"))
        self.assertIn("thumbnail", args[args.index("--print") + 1])  # we ask engine for the field
        self.assertGreater(i, args.index("--no-playlist"))

    def test_cover_is_per_request_not_sticky(self):
        path, d, out = ok_stub()
        env = {"ONECLICK_ENGINE": path, "ONECLICK_OUT": out}
        session({"id": 1, "url": FB, "cover": True}, env); session({"id": 2, "url": FB}, env)
        a, b = calls(d)
        self.assertIn("--write-thumbnail", a); self.assertNotIn("--write-thumbnail", b)


class MetaAds(unittest.TestCase):
    def test_meta_ad_goes_to_engine_as_is_and_is_tagged_meta_ads(self):
        path, d, out = ok_stub()
        r = session({"id": 1, "url": FB}, {"ONECLICK_ENGINE": path, "ONECLICK_OUT": out})
        args = calls(d)[0]
        self.assertTrue(r["ok"], r)
        self.assertEqual((r["meta"]["source"], args[-1]), ("meta-ads", FB))
        self.assertNotIn("--use-extractors", args); self.assertNotIn("--cookies-from-browser", args)  # public ads: anonymous

    def test_organic_video_has_no_source(self):
        path, d, out = ok_stub()
        r = session({"id": 1, "url": "https://www.tiktok.com/@a/video/1"}, {"ONECLICK_ENGINE": path, "ONECLICK_OUT": out})
        self.assertTrue(r["ok"], r); self.assertNotIn("source", r["meta"])


class Direct(unittest.TestCase):
    GOOD = [CDN, "https://lf-creative-factory.tiktokcdn.com/obj/eden-sg/x/cue/agent/demo.mp4", "https://tiktokcdn.com/a.mp4"]
    BAD = [
        "https://evil.example/a.mp4",
        "https://tiktokcdn.com.evil.example/a.mp4",            # suffix trick
        "https://eviltiktokcdn.com/a.mp4",                     # no dot boundary
        "https://example.com/tiktokcdn.com/a.mp4",             # allowed name only in the path
        "https://v16m-default.tiktokcdn.com@evil.example/a.mp4",  # userinfo trick: the host is evil.example
        "https://user:pw@v16m-default.tiktokcdn.com/a.mp4",
        "http://v16m-default.tiktokcdn.com/a.mp4",             # not https
        "https://127.0.0.1/a.mp4", "https://192.168.1.5/a.mp4", "https://10.0.0.1/a.mp4", "https://169.254.169.254/a.mp4", "https://[::1]/a.mp4",
        "https://localhost/a.mp4",
        "https://v16m-default.tiktokcdn.com/page.html",        # not an mp4
        "file:///etc/passwd", "", None,
    ]

    def test_allowlist_unit(self):
        for d in self.GOOD:
            self.assertTrue(media.direct_ok(CC, d), d)
        for d in self.BAD:
            self.assertFalse(media.direct_ok(CC, d), d)
        for url in ("https://www.tiktok.com/@a/video/1", FB, "https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en"):
            self.assertFalse(media.direct_ok(url, CDN), url)   # only a Creative Center detail url may carry one

    def test_helper_downloads_cdn_mp4_with_generic_extractor_and_tags_tiktok_cc(self):
        out = tempfile.mkdtemp()
        # generic extractor output: id/title come from the signed URL, which is why the helper sets its own file name
        line = '{"id":"oQnB","title":"oQnB","extractor_key":"Generic","webpage_url":"%s","filepath":"%s"}' % (CDN, out + "/TikTok ad - 7691369945884049416.mp4")
        path, d = stub(STUB.replace("$OUTFILE", out + "/TikTok ad - 7691369945884049416").replace("__JSON__", line))
        r = session({"id": 1, "url": CC, "direct": CDN, "cover": True}, {"ONECLICK_ENGINE": path, "ONECLICK_OUT": out})
        args = calls(d)[0]
        self.assertTrue(r["ok"], r)
        self.assertEqual(args[-1], CDN)                              # the mp4 is fetched, never the detail page
        self.assertNotIn(CC, args)
        self.assertEqual(args[args.index("--use-extractors") + 1], "generic")
        self.assertEqual(args[args.index("-o", args.index("--use-extractors")) + 1], out + "/TikTok ad - 7691369945884049416.%(ext)s")
        self.assertEqual((r["meta"]["source"], r["meta"]["webpage_url"], r["meta"]["id"], r["meta"]["title"]), ("tiktok-cc", CC, "7691369945884049416", "TikTok ad 7691369945884049416"))
        self.assertNotIn("--cookies-from-browser", args)

    def test_helper_refuses_bad_direct_links_without_running_engine(self):
        path, d, out = ok_stub()
        env = {"ONECLICK_ENGINE": path, "ONECLICK_OUT": out}
        for bad in self.BAD[:-2]:                                    # "" and None mean "no direct"
            r = session({"id": 1, "url": CC, "direct": bad}, env)
            self.assertEqual((r["ok"], r["error"]), (False, "invalid direct url"), bad)
        r = session({"id": 2, "url": "https://www.tiktok.com/@a/video/1", "direct": CDN}, env)  # a CDN link on a non-Creative-Center url
        self.assertEqual(r["error"], "invalid direct url")
        self.assertEqual(calls(d), [])                               # engine was never started

    def test_creative_center_page_without_direct_asks_to_play_first(self):
        path, d, out = ok_stub()
        r = session({"id": 1, "url": CC}, {"ONECLICK_ENGINE": path, "ONECLICK_OUT": out})
        self.assertFalse(r["ok"]); self.assertIn("Play the ad", r["error"]); self.assertEqual(calls(d), [])


class Stories(unittest.TestCase):
    # engine 2026.10.26, logged-out: exit 1 and this text (no "login required" in it)
    UNREACHABLE = ("[instagram:story] Extracting URL: https://www.instagram.com/stories/natgeo/3000000000000000000/\n"
                   "[instagram:story] 3000000000000000000: Downloading webpage\n"
                   "ERROR: [instagram:story] 3000000000000000000: This content is unreachable. Use --cookies-from-browser or --cookies for the authentication. "
                   "See  https://github.com/engine/engine/wiki/FAQ#how-do-i-pass-cookies-to-engine  for how to manually pass cookies")

    def body(self, out, succeed):
        ok = "echo '{\"id\":\"3000000000000000000\",\"extractor_key\":\"InstagramStory\",\"uploader_id\":\"natgeo\",\"filepath\":\"%s/s.mp4\"}'" % out
        return ('{ printf \'%%s\\n\' "$@"; echo --CALL--; } >> "$(dirname "$0")/calls"\n'
                'case "$*" in *--cookies-from-browser*) %s;; *) cat <<\'EOT\'\n%s\nEOT\nexit 1;; esac\n' % (ok if succeed else "cat <<'EOT'\n" + self.UNREACHABLE + "\nEOT\nexit 1", self.UNREACHABLE))

    def test_story_retries_with_chrome_cookies_and_succeeds(self):
        out = tempfile.mkdtemp()
        path, d = stub(self.body(out, True))
        for url in (STORY + "/", "https://www.instagram.com/stories/highlights/17900000/"):
            r = session({"id": 1, "url": url}, {"ONECLICK_ENGINE": path, "ONECLICK_OUT": out})
            self.assertTrue(r["ok"], r)
        first, second = calls(d)[:2]
        self.assertNotIn("--cookies-from-browser", first)
        self.assertEqual(second[second.index("--cookies-from-browser") + 1], "chrome")
        self.assertEqual(second[-1], STORY + "/")

    def test_story_still_unreachable_after_cookies_gives_login_message(self):
        out = tempfile.mkdtemp()
        path, d = stub(self.body(out, False))
        r = session({"id": 1, "url": STORY}, {"ONECLICK_ENGINE": path, "ONECLICK_OUT": out})
        self.assertFalse(r["ok"]); self.assertIn("Login required", r["error"])
        self.assertEqual(len(calls(d)), 2)                           # anonymous try, then the cookie retry, and nothing more


if __name__ == "__main__":
    unittest.main()
