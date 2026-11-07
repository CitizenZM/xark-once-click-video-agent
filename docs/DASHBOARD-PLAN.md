# Dashboard: UI/UX, creative and innovation plan (v3.4.0)

Status keys: ✅ shipped in 3.4.0 · ▶ next (recommended order) · 💡 idea

## 1. What the dashboard now answers

| Question | Where | How it is measured |
|---|---|---|
| Which creators are worth studying? | Creators tab | Videos saved, median views, **lift** (their median ÷ median of the current view), like rate, followers, **views per follower** (>1 = reaches beyond own audience), average length, top hashtags, best video |
| Which content types work? | Formats tab | Format read from title/caption/hashtags: Tutorial, Review, Unboxing, Before/after, Comparison, List/Top N, Routine/GRWM, Recipe, POV/skit, Story, Challenge, Sponsored/#ad, Question hook. Median views, lift, like rate, length, best example |
| Which words/hashtags go with high views? | Keywords tab | Words and hashtags in 2+ videos; videos, creators, median views, lift, like rate. Cloud: size = frequency, green = lift ≥ 1.5x |
| What should we make next? | Ideas tab | Creative brief built from the numbers above (each line states its evidence) + optional AI: 5 ad concepts grounded in the measured lifts |
| Focus on one product/client | Analyze bar | Filter every tab by collection, platform and period (7/30/90 days) |

Clicking a creator, keyword or hashtag opens the Library filtered to those videos.

## 2. UI/UX recommendations (界面优化建议)

1. ✅ **Tabs instead of one long page** — Overview · Creators · Formats · Keywords · Ideas · Library · Download · Settings. One question per tab.
2. ✅ **One global "Analyze" filter** (collection / platform / period) shared by all analysis tabs, so a client collection (e.g. "Protein refs") becomes its own report.
3. ✅ **Sortable tables + lift badges** (green ≥1.5x, red <0.75x) — scan for winners without reading numbers.
4. ✅ **Drill-down everywhere** — any creator/keyword/hashtag → filtered Library.
5. ▶ **Thumbnail grid view for Library** (toggle table ↔ grid) using the thumbnail URL engine already returns; marketers think in visuals.
6. ▶ **Creator profile drawer** — side panel with all their saved videos, timeline of views, formats used, and a "watch their latest 10" button (uses the existing profile download).
7. ▶ **Compare mode** — pick 2–3 creators or collections and see them side by side (median views, like rate, formats mix).
8. ▶ **Empty states that teach** — when a tab has too little data, show the exact action ("save 3+ videos with captions").
9. 💡 Keyboard: `/` focuses search, `1–8` switch tabs.
10. 💡 Light "presentation mode" that hides settings and prints a clean one-page PDF of the current view for a client.

## 3. Creative suggestions (创意建议) — how to use the data

- **Hook bank**: the Ideas tab lists the first lines of your top-viewed saves. Rewrite the *structure* ("How to hit 150g protein a day") for your product ("How to hit 150g protein without shakes"), never the words.
- **Format × product matrix**: pick the top 2 formats by lift and brief one ad per format per product. Test format, not just copy.
- **Length rule**: brief to the duration bucket with the best like rate in the current view (shown in the brief).
- **Creator casting**: high *views per follower* + few saves = under-priced creators to recruit for affiliate/UGC deals.
- **Keyword-led captions**: use lift > 1.5 words in on-screen text and captions; avoid words with red lift.
- **Sponsored vs organic gap**: the Sponsored/#ad row shows how much paid-looking content underperforms organic in the niche — keep ads looking native when the gap is large.

## 4. Innovation backlog (其他创新)

| # | Idea | Value | Effort |
|---|---|---|---|
| 1 | **Transcript + hook detection**: run local speech-to-text on downloaded files, store the first 3 seconds of speech as the real hook | Hooks from audio, not captions | M |
| 2 | **Scene/shot analysis**: count cuts in the first 5s, on-screen text presence, face in frame (local ffmpeg + lightweight model) | Explains *why* a format works | L |
| 3 | **Re-check stats after 7/30 days**: re-fetch view counts for saved videos and show growth curves | Separates evergreen winners from spikes | S |
| 4 | **Watchlists**: follow creators/hashtags; daily auto-collect their newest videos into a collection | Always-fresh swipe file | M |
| 5 | **Ad library bridge**: one click from a creator/brand to their TikTok Creative Center / Meta Ad Library pages, saved next to organic videos | Paid vs organic in one place | S |
| 6 | **Brief → script → storyboard export** (Docs/PPT) from AI concepts, ready for creators | Hands work straight to production | M |
| 7 | **Team sharing**: export a collection + its analysis as a shareable read-only page (Vercel) | Client/agency collaboration | M |
| 8 | **Affiliate overlay**: tag videos with the product/brand/affiliate link they push; compare GMV-driving creators with views | Ties creative to revenue | M |
| 9 | **Trend alerts**: notify when a keyword's lift jumps across new saves | Spot trends early | S |
| 10 | **Duplicate/variant finder**: group near-identical videos (same audio or caption) to see what got copied and re-posted | Finds proven, reusable concepts | M |
