# One-Click Video Downloader

Chrome extension that saves the video on the page (TikTok, Instagram, YouTube, X and 1000+ sites) with one click, downloads every video on a page in one go, and turns your saved videos into a small research dashboard.

It uses [engine](https://github.com/engine/engine) on your own computer through a tiny local helper. Nothing is uploaded anywhere.

## Install (2 steps)
1. **Helper** (installs engine + ffmpeg if missing, registers the helper; macOS and Linux):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/CitizenZM/one-click-downloader-20261106/main/install.sh | bash
   ```
   From a clone: `bash install.sh`.
2. **Extension**: `chrome://extensions` → Developer mode → Load unpacked → pick the `extension/` folder. (Chrome Web Store listing: see `docs/WEBSTORE.md`.)

Open the extension's dashboard (right-click the toolbar icon → "Open library & insights"). It should say **Helper ready**.

## Use
- **One click**: click the toolbar icon (or `Alt+Shift+D`) on a video page.
- **Whole page**: right-click the icon or the page → "Download all videos on this page" (profile pages, search results, hashtag pages; up to 50).
- **Paste links**: dashboard → Download.
- **Library & insights**: platform split, video length, top creators and hashtags, most viewed, plus creators/hashtags/@mentions to study next (derived only from your own saved videos) and links to the public ad libraries.

Files are saved to `~/Downloads/OneClick`. Troubleshooting: `~/Library/Logs/oneclick-host.log` (macOS).

## Develop
```bash
python3 host/test_host.py && node --test test/extension.test.mjs   # tests
bash scripts/build-zip.sh                                          # Web Store zip in dist/
```
Layout: `extension/` (MV3, no build step) · `host/` (native messaging helper) · `docs/ROADMAP.md`.

## Responsible use
Download only content you own or have permission to use, and respect each platform's terms and copyright law. This project is a thin wrapper around engine and ships no site-specific code.

MIT licensed.
