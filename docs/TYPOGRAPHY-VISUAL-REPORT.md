# Home UI 字体与视觉克制重构

日期：2026-11-01。审计见 [TYPOGRAPHY-VISUAL-AUDIT.md](TYPOGRAPHY-VISUAL-AUDIT.md)。本轮只调整视觉基础，不改 Mock 数据、状态交互或 Electron 权限边界。

## 前后对照

| 内容区 | 修改前 | 修改后 |
| --- | --- | --- |
| 1920×1080 | [截图](../screenshots/before-typography/home-1920x1080.png) | [截图](../screenshots/home-1920x1080.png) |
| 1440×900 | [截图](../screenshots/before-typography/home-1440x900.png) | [截图](../screenshots/home-1440x900.png) |
| 1366×768 | [截图](../screenshots/before-typography/home-1366x768.png) | [截图](../screenshots/home-1366x768.png) |

两组截图均由 Playwright 在本机 Electron 实际运行中生成，视口一致，`devicePixelRatio=1.75`，以 CSS 像素输出精确尺寸。1366×768 保持四张笔记卡与统计区不重叠；没有页面内部横向溢出。

## 具体变化

- **字体**：`SourceHanSansCN-VF.ttf.woff2` 由 [Adobe 官方仓库](https://github.com/adobe-fonts/source-han-sans)取得，作为完整本地字体资产，使用原生 250–900 可变字重。Logo 保留 Segoe UI。CDP Rendered Fonts 检查显示中文导航、月历标题、模块标题和笔记名均由 Source Han Sans CN VF 绘制；`document.fonts.check` 为 true。
- **排版**：在 `tokens.css` 集中定义 12/13/14/16/22/24px 字号、18/20/22/24/30px 行高与文字角色颜色，在 `typography.css` 按组件语义应用。中文正文不加字距，普通导航 400、选中 500、模块标题 600，统计数字 24px/600。数据使用等宽数字。
- **视觉层级**：仅新建笔记使用紫色实底；其他操作入口的图标与材质减弱。山景仍存在，但透明度降低；卡片改用统一的浅色玻璃面、细描边与轻阴影。笔记缩略图保持四张、原位置和点击交互。
- **对齐**：导航图标统一 20px，图标与文字间距 12px；二级目录行高 36px；快捷入口图标约 22px，间距 8px。笔记标题与日期收敛为 14/13px。

## 授权与体积

字体来自 Adobe `release` 分支的简体中文区域版 TTF WOFF2，约 7.71 MB，SHA-256：

`F971E3BFF46F76B49E1D5510556C2297C618EC4B491A295A4E741CDD38257799`

[官方 SIL OFL 1.1](https://github.com/adobe-fonts/source-han-sans/blob/release/LICENSE.txt) 已随字体复制为 `src/renderer/public/fonts/OFL-LICENSE.txt`。选择完整区域版以覆盖将来的用户笔记文本；没有按首页 Mock 字符裁切字体。

## 验证与剩余差异

`npx eslint . --quiet`、`npm run build`、Playwright 三视口截图、搜索/目录/日历/弹窗交互均通过。蓝紫线图与关键词气泡仍属于 P1 概念图风格；四张缩略图仍是模拟内容，缺少真实手写笔迹的质感。macOS 的实际渲染尚未在 Mac 设备验证。

本轮按 [unslop 技能](https://github.com/heydamir/unslop) 的审计与克制思路处理布局、材质和层级；作者 Damir Sokolovsky，CC BY 4.0。P1 明确要求的淡紫品牌方向优先保留。
