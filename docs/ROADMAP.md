# Roadmap

## A. The 10 optimization points (status in v3.0)
| # | Point | Status |
|---|-------|--------|
| 1 | One-command setup | Done for macOS and Linux. Windows installer written but untested. |
| 2 | In-extension setup check | Done: dashboard "Helper ready / not installed" card. |
| 3 | Web Store publish + GitHub fallback | Prepared (zip, listing, privacy policy). Publishing needs the owner's developer account. |
| 4 | Progress and queue | Done: live queue panel with per-video %, 3 parallel downloads, badge count. |
| 5 | Auto-update the engine | Done: weekly check plus one update-and-retry on 403. |
| 6 | Human-readable errors and retry | Done: plain-language errors, backoff retry for network errors. |
| 7 | In-page download button | Done (opt-in). Verified in a browser with a stubbed extension API; not yet on live TikTok/Instagram pages. |
| 8 | Options | Done: quality, file names, folder, skip duplicates, auto-update, button. |
| 9 | Tests + CI | Done: 14 helper tests, 7 extension tests, GitHub Actions. |
| 10 | Security hardening + license | Done: independent review, fixes in docs/SECURITY.md, MIT, privacy policy. |

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

## C. Ten-round build log
1. Real-Chrome review (30 real Instagram downloads in the helper log, 0 failures): version hello, dev auto-reload, clean names, readable titles
2. Live queue + progress; fixed lost library updates under concurrency
3. Options; fixed batch ignoring duplicate skipping (index passed as `force`)
4. Retry/backoff, weekly update, self-heal on 403
5. Opt-in in-page button
6. Latest N from a profile
7. Library search, filter, sort, notes, delete
8. Outlier scoring, like rate by platform
9. Independent security review and fixes; portability (found Homebrew's older the engine would have shadowed the pipx one)
10. Regression, docs, release
