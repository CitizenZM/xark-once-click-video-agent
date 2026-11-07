# 缺口功能开发与自测计划 / Gap features: build & self-test plan

对应 `docs/COMPETITORS.md` 的缺口清单。每个功能都写清：做什么 → 怎么做（文件、消息、数据）→ 开发步骤 → 怎么自己测 → 验收标准 → 风险。
可行性在 2026-11-06 本机实测过的，标 ✔︎；未实测的标 ?。

---

## 0. 测试体系（所有功能共用）

| 层 | 测什么 | 怎么跑 | 现状 |
|---|---|---|---|
| L1 单元 | 纯函数：URL、统计、排序、解析 | `node --test test/extension.test.mjs` | ✅ 11 个测试 |
| L2 接线 | background.js 在 mock chrome + mock helper 下的真实消息流（队列、去重、收藏夹） | 同上（“background: …” 测试） | ✅ |
| L3 Helper 协议 | Python helper 通过 native messaging 协议跑**桩 engine / 桩工具** | `python3 host/test_host.py` | ✅ 15 个测试，日志写临时文件 |
| L4 真实页面回归 | 在真实 TikTok/Instagram/YouTube 页面注入 detect.js + select.js，**真实鼠标**点 tile，检查识别数量、链接格式、页面没跳转 | `bash test/real/run.sh [名字过滤]`（ego lite） | ✅ 脚本已写；首跑被 ego 的通知权限弹窗打断，待重跑 |
| L5 真实端到端 | 在你的 Chrome 里用扩展真下载 | 手动清单 + 读 helper 日志 + 读扩展存储（见 §0.2） | 手动 |
| L6 视觉 | Dashboard/popup 用桩数据在浏览器里截图检查，0 console error | 拷贝 extension 到临时目录、注入桩 `chrome` 对象、本地 http 服务 | 手动步骤固定 |

**规则**
- 每个新功能至少：1 个 L1/L2 测试覆盖调用点（并做一次“去掉修复会失败”的变异检查）+ 涉及页面的功能进 L4 cases.json。
- 外部工具（whisper、ffprobe）一律在 L3 用**桩脚本**测协议，再用**已知答案的真实样本**测一次真工具（例：`say` 生成固定语音 → 转写 → 断言关键词）。
- CI 跑 L1–L3；L4、L5 在发版前本地跑，结果写进 `RUN-REPORT.md`。

### 0.1 发版检查表（每个版本）
1. `node --test test/extension.test.mjs` 与 `python3 host/test_host.py` 全过。
2. `bash test/real/run.sh` 全 PASS（登录墙的 case 允许 SKIP）。
3. `bash scripts/build-zip.sh`；`git push`；`gh run watch` 通过；Vercel zip 版本号正确。
4. helper 日志出现 `hello v<新版本>`（证明真实 Chrome 已加载）。
5. 按功能的 L5 手动清单各点一次。

### 0.2 L5 证据怎么取（不靠截图）
- Helper 日志：`grep -v hello ~/Library/Logs/oneclick-host.log | tail`
- 扩展存储（队列、library）：`strings -n 6 "$HOME/Library/Application Support/Google/Chrome/Default/Local Extension Settings/llbenemelndlfpfcilhbhbgkllcldbfb/"*.log | grep -oE '"state":"[a-z]+"' | sort | uniq -c`
- 下载文件：`ls -lt ~/Downloads/OneClick | head`，`ffprobe` 看编码与时长。

---

## F1. 页面排序与爆款标记（P1，对标 Sort Feed）

**用户故事**：在任意创作者主页或搜索页，不下载也能一眼看出哪些视频是爆款，并一键选中前 N 个。

**可行性 ✔︎**：TikTok 主页 tile 内有 `[data-e2e=video-views]`（实测 451.3K / 6.2M / 7.7M）；Instagram reels 标签页 tile 的 `innerText` 就是播放数（实测 640K / 872K / 1.2M）。不需要额外请求。

**设计**
- `detect.js` 新增 `metricsOf(el)`：先读平台专用选择器，再退回解析 tile 文本中的数字；`parseCount("1.2M") → 1200000`（支持 K/M/B、逗号、中文“万”）。
- `items()` 返回 `{url, el, views}`。
- `select.js` 底部栏新增：**“按播放排序”**（在 tile 上显示名次 #1…#N）、**“标出爆款”**（views ≥ 页面中位数 × 2 的 tile 加绿色角标 “3.4x”）、**“选中前 10/25”**。
- 无法读到播放数的页面：按钮置灰并提示“此页面没有显示播放数”。
- 可选进阶（第二步）：helper 新消息 `{type:"page-stats", url}` 用 `engine --flat-playlist -J` 拿 TikTok 主页完整统计（不受“只排已加载帖子”限制）。

**开发步骤**
1. `parseCount` 放进 `urls.js`（可单测）并在 detect.js 复制一份（PATTERNS 同步测试同样覆盖它）。
2. detect.js `metricsOf`；select.js 名次与倍数徽章、排序/前 N 按钮。
3. 页面中位数计算复用 insights.js 的 `median` 思路（页面侧独立实现，保持 detect.js 无依赖）。

**自测**
- L1：`parseCount` 表驱动测试（`"451.3K"`, `"6.2M"`, `"1,234"`, `"1.2万"`, `""`, `"abc"`）。
- L1：`outlierFlags(views[])` → 中位数与倍数正确；全部相等时无爆款；少于 4 个不标记。
- L4：cases.json 增加 `"views": true` 字段：断言前 6 个 item 都有 views>0，且“选中前 10”后 `__sent` 里 10 条 URL 按播放降序。
- L6：截图检查徽章不遮挡平台自身的播放数。

**验收**：TikTok 主页、Instagram reels 页 ≥90% 的可见 tile 读到播放数；“选中前 10”结果与人工排序一致。

**风险**：平台改 DOM → 选择器失效（文本数字兜底 + L4 每次发版跑）。Instagram 主页“帖子”网格不显示播放数（只有 reels 页有）→ 提示用户切到 Reels 标签。

---

## F2. 本地转文字稿 + 开头钩子（P1，对标 Sort Feed / Atria）

**用户故事**：下载后自动得到文字稿；Dashboard 的 Keywords、Ideas 用**说出来的话**而不只是标题文案；每条视频显示“前 3 秒说了什么”。

**可行性**：本机 Homebrew 的 `openai-whisper` **启动即崩**（`abseil` 动态库版本不匹配，2026-11-06 实测）。方案改为 **whisper.cpp**（Metal 加速，无 Python 依赖）：
```bash
brew install whisper-cpp
mkdir -p ~/.oneclick/models && curl -L -o ~/.oneclick/models/ggml-base.en.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
```
（多语言用 `ggml-base.bin`；约 150 MB。）?：whisper.cpp 速度在 M4 Max 上待实测，预期 30 秒视频 <5 秒。

**设计**
- Helper 新消息 `{type:"transcribe", file}`：`ffmpeg -i file -ar 16000 -ac 1 wav` → `whisper-cli -m model -f wav -oj` → 返回 `{text, segments:[{start,end,text}], hook}`；`hook` = 前 3 秒内的分段文本。
- 设置项：“下载后自动转写”（默认关）；dashboard 每行“转写”按钮。
- 队列：转写作为下载 job 的第二阶段（state `transcribing`），不占下载并发位。
- 存储：library 条目加 `transcript`（截断 5,000 字）和 `hook`。
- insights.js：`textOf(v)` 加入 transcript；Ideas 的“Opening lines that worked”优先用 `hook`。
- 安装器：`install.sh` 检测到 whisper-cli 缺失时只提示，不强制安装。

**开发步骤**：helper `transcribe()` + 工具探测（`ping` 返回 `whisper: true/false`）→ background 第二阶段 → dashboard 按钮与列 → insights 接入。

**自测**
- L3：桩 `whisper-cli`（脚本写固定 JSON）测协议、超时、缺模型报错文案、文件不在 HOME 下拒绝。
- **真工具已知答案测试**（本地，不进 CI）：
  ```bash
  say -o hook.aiff "Stop buying protein powder until you watch this."
  ffmpeg -f lavfi -i color=c=black:s=320x568:d=5 -i hook.aiff -shortest -c:v libx264 -c:a aac clip.mp4
  ```
  断言转写含 “protein powder”，`hook` 非空，耗时 < 10 秒。
- L1：`textOf` 含 transcript 后，关键词统计能出现只在语音里的词。
- L5：真实下载一条有口播的 TikTok，dashboard 显示文字稿。

**验收**：英文口播识别关键词命中率 ≥90%（用 5 条 `say` 样本）；转写失败不影响下载成功状态。

**风险**：模型体积与首次下载时间（安装引导说明）；音乐视频无语音 → 显示“无语音”。

---

## F3. 批量下载可靠性（P1，对标 KeepTik）

**用户故事**：一次排 100 条也放心：能暂停/继续、限速、跳过太长的视频，结束后有一份“哪些成功、哪些失败、为什么”的清单。

**设计**
- 队列全局状态 `queuePaused`（storage）：`pump()` 暂停时不启动新 job；popup 增加 ⏸/▶。
- 下载节奏：设置项“每条间隔 0/2/5 秒”与“并发 1/2/3”；`pump()` 读取。
- 跳过长视频：设置“最长 N 分钟”→ helper 下载参数 `--match-filter "duration <= N*60"`，被过滤时返回 `skipped:"too long"`。
- 文件校验：helper 下载后 `ffprobe` 检查有视频流、时长>0、大小>10KB，否则标错误“文件不完整”。
- 限流识别：engine 输出含 429/“rate limit” → job 回到 queued 并全局延迟 60 秒（最多 3 次）。
- 批次报告：同一次“Add to queue”生成 `batchId`；popup/dashboard 可导出该批 CSV（url、状态、原因、文件）。

**自测**
- L2：mock helper 让 job 挂起 → 暂停后新 job 不启动、继续后启动；并发设 1 时同时运行数始终 ≤1；间隔设置下两次 postMessage 时间差 ≥ 设定值（用假时钟或缩短到 50ms）。
- L3：桩 engine 输出 429 → helper 返回可重试错误；桩 ffprobe 返回无视频流 → “文件不完整”；`--match-filter` 参数出现在调用里。
- L5：真实批量 20 条（含 1 条私密、1 条超长），导出 CSV 与日志逐条对得上。

**验收**：暂停后 0 个新任务启动；批次 CSV 行数 = 提交数；失败原因全部为可读文案。

---

## F4. 导出到 Google Sheets / Drive（P2，对标 Sort Feed / Mass Downloader）

**最简可用（先做，零授权）**：“复制为表格”按钮 → 剪贴板写入 TSV（含表头），在 Sheets 里直接粘贴即成表；“下载 .xlsx”用纯 JS 生成（无依赖的最小 XLSX writer）。

**完整版（后做）**：`chrome.identity.getAuthToken` + Sheets API 创建表格；Drive API 上传视频。
- 需要：Google Cloud 项目、OAuth client（类型 Chrome Extension，绑定固定扩展 ID `llbenemelndlfpfcilhbhbgkllcldbfb`）、manifest `oauth2` 字段与 `identity` 权限。⚠ 需要你在 Google Cloud Console 建 OAuth client（我不能代建账号）。

**自测**
- L1：TSV 生成（制表符/换行/引号转义）；XLSX 生成后用 `python3 -c "import openpyxl"` 读回逐格比对。
- L5：粘贴到新 Sheets，行列数与 dashboard 一致。

---

## F5. 播放增长追踪（P2，对标 FastMoss 速度曲线）

**用户故事**：区分“持续增长的常青内容”和“一夜爆款后停滞”。

**设计**
- Helper 新消息 `{type:"stats", urls:[...]}`：`engine --skip-download -J`（批量，限速）只取 `view_count/like_count/comment_count`。
- background 每日 alarm：挑选保存后第 1、7、30 天到期的视频（每天最多 50 条），结果追加到 `history:[{at, views, likes}]`。
- Dashboard：Library 行内迷你折线；Overview 新卡片“增长最快”（7 天增量/初始值）。

**自测**
- L3：桩 engine `-J` 返回固定统计 → helper 正确解析与限速。
- L2：假时钟推进 1/7/30 天，只有到期条目被请求，且每天 ≤50。
- L1：增长率计算（0 初始值、缺失点）。
- L5：手动把一条视频的 `at` 改到 8 天前（dashboard 隐藏调试按钮），触发 alarm 后出现第二个数据点。

**风险**：频繁请求被平台限流 → 每日上限 + 间隔 + 失败退避。

---

## F6. 广告库来源（P2，对标 Foreplay / Swipekit）

**可行性**：engine 自带 `facebook:ads` 提取器 ✔︎（Meta 广告库单条广告链接 `facebook.com/ads/library/?id=…`）；TikTok Creative Center **没有**提取器 → 读取页面 `<video src>` 直链交给 helper（engine 可下载直链 mp4）。

**设计**
- PATTERNS 增加 `facebook.com/ads/library/?id=` ；detect.js 识别 Meta 广告库卡片（卡片内“查看广告详情”链接里的 id）与 Creative Center 卡片（`<video>` + 详情链接）。
- library 条目加 `source: "meta-ads" | "tiktok-cc"`、广告主、投放开始日期（页面可见时）。
- Dashboard 过滤“只看广告 / 只看自然内容”，对比两者的格式与关键词 Lift。

**自测**
- L3：用真实公开广告 id 跑一次 `engine --simulate`（本地，非 CI）确认提取器可用。
- L4：cases.json 加 Meta 广告库搜索页、Creative Center Top Ads 页（未登录可访问的部分），断言识别 ≥6 张卡片。

**风险**：广告库页面改版频繁；Creative Center 直链有时带过期签名 → 识别后立即下载，不延后。

---

## F7. MCP 接口：让 Claude 直接查你的素材库（P2，对标 Sort Feed / GetHookd）

**问题**：library 存在 Chrome 扩展存储（LevelDB），外部进程不能可靠读取。

**设计**
- 扩展在 library 变化时（防抖 5 秒）发 `{type:"sync-library", items}` 给 helper → helper 写 `~/.oneclick/library.json`（0600 权限，不含 transcript 以外的私密数据）。
- 新文件 `host/mcp_server.py`（stdio MCP）：工具 `search_videos(query, platform?, collection?)`、`creator_stats(name?)`、`format_stats()`、`keyword_stats(min?)`、`creative_brief(collection?)`。统计逻辑与 insights.js 一致（共享一组 JSON 测试数据，两边各自断言相同结果）。
- 安装：`claude mcp add xark-video -- python3 ~/.oneclick-downloader/host/mcp_server.py`。

**自测**
- L3：用同一份 fixtures，Python 版统计结果 == JS 版（JS 先导出 expected.json）。
- MCP 协议：发 `initialize` / `tools/list` / `tools/call` JSON-RPC，断言返回结构。
- 真实：在 Claude Code 里问“我收藏里 lift 最高的格式是什么”，答案与 Dashboard 一致。

---

## F8. 封面、音频、Stories、图集（P3，对标 Turbo / Mass Downloader）

- 封面：设置“同时保存封面”→ engine `--write-thumbnail --convert-thumbnails jpg`；dashboard Library 网格视图直接用本地封面（`file://` 不可用于扩展页面 → 用 engine 返回的远程 `thumbnail` URL 显示，本地文件留给用户）。
- 音频：已有“Audio only (mp3)”，补“视频+音频各一份”。
- Stories / Highlights：engine `instagram:story` 需登录 → 复用现有“匿名失败后读 Chrome cookies”逻辑；PATTERNS 加 `instagram.com/stories/`。
- TikTok 图集（photo 帖子）：engine 支持情况 ? → 先 `--simulate` 实测，不支持则 detect.js 从页面读图片直链。

**自测**：L3 检查参数拼接；L5 各类型真实下载一条，`ls` 与 `ffprobe`/`file` 校验。

---

## F9. 分享收藏夹（P3，对标 Foreplay 分享链接）

- 先做：“导出为单个 HTML 文件”——自包含页面（表格 + 统计 + 原视频链接 + 远程封面），可直接发给同事/客户，无服务器。
- 后做：上传到 Vercel 只读页（需要访问控制，默认不做公开链接）。

**自测**：L1 生成的 HTML 用 node 解析，断言条目数、无脚本注入（标题含 `<script>` 时被转义）；L6 打开截图。

---

## F10. 商店版去掉 YouTube（风险处理）

- `scripts/build-zip.sh` 的 store 包：从 PATTERNS、optional_host_permissions、content 匹配中移除 YouTube；manifest 描述不提 YouTube。
- helper 不变（GitHub 版仍支持）。

**自测**：L1 在 store 构建产物上跑 `videoUrls(["https://www.youtube.com/shorts/x"])` → 空；`grep -r youtube dist/store` 只剩无关文本。

---

## 建议节奏

| 版本 | 内容 | 预计 |
|---|---|---|
| v3.5 | F1 页面排序与爆款 + F3 批量可靠性 | 1–2 天 |
| v3.6 | F2 本地转写（含 whisper.cpp 安装引导） | 1–2 天 |
| v3.7 | F5 增长追踪 + F7 MCP | 2 天 |
| v3.8 | F6 广告库 + F8 封面/Stories | 2 天 |
| v3.9 | F4 表格导出 + F9 分享 + F10 商店版 | 1–2 天 |

每个版本都走 §0.1 发版检查表，结果写入 `RUN-REPORT.md`。
