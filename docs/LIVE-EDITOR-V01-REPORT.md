# LiftInk 笔记编辑器 V0.1 实施报告

日期：2026-11-02。入口：`npm run dev` → 新建笔记 → 笔记页。

## 本轮功能

- 文档为 `Note → Page → ink/image element`；笔迹保存原始压力点，图片以独立资源 ID 引用。本机数据写入 Electron `userData/liftink-data`，JSON 先写临时文件再原子替换；受限 IPC 不接收任意路径。
- 钢笔、荧光笔、整笔迹橡皮、图片选择/移动/缩放、手动平移；Space 临时平移、Alt 吸取已有笔迹墨色，笔尖悬停反馈。输入实验台仍保留，供真实数位板诊断。
- 一次笔迹、整次擦除、图片贴入/移动/缩放、纸张样式与新增页面各为一个撤销动作。支持按钮、Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z 和 Windows Ctrl+Y。历史只保留当前打开期间，文档本身持久化。
- 图片可从文件选择、拖入或系统剪贴板粘贴；支持 PNG、JPEG、WebP，单个文件上限 20 MB，并校验文件头与解码尺寸。
- “区域截图”截取鼠标所在显示器，在应用弹窗中框选，可贴入当前笔记或打开可缩放、可移动的桌面置顶窗口。选中笔记图片也可直接贴到桌面。
- 新建笔记的目录信息和文档在重启后恢复；首页仍保留原有演示笔记。旧版 Xournal++/GTK 项目未改动。

## GitHub 与平台参考

- [Excalidraw 的 history 实现](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/history.ts)启发了独立 undo/redo 栈、用户动作粒度和新操作清空 redo；LiftInk 使用自己的类型化变更记录，不拷贝其框架。
- [perfect-freehand](https://github.com/steveruizok/perfect-freehand)用于压力笔迹轮廓；已提交笔迹的路径按页面元素列表记忆，避免指针移动时重算所有轮廓。大量笔迹性能仍以独立输入实验台的 Canvas 基准为准。
- 截图使用 Electron [desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer/) 与 [screen](https://www.electronjs.org/docs/latest/api/screen)；置顶贴图使用 [BrowserWindow.setAlwaysOnTop](https://www.electronjs.org/docs/latest/api/browser-window#winsetalwaysontopflag-level-relativelevel)。应用使用 Electron 44，因此未采用已移除的 `clipboard.readImage()`；图片粘贴读取 Web ClipboardEvent，资源写入只经限定 IPC。[Electron 44 变更](https://www.electronjs.org/blog/electron-44-0)

## 实际验证

- `npm run build`、`npm run lint`、`node scripts/check-editor-history.mjs` 与 `node scripts/check-live-editor.mjs`。
- Playwright 实际启动 Electron，逐项走通落笔、Space/Alt、橡皮、撤销/重做、图片导入/移动/缩放、页面新增与撤销、截图贴入、置顶窗口以及重启恢复。自动测试使用隔离数据目录并在核验路径后清理。
- 编辑器截图：[1920×1080](../screenshots/live-editor-1920x1080.png)、[1440×900](../screenshots/live-editor-1440x900.png)、[1366×768](../screenshots/live-editor-1366x768.png)，三档无横向溢出。截图中的彩色图片由测试生成，不包含真实桌面内容。[安全示例贴图](../screenshots/live-pin-window.png)。

## 下一轮边界

- 当前截图是在应用内预览并框选鼠标所在显示器；尚未做覆盖整个桌面的系统级选区、多屏跨屏框选和全局快捷键。macOS 屏幕录制授权与置顶层级尚需实机验证。
- 橡皮按整笔迹删除；套索尚未实现对多笔迹的移动/缩放，页面删除与重排、文本输入、局部橡皮、跨重启撤销历史、导出仍待开发。
- 新编辑器用 SVG 渲染当前页；高频大规模手写仍须继续做帧时间、内存与笔到屏延迟的实机测试，并考虑将绘制层换为 Canvas/WebGL。当前自动化不能代替数位板驱动测试。
