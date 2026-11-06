# Roadmap

## A. The 10 optimization points (status in v2.0)
| # | Point | Status |
|---|-------|--------|
| 1 | One-command setup | Done for macOS and Linux (`install.sh`). Windows installer still to do. |
| 2 | In-extension setup check | Done: dashboard "Helper ready / not installed" card with the install command. |
| 3 | Web Store publish + GitHub fallback | Prepared: store zip + listing copy. Publishing needs the owner's developer account. |
| 4 | Progress and queue | Partly: one long-lived port, 3 parallel downloads, badge shows jobs in flight. Per-video % progress still to do. |
| 5 | Auto-update engine | Partly: "Update engine" button. Weekly automatic check still to do. |
| 6 | Human-readable errors and retry | Partly: common engine errors mapped to plain text, Instagram retried with cookies. Generic backoff retry still to do. |
| 7 | In-page download button | To do (batch via menu is done). |
| 8 | Options page | Partly: quality (best / 1080p / mp3). Folder, filename template, cookies source still to do. |
| 9 | Tests + CI | Done: 6 helper tests, 4 extension tests (incl. wiring), GitHub Actions. |
| 10 | Security hardening + license | Done: http(s)-only URLs, list-form subprocess args, MIT license, privacy policy. |

## B. 10 product ideas
1. **Hook analyzer**: transcribe the first 3 seconds of each saved video, classify the hook type (question, pattern break, claim, demo) and show which hooks you collect most. Feed it into the ad-studio hook picker.
2. **Creative-structure tagging**: a vision/LLM pass labels each video (UGC testimonial, unboxing, split-screen, voiceover demo, street interview) and CTA type, making the library searchable by structure.
3. **Watchlists**: follow accounts or hashtags; a daily job downloads new posts and sends a digest.
4. **Ad-library bridge**: pull a competitor's creatives from the Meta and TikTok ad libraries; treat run-time as a winner signal (long-running ad = working ad).
5. **"Brief this"**: select videos and generate a script, shot list and caption set in that style (Claude or ad-studio).
6. **Affiliate shortlist export**: push saved creators into an outreach shortlist (Levanta / Impact) with their like rate and niche tags.
7. **Outlier scoring**: like rate and view count normalised by creator size and post age, so real breakout posts stand out from big accounts.
8. **Shot and scene extraction**: ffmpeg scene detection plus a keyframe contact sheet per video for quick storyboard study.
9. **Boards and client moodboards**: group videos into boards with notes, export as an HTML/PDF moodboard for clients.
10. **Team library and rights log**: shared synced library (Supabase) with tags, comments, and a per-video usage/permission log so reference-only material stays reference-only.
