# 子文件夹、最近文件与笔记页布局

日期：2026-11-02。

## 本轮实现

- 左侧目录用可展开的树呈现。箭头负责展开，文件夹名称负责选中；父级筛选包含其子目录。支持两层以上嵌套和原有的拖动笔记到目录。
- 首页“查看全部”切换到最近文件列表，列出笔记与模拟 PDF，可按类型和文字筛选。点击笔记进入笔记页。
- “新建笔记”和 Ctrl/Cmd + N 立即创建会话内空白笔记并打开笔记页。自 V0.3 起，新笔记始终进入“未分类”，可在编辑页用可搜索分区框调整位置。
- 笔记页保留左侧文件导航；顶部显示可修改的标题与位置。中央是纸张预览和可切换的工具箱，右侧页面缩略图默认收起，可展开、添加和切换模拟页面。

笔记页参考了 Notability 官方帮助中描述的 [可定制工具箱与页面内容管理](https://support.gingerlabs.com/en-us/articles/16300108-getting-started-with-notability)，但采用 LiftInk 自身的字体、颜色和三栏导航方式。工具选择、纸张样式及页面操作目前只演示界面状态。

## 截图

| 视口 | 最近文件 | 新建笔记 |
| --- | --- | --- |
| 1920×1080 | [列表](../screenshots/recent-files-1920x1080.png) | [笔记页](../screenshots/new-note-1920x1080.png) |
| 1440×900 | [列表](../screenshots/recent-files-1440x900.png) | [笔记页](../screenshots/new-note-1440x900.png) |
| 1366×768 | [列表](../screenshots/recent-files-1366x768.png) | [笔记页](../screenshots/new-note-1366x768.png) |

[展开的子目录](../screenshots/folders-expanded-1440x900.png) · [打开的页面缩略图](../screenshots/new-note-pages-open-1440x900.png)

## 验证与边界

`npm run build`、`npm run lint`、`node scripts/check-navigation-editor.mjs`、`node scripts/check-home-v02.mjs` 和 Playwright 三档截图通过。三档笔记页都完整容纳布局，右侧页面缩略图默认关闭。

本轮没有笔迹引擎、PDF 编辑、OCR、数据库或文件系统写入。标题、目录和新建的笔记仅在当前应用会话内存在；页面数量、纸张样式和工具选择只保持到离开当前笔记页。底部状态栏明确标记画布仍是布局预览。
