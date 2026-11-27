# LiftInk

独立的 Electron + React + TypeScript 桌面手写笔记应用。当前支持多页书写、停笔拉直、全屏、PDF 批注与原文选择、标签、日程周历与月历、笔迹关联录音和本地备份。笔记及附件保存在本机应用数据目录。Windows 候选版的验收和发布缺口见[验收发布手册](docs/QA-RELEASE.md)。

## 运行

```powershell
npm ci
npm run dev
```

构建与基础检查：

```powershell
npm run build
npm run lint
```

受影响功能的专项回归脚本按需运行，例如：

```powershell
node scripts/check-storage-recovery.mjs
node scripts/check-document-consistency.mjs
node scripts/check-crash-recovery.mjs
node scripts/check-editor-library-preferences.mjs
node scripts/check-local-vault.mjs
node scripts/check-note-fullscreen.mjs
node scripts/check-hold-straight-line.mjs
node scripts/check-live-editor.mjs
node scripts/check-p1-p3.mjs
node scripts/capture-home.mjs
node scripts/check-home-v02.mjs
node scripts/check-navigation-editor.mjs
node scripts/capture-navigation-editor.mjs
node scripts/check-workspaces.mjs
node scripts/capture-workspaces.mjs
node scripts/check-fonts.mjs
node scripts/check-editor-history.mjs
node scripts/check-pen-poc.mjs
node scripts/capture-pen-poc.mjs
node scripts/benchmark-pen-poc.mjs
```

截图保存至 `screenshots/`。完整的视觉差异与实现边界见 [UI-IMPLEMENTATION-REPORT.md](docs/UI-IMPLEMENTATION-REPORT.md)。
V0.2 首页交互对照见 [HOME-INTERACTION-V02-REPORT.md](docs/HOME-INTERACTION-V02-REPORT.md)。
子文件夹、最近文件列表和笔记页的截图与边界见 [NAVIGATION-EDITOR-UI-REPORT.md](docs/NAVIGATION-EDITOR-UI-REPORT.md)。
标签、日程、分区选择和快捷工作区的早期实现见 [WORKSPACES-V03-REPORT.md](docs/WORKSPACES-V03-REPORT.md)。
数位板输入实验台从「设置 → 输入设备 → 打开详细输入测试」进入。实验笔迹只保存在当前页面内存中。早期设备与研究记录见 [PEN-INPUT-POC-REPORT.md](docs/PEN-INPUT-POC-REPORT.md)。
正式笔记页的早期操作见 [LIVE-EDITOR-V01-REPORT.md](docs/LIVE-EDITOR-V01-REPORT.md)；P1–P3 新功能、截图、验证与边界见 [P1-P3-IMPLEMENTATION-2026-11-05.md](docs/P1-P3-IMPLEMENTATION-2026-11-05.md)。
发布前仍需按 [EDITOR-V02-EXECUTION-PLAN.md](docs/EDITOR-V02-EXECUTION-PLAN.md) 完成大笔迹性能、真实数位板和保存可靠性的剩余验证。
Xournal++、Notability、Goodnotes、StarNote 的官方功能与 LiftInk 缺口对照见 [COMPETITOR-RESEARCH-2026.md](docs/COMPETITOR-RESEARCH-2026.md)。
当前开发优先级与保存恢复首轮施工结果见 [DEVELOPMENT-PRIORITIES-2026-11-03.md](docs/DEVELOPMENT-PRIORITIES-2026-11-03.md)。

## 当前工作文档

| 目的 | 文件 |
| --- | --- |
| 产品定位与范围 | [产品基线](docs/PRODUCT-BASELINE.md)、[竞品对照表](docs/COMPETITOR-MATRIX.md) |
| 功能、优先级与验收逻辑 | [MVP PRD](docs/PRD-MVP.md) |
| 页面地图、线框、状态与文案 | [交互规范](docs/UX-SPEC.md) |
| 架构、文件结构、IPC 与环境 | [技术说明](docs/TECHNICAL-SPEC.md) |
| 指标与埋点口径 | [指标定义](docs/METRICS.md) |
| 验收、缺陷、发布与反馈 | [验收发布手册](docs/QA-RELEASE.md) |
| 日常开发与分支 | [开发约定](docs/DEV-WORKFLOW.md) |

当前操作和数据格式以上表中的交互及技术说明为准。早期阶段报告保留各轮实现与验收记录。Windows 默认资料库位于 `%APPDATA%/liftink-desktop/liftink-data`，可在「设置 → 文件与备份」打开或迁移到自选目录。回归脚本使用隔离测试目录，`LIFTINK_TEST_DATA_DIR` 仅供测试。自选目录、迁移校验和快照恢复见[本地资料库](docs/TECHNICAL-SPEC.md#本地资料库)。

首页中文字体为项目内置的思源黑体简体中文区域版，英文 Logo 保留独立字形。排版 Tokens 与字体加载规则分别位于 `src/renderer/src/assets/tokens.css` 和 `typography.css`；前后对照见 [TYPOGRAPHY-VISUAL-REPORT.md](docs/TYPOGRAPHY-VISUAL-REPORT.md)。字体遵循 SIL OFL 1.1，授权文本位于 `src/renderer/public/fonts/OFL-LICENSE.txt`。

## 分层

- `src/main`：创建本地窗口，显式启用 `contextIsolation`、`sandbox`，关闭 `nodeIntegration`，拒绝新窗口；限定笔记和资源读写，导出路径由用户在系统保存对话框选择。
- `src/preload`：只暴露按笔记 ID 与资源 ID 限定的读写、用户发起的截图、贴图和导出方法，不暴露任意文件路径或通用 IPC。
- `src/renderer`：React 界面与类型化文档模型，无 Node 或直接文件系统调用。

项目未复制、删除或迁移旧版 Xournal++/GTK 代码。
