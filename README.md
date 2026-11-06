# One-Click Video Downloader
Chrome MV3 extension -> native messaging host (`host/oneclick_host.py`) -> local engine.
1. `bash host/install.sh` (registers host for Chrome/Chromium/Brave)
2. chrome://extensions -> Developer mode -> Load unpacked -> `extension/`
3. Click the toolbar icon on a video page, or right-click a link -> "Download video from this link".
Files land in `~/Downloads/OneClick`. Keep engine current: `pipx upgrade engine`.
