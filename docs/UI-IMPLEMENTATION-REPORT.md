# LiftInk Home UI 实现与差异报告

日期：2026-11-01，2026-11-02 更新导航和笔记页入口。视觉基准：用户提供的 LiftInk P1 首页图。方案文档仅作参考；本次以用户消息中的新建工程要求为准。

## 交付

当前首页顺序为左侧目录、中间笔记工作区、最右侧日历/今日日程/目标。右侧分栏可拖动调整宽度；三种视口均已重新截图。

| 视口 | 截图 | 验证 |
| --- | --- | --- |
| 1920×1080 | [home-1920x1080.png](../screenshots/home-1920x1080.png) | 4 张笔记；近期卡片与统计卡间隔 17px |
| 1440×900 | [home-1440x900.png](../screenshots/home-1440x900.png) | 4 张笔记；间隔 17px |
| 1366×768 | [home-1366x768.png](../screenshots/home-1366x768.png) | 4 张笔记；间隔 10px；无卡片文字重叠 |

Playwright 实际启动 Electron，按三种内容区尺寸截图，输出为相同像素尺寸。页面内部没有横向溢出。Home 选中行、搜索框和右侧日程面板的上沿分别为 108、109、109px。自动交互检查：搜索“云南”得到 1 张卡、新建笔记直接进入笔记页、切换至 2025 年 2 月、选“工作项目”后得到 2 张卡；词云“产品”打开 2 篇关联笔记，7 天与 90 天切换有效，折叠入口可打开思维导图 Demo 弹窗。另以构建、TypeScript 和 lint 检查通过。

## 与 P1 的差异

| 区域 | 当前实现 | 后续可校正处 |
| --- | --- | --- |
| 品牌与山景 | 双语标语在工作区顶栏；左栏顶部为粉色笔形标志与花体 LiftInk；独立 SVG 山景 | 原始 Logo 矢量素材未提供；当前笔形是占位绘制。山景为几何 SVG，层次与 P1 的细腻插画不同 |
| 导航和日程 | 三栏 CSS Grid、可拖动日程栏、默认展开目录、月历/日程/目标 | P1 的侧栏留白更轻，当前 1366 宽度下更紧凑 |
| 快捷入口 | 新建高优先级并直接进入空白笔记页；低宽度时将部分入口收进折叠菜单 | 笔记页目前只实现布局预览，未连接笔迹或文件系统 |
| 最近笔记 | 四张独立 DOM/CSS/SVG 缩略图 | P1 的真实手写笔迹更丰富；现有图是低细节模拟缩略图 |
| 统计与关键词 | 折线面积图和横向文字词云“思绪拾光”；默认 30 天显示 12 个词，点击可查看关联 Mock 笔记 | 图表为固定模拟序列；词云采用避碰的静态坐标，尚无真实笔记统计和时间衰减算法 |
| 字体 | 已完成思源黑体中文 UI 与 Typography Tokens 重构，Logo 保留独立字形；详见 [前后对照](TYPOGRAPHY-VISUAL-REPORT.md) | 当前仅在 Windows 上实际截图，macOS 仍需设备验证 |

未使用 P1 概念图作为页面背景。视觉采用自定义 CSS 玻璃面板，统一紫色与冷白色设计变量，不叠加第三方玻璃主题。按照 [heydamir/unslop](https://github.com/heydamir/unslop) 的检查思路做了排版和密度复核；保留 P1 明确要求的紫色玻璃风格。该技能作者 Damir Sokolovsky，CC BY 4.0。

## 技术和安全

模板来源：[electron-vite 官方 react-ts 指南](https://electron-vite.org/guide/)；模板在空白目录中新建。当前主要依赖：Electron 44.10.1、React 19.3.1、TypeScript 5.9.3、Vite 8.3.5、electron-vite 6.0.0、Tailwind CSS 4.3.3、Lucide React 1.66.0、Radix Dialog 1.3.1。弹窗采用本地 shadcn/ui 风格组件，底层使用 Radix，仅接入 LiftInk 自己的 CSS 材质。

主进程设定 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。preload 不暴露通用 Electron 或 Node API；首页不注册文件系统 IPC。后续功能需新增带参数校验和范围限制的专用 IPC 接口。

本阶段没有实现笔迹引擎、PDF 编辑、OCR、数据库或云同步。

2026-11-02 新增的子文件夹、最近文件列表和笔记页布局详见 [导航与笔记页报告](NAVIGATION-EDITOR-UI-REPORT.md)。
