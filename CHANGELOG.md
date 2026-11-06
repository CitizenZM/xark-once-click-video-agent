# Changelog

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
