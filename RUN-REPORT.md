# RUN-REPORT — one-click-downloader-20261106
- 2026-11-06 13:20 `python3 host/test_host.py` → 4 tests OK (stub engine, protocol + retry + url validation)
- 2026-11-06 13:20 live host call, YouTube test video → ok, h264+aac mp4 in ~/Downloads/OneClick (engine 2026.10.26)
- engine 2026.02.04 gave HTTP 403; fixed by `pipx upgrade engine`. Re-run that monthly: sites break old versions.
- Not verified: Chrome load-unpacked click-through, TikTok/Instagram URLs (need user's Chrome / real post URL).
- Assumptions: output ~/Downloads/OneClick; Instagram retries with --cookies-from-browser chrome; extension ID pinned via manifest key.
