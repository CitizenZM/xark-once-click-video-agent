# Chrome 同类插件调研 / Competitor scan (2026-11-06)

数据来源：Chrome Web Store 页面（用户数、评分、更新日期为 2026-11-06 抓取时页面显示）、各产品官网与第三方对比文章。用户数是商店显示的"安装量级"，不是活跃用户。

## 1. 五类竞品一览

| 类别 | 代表产品 | 用户数 / 评分 | 最近更新 | 核心卖点 | 收费 |
|---|---|---|---|---|---|
| **通用视频下载** | Video DownloadHelper | 6,000,000 / 4.7（3.6 万评分） | 2026-10-21 | 1000+ 网站、HLS/DASH、直播、转 MP4/MKV/WebM、提取 MP3、无追踪 | 免费 + 付费转换 |
| **Instagram 批量下载** | Turbo Downloader for Instagram | 700,000 / **2.1** | 2026-02-24 | 每个帖子悬停出现下载按钮；主页 "Download All"；Stories/Highlights；快捷键；按账号建文件夹，同名跳过 | 免费 |
| | Mass Downloader for IG | 40,000 / 4.7 | 2026-10-27 | Reels/Series/Stories/Highlights；**保存到 Google Drive**；自定义文件名和文件夹；跳过重复；按手动/范围/时间/全部选择；快速检查和完整扫描；封面图 | 免费 + 付费 |
| **TikTok 批量下载** | KeepTik | 新品（23）/ 无评分 | 2026-11-02 | 无水印；**画质二选一（最高 / H.264 兼容）**；图集；侧边栏批量下载主页的 Videos/Reposts/Favorites/Liked；**下载前预览，可按类型/日期筛选、按播放/点赞排序**；已存过的和推广视频默认不勾；暂停/继续/重试；自动等待限流；下载速度可调；跳过过长视频；**每个文件校验大小和格式**；文件名模板；每条有状态和原因，可导出 CSV/JSON；任务历史 | 免费 |
| | Bulk TikTok Video Downloader | 3,000 / 4.8 | 2026-11-03 | 无水印、无需登录、轻量 | 免费 |
| **排序 / 爆款（outlier）查找** | **Sort Feed** | **100,000 / 4.3**（Featured） | 2026-11-04 | 在 IG/TikTok/FB/YouTube 页面上按播放、点赞、分享、日期排序；可设帖数和日期范围；**导出 Sheets/Excel/CSV/JSON**；**MCP：让 Claude/ChatGPT 帮你排序**；推荐相似账号；可用于主页/搜索/收藏/点赞列表；下载；**批量转文字稿并导出表格** | 免费限 25 条、近 7 天；Pro 解锁不限量和转写 |
| | Feed Sorter for TikTok & IG | 100,000 / 3.4 | 2026-10-31 | 排序；不打开帖子即可看数据；无水印下载；封面和音频；Stories；CSV。只能排已加载到页面的帖子 | TikTok 免费，IG 付费 |
| | Viralytics、Trendlyst、SortBuddy、Zetrr 等 | 4.2–4.9 | — | outlier Reels、最佳发布时间、文字稿、对比账号、CSV、批量下载 | 多为免费增值 |
| **创作者分析** | Toklytics | 1,000 / 4.6 | 2026-02-05 | 创作者评分 A+ 到 F；互动率；爆款比例（10 万播放以上）；周发帖数；单粉点赞；时间线图（30 天/3 月/12 月）；**每条视频导出 90+ 字段 CSV**（分享率、收藏率、"相对均值 %"、2 倍均值标记为爆款、音乐、hashtag） | 免费 |
| | CreatorAnalyzr | 849 / 5.0 | 2026-06-17 | 互动率及趋势；单条视频互动率；排序筛选；Excel 导出 3 个 sheet | 免费 3 次/天，Pro |
| | FastMoss 插件 | 平台产品 | 2026-04 | 在 FYP 上浮层；**单条视频播放增长曲线（速度）**；创作者面板：邮箱、14 天涨粉和播放、互动率、发帖频率、**受众年龄和地区**、发帖时间 | 付费（TikTok Shop 数据平台） |
| | GRIN、CreatorDB、TopYappers、Elev8or | — | — | 任意主页的即时创作者数据、受众、合作记录、联系方式 | 免费引流到付费平台 |
| **广告素材收藏（swipe file）** | Foreplay | ~20,000 / 4.7 | 2026-08-26 | 一键从 Meta 广告库、TikTok Creative Center、IG、LinkedIn、YouTube Shorts 保存；**云端永久保存**；连同文案和落地页截图一起存；Boards；分享链接；嵌入 Notion；Brief；竞品追踪（Spyder） | 付费 |
| | Swipekit | ~30,000 / 4.2 | — | 6 个广告库（含 Google、Pinterest）；**Brand Tracker 自动追踪品牌新广告**；评价集中在保存失败 | 付费 |
| | Atria | ~4,000 / 4.6 | — | Meta/TikTok；Boards 和标签；**自动转写视频广告并生成新脚本** | 付费，偏贵 |
| | GetHookd | ~4,000 / 5.0 | — | Brand Spy；克隆广告生成变体；**MCP 接入 Claude/ChatGPT** | 付费 |
| | MagicBrief | **已于 2026-07-31 关闭**，团队并入 Canva | — | 原有：收藏 + 账户分析 + Brief | — |

## 2. 共同特点和趋势

1. **"找爆款"是目前最大的需求**：排序类插件（Sort Feed、Feed Sorter）用户都到了 10 万，比纯下载工具更受营销和创作者欢迎。核心动作都一样：在平台页面上按播放排序，找出远超均值的视频。
2. **转文字稿成了标配**：Sort Feed、Atria、Viralytics、GetHookd 都提供转写，用来提炼开头钩子和脚本。
3. **接入 AI 助手（MCP）是新方向**：Sort Feed、GetHookd 已经提供 MCP，让 Claude/ChatGPT 直接调用。
4. **批量下载拼的是可靠性**：KeepTik 把暂停、重试、限流等待、文件校验、失败原因都做成了产品功能；Turbo 有 70 万用户，但平台改版后经常失效，评分只有 2.1。
5. **云端 + 团队共享是付费点**：Foreplay、Swipekit、Atria 收费靠永久保存、Boards 和分享链接，不靠下载本身。
6. **商店政策风险**：Chrome 商店不允许扩展下载 YouTube（Video DownloadHelper 的 Chrome 版明确不支持 YouTube）；Turbo 因商店政策被迫改名。
7. **常见收费模式是免费限额**：Sort Feed 免费版限 25 条、近 7 天；CreatorAnalyzr 免费版每天 3 次；Feed Sorter 的 Instagram 功能要付费。

## 3. 我们（Xark Once Click Video Agent）的位置

**已有的差异化优势**
- 本地 the engine：支持 1000+ 网站，文件和数据都不经过任何服务器，无账号、免费、开源。
- 一键下载当前视频（也支持 TikTok For You），持久化队列（3 个并发），选择模式 + "+ Queue" + 右键加入队列。
- 下载后能**分析自己的收藏**：按创作者、内容格式、关键词计算 Lift，生成有依据的创意 brief，并用你自己的 key 生成 AI 广告概念。竞品大多只分析别人主页上的数据，不分析你收藏的素材库。
- Collections、去重、CSV/JSON 导出。

**相对竞品的缺口（按价值排序）**

| 优先级 | 缺口 | 谁做得好 | 建议做法 |
|---|---|---|---|
| P1 | **在平台页面上排序 / 标出爆款**（不用先下载） | Sort Feed、Feed Sorter | 选择模式里加"按播放排序 / 只显示 ≥2x 均值"，一键选中前 N 条 |
| P1 | **转文字稿 + 开头钩子提取** | Sort Feed、Atria | 本地 whisper.cpp 转写已下载文件，结果进入 Keywords 和 Ideas |
| P1 | **批量下载的可靠性功能** | KeepTik | 暂停/继续、下载速度、跳过长视频、文件校验、失败原因汇总导出 |
| P2 | **导出到 Google Sheets / Drive** | Sort Feed、Mass Downloader | Sheets 导出，可选保存到 Drive |
| P2 | **播放增长曲线**（区分持续增长和一次性爆款） | FastMoss | 7 天和 30 天后自动重新抓取统计数据 |
| P2 | **广告库来源**（Meta 广告库、TikTok Creative Center） | Foreplay、Swipekit | 在这两个页面支持选择模式和一键保存 |
| P2 | **MCP 接口**（Claude 直接查询你的素材库） | Sort Feed、GetHookd | helper 已在本地，可以加一个 MCP server 读取 library |
| P3 | 封面图、音频、Stories、图集 | Turbo、Mass Downloader | the engine 参数 `--write-thumbnail` 等 |
| P3 | 团队分享页 | Foreplay | 把 Collection 导出成 Vercel 上的只读页面 |
| — | 受众画像、联系邮箱 | FastMoss、CreatorDB | 需要第三方数据源，不建议自建 |

**风险提醒**
- 上架 Chrome 商店时，涉及 YouTube 的下载功能可能被拒。建议商店版去掉 YouTube，GitHub 版保留。
- 平台改版是这类工具评分下滑的主因（Turbo 只有 2.1）。我们的检测逻辑应保留真实页面回归测试（这次用 ego-browser 测的那套流程）。

## 4. 参考链接
- Sort Feed: https://chromewebstore.google.com/detail/lhiilgfanjkbombmnlfelondlfohfpfg
- KeepTik: https://chromewebstore.google.com/detail/flpjpadfgenbhbcaedodicldccbloipj
- Mass Downloader for IG: https://chromewebstore.google.com/detail/ijcemfcomjlamigapfebkgdgehbmjpjj
- Turbo Downloader: https://chromewebstore.google.com/detail/cpgaheeihidjmolbakklolchdplenjai
- Video DownloadHelper: https://chromewebstore.google.com/detail/lmjnegcaeklhafolokijcfjliaokphfk
- Feed Sorter: https://chromewebstore.google.com/detail/bmljpagafjlkebnopbdncpnifkknlobk
- Toklytics: https://chromewebstore.google.com/detail/iknecpfjibbceneaacpmgkgffoniadoi
- CreatorAnalyzr: https://chromewebstore.google.com/detail/opgnlifjkohdnlnnjlnnhjadccfccpig
- Foreplay: https://chromewebstore.google.com/detail/eaancnanphggbfliooildilcnjocggjm
- Swipekit / Atria / GetHookd 对比: https://www.gethookd.ai/learn/4-best-facebook-ad-library-chrome-extensions/ (vendor-written; ratings and install counts quoted from it)
- MagicBrief 关闭: https://admanage.ai/blog/foreplay-vs-magicbrief
- FastMoss 插件: https://www.fastmoss.com/blog/tiktok-analytics-extension-real-time-fyp-data/
