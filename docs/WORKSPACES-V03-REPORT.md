# 首页入口与工作区 V0.3

日期：2026-11-02。

## 本轮改动

- 左侧 Home 返回首页；Tags 进入可搜索、按标签筛选的笔记列表。选择笔记可打开相应页面。
- 新建笔记始终放入“未分类”。编辑页顶部的分区按钮突出当前位置，点击后可搜索和选择文件夹；本次会话中位置随之更新。
- 日程侧栏新增“查看全部日程”，进入独立日程页。可切换日期，查看当天清单，并新增、编辑、完成或删除；概览显示当天数量和近 7／30 天完成率。统计只基于当前演示日程。
- 语音速记、思维导图、白板都有单独的轻量工作区，可编辑文字和主题、保存到最近文件，再次打开继续修改。语音页的计时不录制音频。
- “导入 PDF／图片”通过 preload 的单一 `chooseImports` IPC 调用 Electron 文件选择器。主进程只返回最多 10 个受支持文件的名称和类型，不向渲染进程暴露路径，也不读取文件内容。最近文件列表增加图片筛选。

与上一版相比，Tags 和顶部快捷操作从提示弹窗变为可操作页面，日程从右侧摘要增加了详情入口，笔记位置从原生下拉框改为可搜索的圆角选择框。首页的主栅格、品牌文字、最近笔记与右侧日程位置保持一致。

## 截图

| 窗口 | Tags | 日程 | 分区选择 | 思维导图 | 导入 |
| --- | --- | --- | --- | --- | --- |
| 1920×1080 | [查看](../screenshots/tags-1920x1080.png) | [查看](../screenshots/agenda-1920x1080.png) | [查看](../screenshots/folder-picker-1920x1080.png) | [查看](../screenshots/mindmap-1920x1080.png) | [查看](../screenshots/import-1920x1080.png) |
| 1440×900 | [查看](../screenshots/tags-1440x900.png) | [查看](../screenshots/agenda-1440x900.png) | [查看](../screenshots/folder-picker-1440x900.png) | [查看](../screenshots/mindmap-1440x900.png) | [查看](../screenshots/import-1440x900.png) |
| 1366×768 | [查看](../screenshots/tags-1366x768.png) | [查看](../screenshots/agenda-1366x768.png) | [查看](../screenshots/folder-picker-1366x768.png) | [查看](../screenshots/mindmap-1366x768.png) | [查看](../screenshots/import-1366x768.png) |

三档截图由 Playwright 实际启动 Electron 拍摄。窗口内容宽度与页面滚动宽度相等；未出现横向溢出。主页沿用 P1 的品牌和版面；新页面使用相同字体、边框与紫色层级。

## 验证与边界

`npm run build`、`npm run lint`、`node scripts/check-home-v02.mjs`、`node scripts/check-navigation-editor.mjs`、`node scripts/check-workspaces.mjs` 均通过。

所有新建内容仍仅存在当前应用会话。导入只登记文件名和类型，点击文件时会提示预览尚未接入。没有音频录制、转写、自由绘制、笔迹引擎、PDF 编辑、OCR、数据库或磁盘保存。思维导图目前支持主题节点编辑，白板支持文字块；它们的草稿可在会话内再次打开。
