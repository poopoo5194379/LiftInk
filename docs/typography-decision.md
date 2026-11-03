# Windows 首页字体决策

## 最新决定：思源黑体简体中文

2026-11-01 的视觉克制重构已将中文 UI 改为 Adobe 官方 Source Han Sans CN VF（思源黑体简体中文区域版），完整本地 WOFF2 文件随 Electron 工程加载。字体声明位于 `src/renderer/src/assets/typography.css`，400/500/600 字重使用可变字体原生轴，关闭浏览器合成字重。英文 LiftInk 品牌字保留独立的 Segoe UI 栈。详见 [前后对照报告](TYPOGRAPHY-VISUAL-REPORT.md)。

以下保留上一轮系统字体方案的研究背景。

2026-11-01。用户反馈首页字体有模板感，并提供了有关 Windows 字体栈和阿里巴巴普惠体的文字。该文字包含未经来源核实的建议，因此按实际 Electron 截图和平台文档逐项检查。

## 上一轮系统字体方案（已替换）

```css
font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont,
  system-ui, 'Segoe UI', 'Microsoft YaHei UI',
  'Microsoft YaHei', 'PingFang SC', sans-serif;
```

正文和普通导航 400；选中导航 500；卡片标题 600；品牌与主要数字 700。数据启用 `font-variant-numeric: tabular-nums`。移除全局 450 字重和无法改善 Windows 的 `-webkit-font-smoothing`。未使用未经测量的 `font-size-adjust` 比率，也未在所有文字上增加字距。

参考用户提供的 Obsidian 1.14.5 Windows 截图后，检查了本机 `D:\obsidian\resources\obsidian.asar` 内的默认 CSS。它的界面字体从 `ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, 'Segoe UI'...` 开始；当前库的 `appearance.json` 为 `{}`，没有覆盖界面字体。按 [Obsidian 官方字体变量文档](https://docs.obsidian.md/Reference/CSS%20variables/Foundations/Typography)使用 12/13/15/20px 的 UI 字号层级，并把 LiftInk 的导航和列表字重收敛到 400/500。

Playwright 启动的本机 LiftInk Electron 中，CDP 字体检查显示品牌、中文标题和笔记标题实际使用 Microsoft YaHei UI。先前 Segoe UI Variable 优先的方案已替换。已重新截图 1920×1080、1440×900、1366×768 并通过构建和交互检查。

## 阿里巴巴普惠体

普惠体可作为 LiftInk 中文界面的视觉候选。[阿里巴巴官方介绍](https://supplier.alibaba.com/us/news/PX909446.htm)称其可在商业场景使用，设计侧重屏幕阅读。它不是 Windows 自带字体；只在字体栈里写名字，未安装用户仍会看到回退字体。若要让所有设备一致，需取得官方字体文件并核对对应版本的嵌入与分发条款，再做真实截图对比。

粘贴文字把“必须子集化”作为普惠体的前提，这一点不能直接执行。公开的 [3.0 法律声明转载文本](https://github.com/flyanx/html-poster-to-psd/blob/main/fonts/LICENSE-AlibabaPuHuiTi-3.0.md)含“拆分、转换”等限制；在核对官方当前许可前，不能假设可把字体文件自行切片或改成 WOFF2 后分发。本阶段不打包普惠体。

## 核查依据

- [Microsoft Windows 11 排版指南](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/typography)：Segoe UI Variable 用于西文；Microsoft YaHei UI 用于简体中文；常规与 Semibold 是 UI 的主字重。
- [Microsoft Windows 11 字体列表](https://learn.microsoft.com/en-us/typography/fonts/windows_11_font_list)：列出雅黑与 Segoe 系列；不能把 Noto Sans SC 当作所有 Windows 设备的预装保证。本机恰好安装了 Noto Sans SC，但未将其作为项目默认依赖。
- [MDN font-smooth](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font-smooth)：`-webkit-font-smoothing` 只在 macOS 生效。
- [MDN font-size-adjust](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font-size-adjust)：该值需要按字体指标确定，不能从网上摘固定比例直接用于整页。
