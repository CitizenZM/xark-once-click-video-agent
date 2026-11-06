# RUN-REPORT — one-click-downloader-20261106
- 2026-11-06 13:20 `python3 host/test_host.py` → 4 tests OK (stub engine, protocol + retry + url validation)
- 2026-11-06 13:20 live host call, YouTube test video → ok, h264+aac mp4 in ~/Downloads/OneClick (engine 2026.10.26)
- engine 2026.02.04 gave HTTP 403; fixed by `pipx upgrade engine`. Re-run that monthly: sites break old versions.
- Not verified: Chrome load-unpacked click-through, TikTok/Instagram URLs (need user's Chrome / real post URL).
- Assumptions: output ~/Downloads/OneClick; Instagram retries with --cookies-from-browser chrome; extension ID pinned via manifest key.

## v2.0.0 (2026-11-06 13:50)
- `python3 host/test_host.py` → 6 OK (meta, friendly errors, IG cookie retry, URL validation, 6-job batch, ping)
- `node --test test/extension.test.mjs` → 4 pass (urls, analyze, recommend, background wiring one-click + batch via mocked chrome/host port)
- live host call (Chrome-style launch via registered manifest, minimal env): pong engine 2026.10.26; YouTube test video returned full metadata
- dashboard rendered in in-app browser with stubbed chrome API: 10 cards, 0 console errors, Helper-ready card, KPIs, headlines OK
- Not verified: extension loaded in real Chrome after reload; real TikTok/IG downloads; Windows; Web Store submission
- Assumptions: output ~/Downloads/OneClick; batch cap 50; recommendations derive only from the user's library + 4 fixed public ad libraries (no invented accounts)
