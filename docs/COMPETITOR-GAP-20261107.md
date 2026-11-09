# 竞品对比与功能建议 / Competitor gaps & suggestions (2026-11-07)

Ratings and user counts are from Chrome Web Store pages seen on 2026-11-07. Prices are from vendor pricing pages. Items not verified are marked.

## 1. 高评分工具对比 / Top tools

| 工具 | 评分 / 用户 | 价格 | 核心分析方法 |
|---|---|---|---|
| vidIQ | 4.8★ · 11.5K 评分 · 400 万用户 | 免费；$199–468/年 | vidIQ Score、**Video Velocity（每小时播放）**、竞品追踪、标题/封面预览对比 |
| Foreplay | 4.7★ · 2 万用户 | $49–389/月 | **按投放时长排序**（跑得久 = 赢）、AI 情绪/人群识别、竞品广告追踪（含 top hooks）、AI 脚本 + 分镜、团队 Board |
| Atria | 扩展 4.6★ | $129+/月 | **AI 标签：hook、角度、人群、卖点、情绪**；按画面元素、口播、屏幕文字搜索；评论挖掘找角度 |
| Sort Feed | 4.3★ · 10 万用户 | 免费 25 条；Pro $10–15/月 | **Outlier = 播放 ÷ 该 creator 自己的中位数**；在页面内直接排序；相似账号；批量转写 |
| Swipekit | 4.2★ · 2 万用户 | 价格未核实 | 品牌追踪、广告文案高频词 |
| GetHookd | 扩展 4.9★ | $29–129/月 | 从一条爆款生成脚本；"winning ad" 识别（算法未公开） |
| 1of10 | 网站称 10 万+ | 免费–$89/月 | Outlier = 频道均值 10–100 倍；封面搜索；热门格式 |
| TikTok Creative Center | 官方免费 | 免费 | 行业 CTR 百分位；**逐秒 CTR / 留存曲线** |
| Motion | 未找到 | $999+/月 | 自有广告账户：thumbstop（3 秒播放 ÷ 展示）、hold rate、告警 |
| Exolyt / Kalodata | 未找到 | $400+/月 / 约 $46/月 | 评论情感、受众画像 / TikTok Shop GMV 估算 |

## 2. 我们缺什么，建议加什么 / What to add

Priority = value for marketers × feasible locally (no server, no platform API).

| 优先级 | 功能 / 分析方法 | 谁有 | 本地可行性 | 工作量 |
|---|---|---|---|---|
| **P1** | **Creator-relative outlier**：每条视频 ÷ 该 creator 自己的中位数（用户在主页时读取页面上的网格数据）。比"库中位数"更准，也解决了 Instagram 没有播放量时无法跨账号比较的问题 | Sort Feed, 1of10 | ✅ content script 读取 | S |
| **P1** | **Velocity（每小时播放）**：保存时记录 播放 ÷ 发布后小时数；复查加密到 6h / 24h | vidIQ | ✅ 已有 1/7/30 天复查 | S |
| **P1** | **AI 标签**：用自带 key 对转写 + 3 秒 hook 打标签（hook 类型、角度、人群、情绪、卖点、CTA），替换 regex 格式分类；Formats 页按标签算 lift | Atria, Foreplay | ✅ 已有 Whisper + ai.js | M |
| **P1** | **一条参考视频 → 脚本 / 分镜**：Library 行内 "Make a script like this" | Foreplay, GetHookd | ✅ 自带 key | S |
| P2 | 页面内排序 + outlier 徽章（下载前） | Sort Feed, vidIQ | ✅ 已有 select 模式，加徽章 | S |
| P2 | **广告时长信号**：从 Meta Ad Library / TikTok Top Ads 页面保存时记录开始投放日期和是否在投 | Foreplay, Atria | ⚠️ 新数据源，页面结构易变 | M |
| P2 | 镜头切分：ffmpeg 场景检测 → 每条视频的镜头数、平均镜头时长、前 3 秒切几刀 | Creative Center（近似） | ✅ ffmpeg 已在 | M |
| P2 | 评论挖掘：抓已加载的评论 → AI 总结痛点、反对意见、想要的东西 | Exolyt, Atria | ✅ 自带 key | M |
| P2 | 声音（sound）维度：记录 sound ID，按声音算 lift | Exolyt, Creative Center | ✅ engine 元数据 | S |
| P3 | 封面墙 + 封面特征（有无人脸、文字、主色） | 1of10, vidIQ | ✅ 本地，较重 | M |
| P3 | 画面 / 屏幕文字搜索（OCR + 图像向量） | Atria | ✅ 离线但重 | L |
| P3 | 竞品账号追踪 + 每周摘要 | Foreplay, Atria, Exolyt | ⚠️ 浏览器开着才能跑；稳定投递需服务器 → 放 Cloud 层 | M |
| P3 | 团队 Board、评论 | Foreplay, Atria | ❌ 需服务器 → Cloud/Team 层 | L |
| — | GMV 估算、受众画像、假粉检测、行业基准 | Kalodata, Exolyt, Creative Center | ❌ 需要大规模爬取或平台 API；做外链即可 | — |

**已有的卖点（营销用）**：本地保存，原帖删了也在（Sort Feed、Foreplay 都把这个当卖点宣传）；数据不出电脑；自带 MCP；本地转写免费。

## 2b. 已完成（v3.6.0, 2026-11-08）

Creator-relative outlier、Velocity（含 6h 复查）、AI 标签、一条参考视频 → 脚本、Meta 广告投放时长（P2 中的“广告时长信号”，仅 Meta；TikTok Top Ads 页面无投放日期）。

## 2c. 已完成（v3.7.0, 2026-11-08）

Research projects：推荐账号（mentions / 共享关键词 / 项目内 creator）、账号扫描（engine flat-playlist，含播放/点赞/发布时间，不下载）、推荐视频（≥1.5x 该账号中位数）、产品识别（AI tags: product/category/brand）+ Product mode、机会清单、Remix bank（带秒数的开头/结尾 + 剪辑清单）、AI remix / 新广告 / 测试计划。

## 3. 建议顺序

1. P1 四项一起做（约 1 个版本）：creator-relative outlier + velocity + AI 标签 + 参考视频生成脚本。这能让 Xark 从"下载 + 统计"升级为"找爆款 + 拆解 + 产出"，对标 Sort Feed 的 $10–15/月 和 Foreplay 的 $49/月。
2. P2 中先做声音维度和镜头切分（便宜、本地）；广告时长信号单独评估页面稳定性。
3. 追踪 / 团队功能归入 `MONETIZATION-AND-COST.md` 的 Cloud/Team 层，不在免费版做。

## 未核实

Swipekit、Motion、ViewStats 的具体价格；Kalodata 官方价格；GetHookd 的算法；G2、Capterra 评分；Minea、PiPiAds、Pentos 未调研。
