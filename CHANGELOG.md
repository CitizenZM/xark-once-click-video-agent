# Changelog

## 3.5.1
Fixes found by testing 3.5.0 against real data in Chrome.
- Instagram creators were labelled with Instagram's numeric account id; they now show the account name, and one account stays one creator. Profile links use a handle only when a saved link contains one.
- Library search (and keyword/hashtag drill-down, MCP search) now also looks in captions, transcripts and links, so clicking a keyword shows its videos instead of "0 of 9".
- TikTok covers are renamed with the account handle, the same as the video file.

## 3.5.0
Built by a coordinated agent team (one branch per feature, merged and re-tested together). See docs/GAP-DEV-PLAN.md.
- Page sort and outliers (select mode): Sort by views, Mark outliers (≥2x the page median), Select top 10. Reads view counts shown on TikTok profiles and Instagram Reels tabs.
- Download queue: Pause/Resume, parallel downloads 1–3, wait between downloads, skip videos longer than N minutes, ffprobe file check, automatic retry when a site rate-limits, export the last batch as CSV.
- Local transcription (whisper.cpp, optional): transcript and spoken opening hook per video; feeds Keywords and the creative brief.
- View-growth tracking: daily re-check of views/likes/comments at 1, 7 and 30 days; "Growing fastest" card.
- MCP server: ask Claude about your library (search, creator/format/keyword stats, creative brief).
- Ad sources: Meta Ad Library ads and TikTok Creative Center ads (play the ad first); Ads only / Organic filter.
- Covers (optional .jpg) and Instagram Stories (uses your Chrome login).
- Export: Copy as table (paste into Google Sheets), .xlsx download, share a collection as a single HTML page.
- Chrome Web Store build without YouTube.
- Fixed: "skip longer than" was reported as a success with no file (engine is silent under --print); a run that saves no file is now an error.
- Not supported: TikTok photo posts (engine: Unsupported URL).

## 3.4.0
- Select mode: the whole video tile is now the click target (clicks no longer open the post on Instagram/TikTok); "+ Queue" on each tile adds that video at once. Tested with real mouse clicks on TikTok and Instagram keyword search.
- Optional always-on "+ Queue" button when hovering any video (Settings → in-page buttons).
- Fixed: Retry/Remove did nothing on jobs saved by older builds (numeric ids); failed rows now show the reason with Retry and Remove buttons.
- Dashboard rebuilt into tabs with a shared Analyze filter (collection, platform, period): Creators (lift, views per follower, formats, hashtags), Formats (content types from captions), Keywords (words and hashtags with lift), Ideas (evidence-based creative brief + AI ad concepts).
- Host tests no longer write to the real helper log.

## 3.3.0
- One click again: clicking the icon queues the video you are watching right away (also on TikTok For You, where there is no video link). Opening the popup on an already saved video does not download it twice.
- Real download queue: persisted, 3 at a time, resumes after Chrome restarts the extension, cancel waiting jobs, retry failed ones, clear finished. Live in the popup.
- Select mode rebuilt and tested on real TikTok and Instagram pages: checkboxes on every tile, Select visible, Auto-scroll +20, collection, Add to queue, Esc to close.
- Fixed: Instagram links of the form /<user>/reel/<id>/ were not recognised (select found 0 videos, popup said "not a video page").
- Redesigned popup.

## 3.2.0
- Renamed to Xark Once Click Video Agent.
- Toolbar popup (download this video, select videos, open dashboard); `Alt+Shift+D` downloads the current tab.
- Collections: folders for saved videos, filter, bulk move, copy links, choose a collection when downloading or selecting.
- Optional AI assistant (own API key): recommendations from your library and auto-sort into collections, on click only.
- Landing page on Vercel; unpacked zip keeps the pinned extension ID.

## 3.1.0
- New: "Select videos on this page…" (right-click the page or the toolbar icon): tick videos with checkboxes, Select all / Clear, then Download. Works without extra site permissions.
- Fixed: the same video clicked several times while it is downloading is now one download, not several.

## 3.0.1
- Fixed: TikTok creators showed a numeric id instead of the handle (file names, creator grouping, profile links).

## 3.0.0
- Release: all of 2.1-2.9 together; verified by 14 helper tests, 7 extension tests (wiring included), an independent security review and a cold-install test.

## 2.9.0
- Security hardening after an independent review (see docs/SECURITY.md).
- Portability: Linux log path, Windows installer (experimental, untested), log rotation.

## 2.8.0
- Outlier detection: videos that beat their baseline (follower count when known, otherwise the median of your saved videos on that platform). Like rate by platform.

## 2.7.0
- Library: search (title, creator, tags, notes), platform filter, sort, notes with #tags, remove entries.

## 2.6.0
- "Latest from a profile": download the newest 10/25/50/100 videos of a profile, channel or hashtag page.

## 2.5.0
- Optional in-page download button (single video or whole feed) on TikTok, Instagram, YouTube and X. Off by default; asks for site access only when turned on.

## 2.4.0
- Retry with backoff for network errors, weekly automatic engine update, one automatic update-and-retry when a site starts refusing downloads (403).

## 2.3.0
- Settings: download folder (inside your home folder), file-name style, skip already-saved videos.
- Fixed: batch downloads ignored duplicate skipping for every item after the first.

## 2.2.0
- Live download queue with per-video progress.
- Fixed: concurrent downloads could overwrite each other's library entries.

## 2.1.0
- Cleaner file names, readable Instagram titles (first caption line), version hello + dev auto-reload for development.

## 2.0.0
- Batch download of a whole page, library and insights dashboard, one-command installer, CI, Web Store pack.
