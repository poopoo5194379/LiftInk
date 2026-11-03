# 手写笔记产品一手资料对照（2026-11-03）

范围：Xournal++、Notability、Goodnotes、BOOX/Onyx 的 StarNote。这里的 StarNote 是[手写笔记应用](https://www.mystarnote.cn/)，与同名占星日记无关。本文件只依据产品官网、官方帮助中心、官方代码库及应用商店开发者页面描述功能；“为什么受欢迎”是根据这些功能与用户任务作出的**产品推断**，不能当作因果调查结论。各产品的功能因平台、版本和付费方案而异。

公开采用指标仅作背景：2026-11-03 查看时，[Xournal++ 官方 GitHub 仓库](https://github.com/xournalpp/xournalpp)显示约 1.56 万 stars；[Notability 美国 App Store](https://apps.apple.com/us/app/notability-ai-notes-planner/id360593530)显示约 45.9 万评分、4.8 分；[Goodnotes 美国 App Store](https://apps.apple.com/us/app/goodnotes-ai-notes-docs-pdf/id1444383602)显示约 43.7 万评分、4.7 分；[StarNote Google Play](https://play.google.com/store/apps/details?id=com.onyx.galaxy.global.note)显示超过 100 万次下载。平台指标不具可比性，亦不能解释具体受欢迎原因。

## 产品的吸引力与可借鉴细节

### Xournal++：硬件与自由度

- **已核实**：Windows、macOS、Linux 支持；压感数位板、可调钢笔/荧光笔/橡皮擦、图层、页面预览、图形与网格吸附、可定制工具栏、Lua 插件、录音和对象关联播放。[官网](https://xournalpp.github.io/)
- **关键细节**：输入设备可手动归类为鼠标、笔、橡皮、触屏等；侧键可临时切工具，释放后恢复原工具；稳定器提供速度权重、惯性和死区；Windows Ink 侧键事件有专门兼容设置；自动保存有独立位置与可调间隔。[官方 Preferences](https://xournalpp.github.io/guide/config/preferences/) [官方入门指南](https://xournalpp.github.io/guide/whirlwind-tour/)
- **推断**：受到桌面数位板用户欢迎，核心在“设备能用、笔迹可控、工具能按自己的工作流配置”，而非视觉包装。LiftInk 新项目可以借鉴行为和交互规范，不应迁移旧项目 GTK 代码。

### Notability：低学习成本与课堂回看

- **已核实**：可移动、可定制工具箱和一键笔预设；部分/整笔擦除；缩放书写；纸张模板；录音与笔迹同步的 Note Replay；横向或纵向双笔记；快速切换笔记；页面管理；遮挡复习用的 Tape。[官方入门指南](https://support.gingerlabs.com/en-us/articles/16300108-getting-started-with-notability) [双笔记指南](https://support.gingerlabs.com/en-us/articles/16300213-multi-note-and-note-switcher)
- **关键细节**：同一任务可沿着“打开文件 → 写 → 录 → 点笔迹回听 → 遮挡自测”完成；编辑工具与复习工具同处一个熟悉的工作流。Mac 的第二笔记可在新窗口打开，iPad 可左右/上下分屏；平台实现并不相同。[官方双笔记指南](https://support.gingerlabs.com/en-us/articles/16300213-multi-note-and-note-switcher)
- **推断**：流行原因之一是上手路径短、音频与笔迹的时间对应关系对课程和会议很有价值。不能据此断言音频是每位用户的首要购买原因。

### Goodnotes：纸张感、书写微交互与找回

- **已核实**：钢笔、形状识别、套索、尺子、Tape、元素、模板、书签、手写搜索、文件夹、录音及与笔迹同步回放。功能清单标明部分功能和压感的**平台限制**，例如缩放书写窗目前仅 iOS 可用。[官方方案功能表](https://www.goodnotes.com/pricing) [录音与笔迹回放](https://support.goodnotes.com/hc/en-us/articles/7352688559631-Add-Audio-Recordings-to-your-documents)
- **关键细节**：缩放书写窗可自动向右、到行尾后下移，支持改变书写区域尺寸；画圈并长按即可转为套索，乱涂可擦除，减少工具切换；笔记可建立可嵌套的页面目录；触屏双指/三指轻点可撤销/重做。[缩放书写窗](https://support.goodnotes.com/hc/en-us/articles/7353756826383-Write-with-the-Zoom-Window) [圈选手势](https://support.goodnotes.com/hc/en-us/articles/7443556793103-Select-content-with-the-Circle-to-Lasso-pen-gesture) [乱涂擦除](https://support.goodnotes.com/hc/en-us/articles/7443501398671-Erase-Handwriting-With-Scribble-to-Erase) [目录](https://support.goodnotes.com/hc/en-us/articles/7353757101071-Create-and-manage-document-outlines) [撤销手势](https://support.goodnotes.com/hc/en-us/articles/14069931315983-Quick-gestures-for-Undo-and-Redo)
- **受欢迎的证据与推断**：公司 2026 年资料称全球月活超 2,500 万；这证明规模，不证明具体功能造成流行。[Goodnotes 公司资料](https://www.goodnotes.com/for-ai-assistants) 产品推断：书写时少切工具、整理后可快速找回，构成高频使用的闭环。

### StarNote：学习资料间的连接与自定义

- **已核实**：官网突出钢笔/铅笔、标签、跨笔记摘录和引用、页面留白扩展、多个页面主题、多格式导入、自定义工具栏与笔盒、图层、页面链接。[StarNote 中文官网](https://www.mystarnote.cn/)
- **平台页面补充**：Android 商店开发者描述列有低延迟书写、图形/文本/套索、文件夹和标签、PDF 批注与导出、模板、页面工具、Tape、画中画学习及一次性买断 Pro。[Google Play 开发者页面](https://play.google.com/store/apps/details?id=com.onyx.galaxy.global.note) 商店数字、更新时间随地区和日期变化，不宜用作永久竞品事实。
- **推断**：吸引学习用户的不是一项“神奇功能”，而是“导入资料 → 批注 → 留白拓展 → 摘录引用 → 标签/链接组织”的连贯路径；笔盒则让常用工具更顺手。

## 对 LiftInk 的设计启示（由上述事实推导）

1. **笔输入优先于功能数量**：真实 Windows 数位板侧键、悬停、橡皮端、压感、稳定器、缩放后的坐标和延迟测试，应按设备矩阵验证。Xournal++ 的设备覆盖、临时工具和稳定器是最相关标杆。
2. **编辑闭环**：页面缩略图、删除/重排、套索移动与缩放、局部擦除、图形/直线、文本、纸张模板、书写窗，比主页上的更多统计模块更直接改善使用。
3. **记后可找回**：标题/标签/文件夹搜索之后，逐步加入页面书签和人工目录；手写内容搜索需要 OCR/识别与索引，可列为后期里程碑，不应伪装成当前已实现。
4. **资料与笔记互联**：截图/贴图之后的合理延伸是可引用的区域裁剪、页面链接与跨笔记链接。PDF 批注、多格式文档导入是更大工作量，需单独设阶段。
5. **学习/会议场景**：录音与笔迹时间戳、回放、Tape、双笔记是有明确用途的方向。音频先做本地录制/回放，再决定是否加转写；AI 不是该流程的前置条件。
6. **可靠性与透明度**：自动保存、故障恢复、导出/备份可见性决定用户是否敢把长期笔记放进应用。Xournal++ 提供可配置的自动保存，Goodnotes 和 StarNote 提供多种导出/备份路径。[Xournal++ Preferences](https://xournalpp.github.io/guide/config/preferences/) [Goodnotes 方案功能表](https://www.goodnotes.com/pricing) [StarNote 应用商店描述](https://play.google.com/store/apps/details?id=com.onyx.galaxy.global.note)

## 不宜照搬的地方

- Notability/Goodnotes 的一些好用手势为触屏或 Apple Pencil 设计；LiftInk 桌面数位板需配键盘、笔侧键与鼠标的等效操作。
- Goodnotes 的功能随平台和付费档位变化；查找参照时要注明具体平台，不能把 iPad 能做的事直接写成 Windows 基线。
- PDF 编辑、OCR、AI、云同步都不应压过当前本地笔记的保存可靠性和输入稳定性。
- 品牌视觉可参考产品成熟度，但不复制其商标、图标或私有资源。

## 与 LiftInk 当前实现的差距

以下“已有”仅指目前代码中的实际能力，不把实验台或会话演示算作正式产品功能。核对依据：[编辑器实施报告](LIVE-EDITOR-V01-REPORT.md)、[现行计划](EDITOR-V02-EXECUTION-PLAN.md)、[快捷工作区报告](WORKSPACES-V03-REPORT.md)，以及 `src/shared/editor.ts`、`src/renderer/src/components/LiveNoteEditorView.tsx`、`src/renderer/src/components/QuickWorkspaceView.tsx`。

| 使用任务 | LiftInk 现状 | 竞品值得学的细节 | 建议 |
| --- | --- | --- | --- |
| 放心写、放心关 | 本地文档和图片可重开；索引与文档分别写，保存失败与损坏恢复尚未形成闭环 | 自动保存、可恢复版本、导出/备份状态清楚 | **P0**：提交序号、失败提示、恢复副本、备份与重开故障测试 |
| 数位板写得顺 | 正式页有压力点、悬停、Space 平移、Alt 吸色；PoC 有设备诊断。真实设备未验收 | Xournal++ 侧键临时工具、输入稳定器、设备归类；可调笔预设 | **P0**：硬件矩阵与笔到屏延迟；笔盒预设在稳定后补 |
| 长笔记定位 | 正式页一次显示一页，可点页面缩略图；没有真实缩放、连续翻页、页面重排或删除 | Goodnotes 连续书写/缩放窗；竞品的缩略图、目录、书签 | **P1**：固定坐标与缩放、连续页、删除重排；再做目录和书签 |
| 改写已写内容 | 正式页仅能选择、移动和缩放图片；笔迹不能套索变换，橡皮只删整笔 | 套索移动/缩放/复制、局部擦除、撤销按动作粒度 | **P1**：多笔迹套索、剪贴板与局部橡皮，统一历史 |
| 混合内容 | 图片可贴、拖、移动和缩放；没有文本、图形、直线、可复用纸张模板 | 手写/键入/形状在同一页；纸张与工具预设 | **P1**：先文本、直线/形状与纸张设置；模板库后置 |
| 带资料阅读 | 导入入口只登记 PDF/图片文件名，不能打开或标注 PDF 内容 | Xournal++ 和 StarNote 的 PDF 背景批注、页面留白；Goodnotes 的目录 | **P2**：先只读 PDF 页面作为笔记底图并标注、导出；多格式转换后置 |
| 找回内容 | 首页搜索匹配笔记元数据，Tags 可筛选；不搜索手写/笔记页内容 | Goodnotes 的笔迹、PDF 文本和目录搜索；StarNote 跨笔记摘录/链接 | **P2**：标题/标签/目录先做实；P3 再引入 OCR 与全文索引 |
| 对照与复习 | 截图/图片可进页，贴图可置顶；语音页只计时，白板/思维导图为会话草稿 | 双笔记、笔迹关联录音回放、Tape、摘录回链 | **P3**：优先双笔记/参考资料并排；确认学习场景后做本地音频时间轴与 Tape |
| 交付给别人 | 尚无笔记或页面导出 | PDF/PNG 导出、选页范围、可移植备份 | **P1**：稳定保存后尽早做 PDF/PNG 和备份，不等所有高级功能 |

### 对现行 V0.2 顺序的调整

现行计划的 **A 保存恢复 → B 坐标/渲染 → C 实机数位板** 顺序仍成立。这次竞品对照建议把 **导出/备份** 从最后的交付阶段前移到基础编辑稳定之后；并在 **D 选择与页面** 中明确加入连续翻页、书签/目录的设计接口。PDF 应拆成“PDF 作为只读底图 + 笔迹批注”和“修改 PDF 原有内容”：前者是核心使用场景，后者不是近期必要能力。

### 最小可用目标

用户用数位板打开一份多页笔记，能稳定写、放大、翻页、圈选修改、关掉重开，并导出 PDF；全过程没有笔迹错位或静默丢失。这比同时做录音、AI、白板和云同步更能验证 LiftInk 的桌面手写价值。以上排序是产品判断，仍需目标用户访谈和真实设备测试校准。

## 用户补充材料核查（2026-11-03）

用户提供的功能清单补全了图层刷题、计时器、压感橡皮、双开摘录等学习场景。以下内容在进入正式需求前需要修正或限定平台：

| 原说法 | 核查结果与写法 |
| --- | --- |
| “Goodnotes 不支持录音同步、缺少书签、只在 Apple 设备上” | 这三项均不准确。Goodnotes 支持音频与笔迹同步的 Note Replay（回放模式限 iOS/macOS 的 Notebook）、页面书签，也有 Windows/Android/Web 版本；跨平台功能各有差异。[音频说明](https://support.goodnotes.com/hc/en-us/articles/7352688559631-Add-Audio-Recordings-to-your-documents) · [书签](https://support.goodnotes.com/hc/en-us/articles/7353727934095-Use-Favorites-and-bookmarks-in-Goodnotes) · [跨平台 FAQ](https://support.goodnotes.com/hc/en-us/articles/7378735557519-Goodnotes-for-Android-Windows-and-Web-General-FAQs) |
| “Notability 最多 6 屏分屏；转录只支持 23 种语言” | 官方 Multi-Note 说明是**同时两篇笔记**，iPad 可左右或上下摆放；2026 年的官方转录语言清单也已超过 23 种，且标明中国大陆、香港、澳门不可用。应按具体版本、地区与方案核查。[双笔记](https://support.gingerlabs.com/en-us/articles/16300213-multi-note-and-note-switcher) · [转录语言与地区](https://support.gingerlabs.com/en-us/articles/16300075-audio-transcripts) |
| “Goodnotes 手写 OCR 支持 66 种语言，潦草字也能精准搜” | 官方 Apple 端支持语言清单远少于 66 项；识别结果取决于字迹和索引状态。应写成“支持部分语言的手写搜索，需按平台与语言验证”。[官方语言清单](https://support.goodnotes.com/hc/en-us/articles/7353727932047-Handwriting-Recognition-and-Search-Languages-in-Goodnotes) · [搜索故障说明](https://support.goodnotes.com/hc/en-us/articles/7353695209743-I-can-t-search-my-notes) |
| “Xournal++ 正式版可直接选择/复制 PDF 原文，批注即 PDF 内可编辑图层” | 官方 PDF 文档说底层 PDF 与 `.xopp` 笔记分开；**PDF 原文选择工具目前仅 nightly 版**，导出为 PDF 后原有笔迹不能再作为 Xournal++ 对象编辑。应区分“笔记中的可编辑批注”和“导出的 PDF”。[PDF 官方指南](https://xournalpp.github.io/guide/pdfs/) · [PDF 工具](https://xournalpp.github.io/guide/tools/pdf_tools/) |
| “StarNote 图层无限；Goodnotes 图层是所有平台基础功能” | StarNote 更新记录曾写图层增至 **20 层**；Goodnotes 的独立图层目前是渐进开放的 Pro 实验功能，限 iPad/Mac 的 Notebook，最多 5 层。这两者都不应被写成无上限/全平台。[StarNote 更新记录](https://apps.apple.com/cn/app/starnote%E7%AC%94%E8%AE%B0-%E6%89%8B%E5%86%99%E7%AC%94%E8%AE%B0-pdf%E6%89%B9%E6%B3%A8%E4%B8%8E%E5%88%B7%E9%A2%98/id6740199654) · [Goodnotes 图层](https://support.goodnotes.com/hc/en-us/articles/16536297803535-Organize-content-with-layers) |
| “固定 10/20 ms 延迟、OCR 极强、永久会员具体价格、千页 PDF 必卡、某软件容易丢笔记” | 未在上述一手资料找到同条件的测量或稳定的定价/故障统计。删除绝对判断；若需比较，应规定设备、笔、DPI、文件、离线状态与测试方法，并记录实测。价格查[各产品当前方案页](https://support.goodnotes.com/hc/en-us/articles/13808767840015-Compare-Goodnotes-Plans-and-Features)，不能写死旧人民币价格。 |

Xournal++ 官网另有名为 Xournal++ Mobile 的项目说明，写明该早期 Flutter 移植长期未维护；主桌面项目资料则仍列出移动入口。两者范围容易混淆，不能把“移动端全部停更”当作桌面项目的现状。[官方社区说明](https://xournalpp.github.io/community/other-software/) · [主仓库](https://github.com/xournalpp/xournalpp)

### 这份清单提示的新增缺口

1. **文档可移植性与来源管理（P1/P2）**：PDF 作为底图时应把原件复制进受控资源包，记录来源和内容哈希，避免移动原文件后批注丢底图；明确原生笔记、扁平 PDF、PNG 导出各能否继续编辑。[Xournal++ 的外部 PDF 路径问题](https://xournalpp.github.io/guide/pdfs/)就是具体反例。旧 `.xopp` 可考虑做**只读导入器**，无需复制旧 GTK 代码。
2. **图层与误操作保护（P2）**：题目/答案分层、隐藏后重做、仅导出可见层、锁住图片或模板，都是比“无限图层”更明确的用户任务。先定义图层对套索、擦除、撤销、导出的作用边界，再做 UI。[Goodnotes 的图层行为](https://support.goodnotes.com/hc/en-us/articles/16536297803535-Organize-content-with-layers) · [对象锁定](https://support.goodnotes.com/hc/en-us/articles/14140907007375-Lock-objects-to-keep-them-in-place)
3. **参考资料与笔记并排（P2）**：双开应支持两篇笔记或 PDF+笔记、独立滚动/缩放、聚焦状态与从一边复制到另一边；桌面大屏比照搬平板多指手势更有价值。[Notability 双笔记](https://support.gingerlabs.com/en-us/articles/16300213-multi-note-and-note-switcher) · [StarNote 帮助中心](https://mystarnote.cn/help/note)
4. **学习过程而非装饰功能（P3）**：计时器要绑定笔记/会话并允许中断恢复；遮挡复习要保留答案、支持快速显隐；摘录要记录来源笔记与页面并能跳回。先验证真实学生使用，再决定是否投入表格识别、AI 制卡。[StarNote 功能目录](https://mystarnote.cn/help/note) · [Notability Tape](https://support.gingerlabs.com/en-us/articles/16300108-getting-started-with-notability)
5. **搜索结果的可达性（P2/P3）**：不仅要搜到笔记，还要定位到具体页和命中区域；先实现标题、标签、PDF 自带文本、人工目录，再决定手写 OCR。扫描 PDF 无文本层时不能假称可搜索。[Goodnotes 搜索范围与限制](https://support.goodnotes.com/hc/en-us/articles/7353743594127-How-to-Search-Your-Notes)

这些新增项不改变现行 **保存恢复 → 坐标/渲染 → 实机数位板** 的开工顺序；它们主要补全后续编辑器、PDF 和学习工作流的验收标准。
