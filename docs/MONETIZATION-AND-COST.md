# 收费模式与单次运行成本 / Monetization & cost per run (2026-11-07)

## 1. 同类产品怎么收费 / How comparable products charge

Prices were collected on 2026-11-07, mostly from third-party pricing pages because the vendors' own pages could not be fetched. Sources often disagree, so confirm each price on the vendor's site before quoting it externally.

| 产品 | 模式 | 价格 | 免费层限制 | 来源 |
|---|---|---|---|---|
| Sort Feed（排序/爆款，10 万用户） | Freemium + **一次性买断** | Pro **$39.99 一次性** | 免费仅 25 条、近 7 天 | [coldiq](https://cms.coldiq.com/tools/sort-feed) |
| Video DownloadHelper（600 万用户） | Freemium + **按浏览器买断** | 历史报价 Chrome $18 / Firefox $28（2023）；用户评论提到 $4.99 | 免费可下载，部分转换带水印/二维码 | [Mozilla 评论](https://addons.mozilla.org/en-US/firefox/addon/video-downloadhelper/reviews/2164840/), [heise](https://www.heise.de/download/product/video-downloadhelper-55872) |
| CreatorAnalyzr | Freemium + 订阅 | Pro（价格未公开） | 每天 3 次 | Chrome 商店 |
| Swipekit（广告收藏） | **订阅** | $26 / $46 / $66 每月（年付 $13 / $23 / $33） | 14 天试用 | [creatify](https://creatify.ai/blog/swipekit-pricing-(2026)-plans-credits-and-what-you-ll-actually-pay) |
| GetHookd（收藏 + AI 生成 + MCP） | 订阅 + **AI credits** | 起价 $19–29/月，含 50–800 credits | 7 天试用 | [gethookd](https://www.gethookd.ai/learn/swipekit-pricing-reviews-alternatives-is-this-ad-library-tool-worth-it/), [copyfy](https://www.copyfy.io/en/blog/gethookd-review) |
| Foreplay（云端收藏、团队） | 订阅（按 workspace） | $59 / $175 / $459 每月，年付约 85 折 | 7 天试用 | [toolradar](https://toolradar.com/tools/foreplay/pricing), [Foreplay FAQ](https://www.foreplay.co/faqs/do-you-offer-annual-discounts) |
| Atria（收藏 + AI 转写 + 脚本） | 订阅 + AI credits | Core $159/月（年付 $129） | 7 天试用 | [listicler](https://listicler.com/blog/atria-pricing-worth-it-performance-marketers) |

**规律**
1. **纯下载工具只能小额买断**（$5–40），因为本地运行没有持续成本，用户也不愿为下载按月付费。
2. **分析和找爆款可以收 $40 买断**，前提是免费层有明显限制（Sort Feed：25 条 / 7 天）。
3. **月费 $20–160 的产品都卖"云端 + 团队 + AI"**：永久保存、共享 Board、品牌追踪、AI credits。下载本身不收费。
4. **AI 用 credits 计量**（GetHookd、Atria），这样厂商的 API 成本始终有上限。

## 2. 推荐方案 / Recommended model

我们的优势是本地运行、数据不出电脑、自带 key，成本几乎为零。建议采用**开源核心 + 三层**：

| 层级 | 价格（建议） | 包含 | 我方边际成本 |
|---|---|---|---|
| **Free**（GitHub / 商店） | $0 | 一键下载、队列、Collections、Dashboard、自带 key 的 AI | ≈ $0 |
| **Pro 买断** | **$39 一次性**（对标 Sort Feed） | 选择模式超过 25 条、Outlier/Top N、本地转写、Sheets 导出、MCP | ≈ $0（全部本地） |
| **Cloud / Team** | **$19/月**（个人）· **$49/月**（团队） | 免 key 的托管 AI（每月 300 次）、Collection 分享页、7/30 天播放复抓、品牌追踪 | 见第 3 节：约 $3–9/月/用户 |

另外两条与主业相关的收入：
- **获客工具（lead magnet）**：免费版作为 Cell Digital / Xark 的入口，Dashboard 里的 "Creative brief" 末尾留一个 "让我们帮你投放" 的链接。按现有联盟业务，一个品牌客户的价值远高于插件订阅收入。
- **对品牌卖 Creator 名单**：只用公开数据（创作者、播放、Lift）。不要卖或上传用户本地收藏的数据，那会破坏"不经过服务器"的卖点。

**风险**
- Chrome 商店禁止扩展下载 YouTube。商店版需去掉 YouTube，或只在商店发布"分析 + 收藏"，下载 helper 走官网。
- 需要安装 native helper，这一步会流失用户。Pro 授权检查可以用 ExtensionPay 或 Stripe + license key，不需要自建账号系统。
- 平台改版会让检测逻辑失效，订阅制必须承诺持续维护（Turbo 只有 2.1 分就是前车之鉴）。

## 3. 单次运行成本 / Cost per run

All numbers were measured on this Mac on 2026-11-07. Token counts are estimates: no API key was available to call `count_tokens`, so they use 3.2 characters per token on the real prompts built by `extension/ai.js`.

| 操作 | 谁付钱 | 实测 / 估算 | 每次成本 |
|---|---|---|---|
| 下载 1 条视频（engine 本地） | 用户电脑 | 43 个文件，平均 **2.05 MB** | **$0**（无服务器、无带宽费） |
| 封面图 | 用户电脑 | 每张几十 KB | $0 |
| 本地转写（whisper.cpp base.en） | 用户电脑 | 9 秒视频 **0.61 秒**完成 | $0 |
| Dashboard 统计（Creators / Formats / Keywords / Lift） | 浏览器本地 | 纯 JS | $0 |
| MCP 查询素材库 | 本地 | 读 `~/.oneclick/library.json` | $0（调用 MCP 的 Claude 会话 token 另算） |
| **AI 按钮一次**（Sonnet 5.5，$2 / $10 每百万 token） | **用户自己的 key** | 输入：9 条 ≈ 0.9–1.2K tokens，60 条上限 ≈ 5.1–5.5K tokens；输出上限 2,000 | **$0.010–0.031** |
| 同上，改用 Haiku 5.5（$0.10 / $0.50） | 用户 key | 同样 token | **$0.0005–0.0016**（便宜约 20 倍） |

**对 Barron 的成本**
- 现在（自带 key 模式）：**每次运行 $0**。固定成本：Vercel Hobby $0，Chrome 商店注册费 $5（一次性），GitHub 私库 $0。
- 如果开 Cloud 层、改用托管 AI：每次 AI 点击最多 $0.031（Sonnet）。每月 300 次的上限 = **最多 $9.3/用户/月**，用 Haiku 则约 $0.5。按 $19/月定价，Sonnet 毛利 ≥ 51%，Haiku ≥ 97%。还要加 Stripe 手续费 2.9% + $0.30。

**已修复（2026-11-07）：AI 按钮截断风险**
根因：`extension/ai.js` 调用 `claude-sonnet-5-5` 时未设 effort，Sonnet 5.5 默认自适应思考（effort high），思考 token 计入 `max_tokens: 2000`，大样本时 JSON 可能被截断，用户看到 "The model did not return JSON"。
修复：请求改为 `max_tokens: 8000` + `output_config: {effort: "low"}`（不发 `thinking: disabled`，那在 Sonnet 5.5 上会 400）；只解析 `text` 块；`stop_reason: "max_tokens"` 时给出明确提示。单元测试锁定实际发出的请求体，旧代码下该测试失败（2000 !== 8000）。
成本影响：输出上限变高，但 low effort 思考更少；单次点击上限理论值升到约 $0.09（8K 输出），实际预计仍在 $0.01–0.03。**尚未用真实 API key 实测。**
