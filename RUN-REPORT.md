# RUN-REPORT — one-click-downloader-20261106
- 2026-11-06 13:20 `python3 host/test_host.py` → 4 tests OK (stub engine, protocol + retry + url validation)
- 2026-11-06 13:20 live host call, YouTube test video → ok, h264+aac mp4 in ~/Downloads/OneClick (engine 2026.10.26)
- engine 2026.02.04 gave HTTP 403; fixed by `pipx upgrade engine`. Re-run that monthly: sites break old versions.
- Not verified: Chrome load-unpacked click-through, TikTok/Instagram URLs (need user's Chrome / real post URL).
- Assumptions: output ~/Downloads/OneClick; Instagram retries with --cookies-from-browser chrome; extension ID pinned via manifest key.

## v2.0.0 (2026-11-06 13:50)
- `python3 host/test_host.py` → 6 OK (meta, friendly errors, IG cookie retry, URL validation, 6-job batch, ping)
- `node --test test/extension.test.mjs` → 4 pass (urls, analyze, recommend, background wiring one-click + batch via mocked chrome/host port)
- live host call (Chrome-style launch via registered manifest, minimal env): pong engine 2026.10.26; YouTube test video returned full metadata
- dashboard rendered in in-app browser with stubbed chrome API: 10 cards, 0 console errors, Helper-ready card, KPIs, headlines OK
- Not verified: extension loaded in real Chrome after reload; real TikTok/IG downloads; Windows; Web Store submission
- Assumptions: output ~/Downloads/OneClick; batch cap 50; recommendations derive only from the user's library + 4 fixed public ad libraries (no invented accounts)

## 2026-11-06 v3.5.0 — all gap features (agent team)
Built by 6 Sonnet agents in two waves (one worktree branch each), reviewed and merged by the coordinator.
- Tests: `node --test test/*.test.mjs` 47 pass; `python3 -m unittest discover -s host -p "test_*.py"` 64 OK; CI success 032f6df; Vercel zip 3.5.0; tag v3.5.0.
- Real checks: F1 sort/outliers on a real TikTok profile (16/16 views, 4 outliers, top 10 descending); F3 real TikTok download verified by ffprobe (h264+aac 26.3 s); skip-long on a real video (found and fixed: engine is silent under --print); F2 real 3m54s review transcribed in 5.1 s with correct hook; F5 live stats (views 454,900 → 456,600); F6 real Meta ad (720x1280, 53 s, cover 1080x1920) and Creative Center ad after playing; F7 MCP over stdio with fixture; dashboard merged UI in stub browser, no console errors.
- Integration issues found and fixed: F7 Python analysis copy drifted after F2 (parity test caught it, ported); the auto-sync hook rebased an unpushed merge mid-session (finished the rebase, now push right after each merge).
- Not verified: real-page harness (ego lite notification prompt blocks it); 3.5.0 inside the user's Chrome (needs one reload); logged-in Instagram Stories; MCP inside a real Claude client; TikTok photo posts unsupported by engine.

## 2026-11-06 22:40 — real-Chrome check of 3.5.0
- Helper log: `hello v3.5.0 dev=True` at 22:31:53, `sync-library ok`; `~/.oneclick/library.json` mode 600, 9 items; MCP `search_videos` returns them.
- TikTok @khaby.lame in the user's Chrome (shipped detect.js + select.js pasted, stub messenger): 32 tiles, 32 with views; real mouse click ticks a tile without opening it; ranks and 8 outliers (2.8x–10.0x) shown; Select top 10 + Add to queue sends the 10 highest (126.3M … 20.1M).
- Real helper download with cover: mp4 h264/aac 720×1280 9.5 s. Bug found: TikTok cover kept the numeric account id in its name (root cause: `normalize()` renamed only the video). Fixed, test added (fails before fix); re-download gives matching `khaby.lame - …` mp4 + jpg.
- Not reachable from Claude in Chrome: toolbar popup, native context menu, Alt+Shift+D, chrome-extension:// dashboard.
- Tests: 65 Python OK, 47 node pass.

## 2026-11-06 23:00 — 3.5.1: automated UI check with real library data
- Claude in Chrome cannot open chrome-extension:// pages or press Chrome shortcuts and native menus; ego lite rejects Extensions.loadUnpacked and blocks chrome-extension://; branded Chrome 156 ignores --load-extension, and CLAUDE.md forbids launching another browser. So popup.html and dashboard.html (shipped code) ran in the in-app browser with a chrome.* stub seeded from ~/.oneclick/library.json (9 real items).
- Popup: auto-queued current video on open; status dot green; Retry on an old numeric-id job → queued; Pause→Resume stored true/false; Remove, Clear finished, Select videos (injects detect.js+select.js, closes), Dashboard (opens tab) all send the right message.
- Dashboard: all 8 tabs render, no console errors. Bugs found and fixed (tests fail before, pass after): Instagram creators shown as numeric ids and one account split in two; keyword/hashtag drill-downs showed 0 because search skipped caption/transcript/link. After fix: 8 creators, The Good Bug = 2; drill-downs match the keyword table (protein 5→6, whey 3→4 due to substring search).
- Settings: cover/parallel/waitSec/maxMinutes saved under the keys background.js reads.
- Tests: 49 node pass, 66 Python OK; zips rebuilt at 3.5.1.

## 2026-11-07 — 更新检查、Sonnet 测试、收费模式与成本
- engine -U: up to date (2026.10.26)
- Sonnet agent: `node --test test/*.test.mjs` 49/49 pass; `unittest discover` 66 OK; node --check 14 files OK; py_compile OK; manifest/CHANGELOG/zip all 3.5.1; CI last 3 runs success; engine -j TikTok returns id 7697307919943060767
- Re-verified by Opus: same counts
- Cost: whisper base.en 9s clip in 0.61s; avg file 2.05 MB (43 files); AI click est. $0.010–0.031 (Sonnet 5.5), token count estimated at 3.2 chars/token (no API key for count_tokens)
- Doc: docs/MONETIZATION-AND-COST.md
- Open: ai.js thinking + max_tokens 2000 truncation risk, not changed (needs API key to verify)

## 2026-11-07 — 修复 AI 按钮截断风险
- 根因：Sonnet 5.5 默认 effort high 的思考占用 max_tokens 2000。
- 改动：`extension/ai.js` 请求体 `max_tokens: 8000`、`output_config.effort: "low"`；只取 text 块；`stop_reason: max_tokens` 明确报错。`test/extension.test.mjs` 断言实际请求体与截断报错。
- 验证：旧 ai.js 下 extension.test 1 fail（2000 !== 8000）；新代码 `node --test test/*.test.mjs` 49 pass 0 fail；`python3 -m unittest` OK；`scripts/build-zip.sh` 成功。
- 未验证：没有 API key，未对真实 API 发请求。

## 2026-11-07 — v3.5.2：Instagram 无播放量时按点赞排名 + 竞品对比
- 根因：Instagram 不提供 view_count / duration，dashboard 把 null 当 0 显示，Lift、Outliers、创意简报全部为空。
- 修复：缺失值显示 "–"；无播放量的组按点赞算 Lift（`liftBy: "likes"`）；Top performers / Outliers / best video 按 播放→点赞 排序；总数改为总点赞。Python MCP 端口同步。
- 验证：`node --test test/*.test.mjs` 50 pass；`python3 -m unittest discover -s host -p "test_*.py"` 67 OK；新测试在旧 insights.js 上失败（[0, undefined, undefined] ≠ [0, 0, 7468]）；真实 9 条 IG 数据预览：总点赞 7.9K、Outliers 3 条、Lift 显示 "7.9x likes"、简报有建议；CI success 6cd035f。
- 竞品对比：docs/COMPETITOR-GAP-20261107.md（研究由子代理完成，评分取自 Chrome 商店 2026-11-07）。

## 2026-11-08 — v3.6.0：爆款信号 + AI 标签 + 参考视频写脚本 + 广告投放时长
- 新增 `extension/winners.js`：views/hour（posted→save，及两次复查之间）、对比 creator 自己中位数（库内 ≥3 条或选择模式在主页读取的网格中位数，IG 用点赞）、Meta 广告投放天数（≥30 天标记）、AI 标签 lift。
- 数据接线：select.js 读取 Meta 卡片 "Started running on"/Active/Inactive 与主页网格中位数 → background `cleanExtra` 校验 → 库条目 `ad_start/ad_end/ad_active/creator_median_views`；host 打印 engine `timestamp`；复查 6h/1/7/30 天，alarm 改为每小时。
- 修 bug：engine 把 Meta 广告主页面点赞数填进 `like_count`，会污染点赞排名 → 改存 `page_like_count`。
- AI（用户自己的 key）：`buildTagPrompt`/`applyTags`（hook 类型、角度、人群、情绪、卖点、CTA，每次 40 条，固定词表外归 other）；`buildScriptPrompt`（一条参考视频 → 新脚本、分镜、CTA、备选 hook）。
- 验证：`node --test test/*.test.mjs` 59 pass 0 fail；`python3 -m unittest discover` 68 OK；新的 background 接线测试在旧 background.js 上失败（ad_start undefined）；预览（真实 9 条 IG + 11 条演示数据）三张新卡片、AI 标签表、Library Signals 列、脚本对话框均渲染，无 console error；AI 两个流程用 mock 的 API 返回走通真实 dashboard 代码。
- 未验证：未用真实 API key 调用 Anthropic；未在真实 Meta Ad Library 页面跑选择模式（卡片文字格式按英文界面写，其他语言界面读不到日期）；TikTok Top Ads 无投放日期，不覆盖。MCP 服务器未加新信号。
