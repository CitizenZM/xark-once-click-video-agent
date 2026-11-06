# One-Click Video Downloader

Chrome extension that saves the video on the page (TikTok, Instagram, YouTube, X and 1000+ sites) with one click, downloads a whole page or a profile's latest videos, and turns what you save into a small research dashboard.

It runs [engine](https://github.com/engine/engine) on your own computer through a tiny local helper. Nothing is uploaded anywhere.

## Install (2 steps)
1. **Helper** (installs engine + ffmpeg if missing, registers the helper)
   - macOS / Linux:
     ```bash
     curl -fsSL https://raw.githubusercontent.com/CitizenZM/one-click-downloader-20261106/main/install.sh | bash
     ```
     From a clone: `bash install.sh`. Pin a release with `ONECLICK_REF=<tag>`.
   - Windows (experimental, untested): `irm https://raw.githubusercontent.com/CitizenZM/one-click-downloader-20261106/main/install.ps1 | iex`
2. **Extension**: `chrome://extensions` → Developer mode → Load unpacked → pick the `extension/` folder.

Open the dashboard (right-click the toolbar icon → "Open library & insights"). It should say **Helper ready**.

## Use
- **One click**: toolbar icon or `Alt+Shift+D` on a video page.
- **Pick videos on a page**: right-click the page or the icon → "Select videos on this page…", tick the ones you want (or Select all), press Download.
- **Whole page**: right-click the icon or the page → "Download all videos on this page" (up to 50; already-saved videos are skipped).
- **Latest from a profile**: dashboard → paste a profile, channel or hashtag link → download the newest 10/25/50/100.
- **Paste links**: dashboard → Download.
- **In-page button** (optional): Settings → turn on; asks for site access only then. Reload open tabs afterwards.
- **Library**: search, filter, sort, notes with #tags, export CSV/JSON. **Insights**: platform split, length, creators, hashtags, outliers that beat their baseline, like rate by platform, and creators/hashtags/@mentions to study next (derived only from your own saved videos) plus links to the public ad libraries.
- **Settings**: quality (best / 1080p / mp3), file-name style, download folder (inside your home folder), skip duplicates, auto-update engine.

Files go to `~/Downloads/OneClick` by default. The helper log is `~/Library/Logs/oneclick-host.log` (macOS) or `~/.local/state/oneclick-host.log` (Linux). engine updates itself weekly, and once when a site starts refusing downloads.

## Develop
```bash
python3 host/test_host.py && node --test test/extension.test.mjs   # tests
bash scripts/build-zip.sh                                          # Web Store zip in dist/
touch ~/.oneclick-dev                                              # dev: Chrome reloads the extension when files change
```
Layout: `extension/` (MV3, no build step) · `host/` (native messaging helper) · `docs/` (ROADMAP, SECURITY, WEBSTORE) · `CHANGELOG.md`.

## Responsible use
Download only content you own or have permission to use, and respect each platform's terms and copyright law. This project is a thin wrapper around engine and ships no site-specific code.

MIT licensed.
