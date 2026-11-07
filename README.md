# Xark Once Click Video Agent

Chrome extension that saves the video on the page (TikTok, Instagram, YouTube, X and 1000+ sites) with one click, downloads a whole page or a profile's latest videos, sorts what you save into collections, and turns it into a small research dashboard with optional AI recommendations.

It runs [engine](https://github.com/engine/engine) on your own computer through a tiny local helper. Nothing is uploaded anywhere.

## Install (2 steps)
1. **Helper** (installs engine + ffmpeg if missing, registers the helper)
   - macOS / Linux:
     ```bash
     curl -fsSL https://raw.githubusercontent.com/CitizenZM/xark-once-click-video-agent/main/install.sh | bash
     ```
     From a clone: `bash install.sh`. Pin a release with `ONECLICK_REF=<tag>`.
   - Windows (experimental, untested): `irm https://raw.githubusercontent.com/CitizenZM/xark-once-click-video-agent/main/install.ps1 | iex`
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

## Use your library from Claude (MCP)
The extension keeps a copy of your library (titles, creators, counts, tags, notes, collections; no file paths) in `~/.oneclick/library.json`, readable only by you, a few seconds after it changes. A small MCP server reads that file, so Claude can answer questions about your saved videos with the same numbers the dashboard shows.
```bash
claude mcp add xark-video -- python3 ~/.oneclick-downloader/host/mcp_server.py
```
Then ask, for example: "which format gets the most views in my saved videos?", "find my saved videos about serum", "write a creative brief from my skincare collection". Tools: `search_videos(query, platform?, collection?, limit?)`, `creator_stats(name?)`, `format_stats()`, `keyword_stats(min?)`, `creative_brief(collection?)`. Needs only `python3`, no packages. Run `node --test test/parity.test.mjs` after changing `extension/insights.js`: the Python port in `host/insights_py.py` must stay in step (`python3 host/test_mcp.py`).

**Growth tracking**: once a day the extension asks the helper for the current view, like and comment counts of videos saved 1, 7 and 30 days ago (at most 50 a day, 2 seconds apart) and keeps them with the video. The dashboard Overview shows "Growing fastest (last check)".

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

## What you get
- **One click**: click the icon and the video you are watching joins the download queue (turn off in the popup). The popup shows the live queue, Select videos and Dashboard. `Alt+Shift+D` also downloads the current tab.
- **Select videos**: checkboxes on every video tile, Select visible, Auto-scroll +20, pick a collection, Add to queue. Or right-click any video link → Add this link to the download queue.
- **Dashboard** (popup → Dashboard), in tabs: Overview · Creators · Formats · Keywords · Ideas · Library · Download · Settings. One Analyze filter (collection, platform, period) drives every analysis tab. See docs/DASHBOARD-PLAN.md.
- **Collections**: make folders of saved video links, choose a collection when you select or paste videos, move videos in bulk, copy a collection's links.
- **AI assistant (optional)**: paste your own Anthropic API key in the dashboard. Buttons *Recommend from my library* and *Auto-sort unfiled videos into collections* send a capped summary (titles, creators, tags, first caption line, counts) to api.anthropic.com only when pressed. See PRIVACY.md.

Site and downloads: https://xark-once-click-video-agent.vercel.app
