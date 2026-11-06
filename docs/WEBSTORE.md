# Chrome Web Store pack (not yet published: needs the owner's developer account)
Build: `bash scripts/build-zip.sh` → `dist/one-click-downloader-<version>.zip` (dev-only `key` removed).
After the first upload, put the store-assigned extension ID in `host/EXTENSION_IDS` and re-run `install.sh`, otherwise the helper rejects the store build.

**Name**: One-Click Video Downloader
**Summary (132 max)**: Save TikTok, Instagram and other videos in one click with local engine. Batch a whole page and see what you saved.
**Category**: Productivity
**Single purpose**: Download videos from the page the user is viewing to the user's own computer.
**Permission justifications**
- nativeMessaging: talks to the local helper that runs engine. The extension cannot download streams without it.
- activeTab + scripting: read the links on the current page only when the user clicks, for "download all videos on this page".
- contextMenus: right-click actions.  notifications: show saved/failed results.
- storage: keep the user's list of saved videos (capped at 5000) and settings.
- alarms: weekly engine update check.
- optional host access to tiktok.com, instagram.com, youtube.com, x.com, twitter.com: requested at runtime only if the user turns on the in-page button (content script registered then).
- scripting: read links on the current page when the user clicks, and register the optional content script.
**Data use**: no collection or transmission of user data (see PRIVACY.md). Host the privacy policy at a public URL (raw GitHub link works once the repo is public).
**Review note**: the extension requires a companion helper installed by the user (`install.sh`); explain this plainly in the description.
