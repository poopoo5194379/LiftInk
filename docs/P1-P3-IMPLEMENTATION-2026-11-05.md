# LiftInk P1–P3 实现与验收

日期：2026-11-05。范围按[开发优先级](DEVELOPMENT-PRIORITIES-2026-11-03.md)中的施工顺序；手写识别、AI、同步在该表中定义为单独验证项目，不属于这轮已接入功能。旧 Xournal++/GTK 工程未改动。

## 已接入

| 阶段 | 实现 | 实际验收 |
| --- | --- | --- |
| P1 编辑 | 连续页、页面新建/删除/重排，套索圈选后移动/缩放/复制，笔迹局部擦除，2/4/8 像素笔宽，文本插入和双击修改，直线/矩形/椭圆 | Electron 中完成多页编辑、套索变换、文本修改及重开检查；删除和变换纳入撤销历史 |
| P1 输出 | 当前页或整篇 PDF、PNG；多页 PNG 为 ZIP；`.liftink` 备份和恢复 | 实际导出三页 PDF 并由 `pdf-lib` 重新打开，检查 PNG ZIP 页数、备份清单与资源，恢复至当前笔记 |
| P2 资料 | PDF 原件内容寻址存储，逐页渲染为只读底图；来源 PDF ID 与原页码；书签/目录；当前笔记与另一笔记双开参照；可见/锁定图层 | 导入 PDF 后批注、导出、重开；锁定层阻止写入；多次 PDF 导入后，备份包含每个原件 |
| P3 学习 | 摘录参照页并保留来源笔记/页面回链；遮挡胶带可揭示；正计时器；本地录音，笔迹时间戳与双击跳转 | Electron 中创建摘录并检查回链数据；使用模拟麦克风录音，校验 WebM 时长和双击笔迹后的音频位置 |

导出可选择当前页或整篇，以及是否包含纸张/PDF 底图。隐藏图层不会进入输出；锁定图层保留显示，但不可编辑。PDF 原件和页面图片保存在受控应用数据目录，文件读写只经 main/preload 的限定 IPC。原始 PDF 不依赖外部文件路径。

## 验证命令

```powershell
npm run build
npx eslint . --quiet
node scripts/check-p1-p3.mjs
node scripts/check-live-editor.mjs
node scripts/check-storage-recovery.mjs
node scripts/check-document-consistency.mjs
node scripts/check-crash-recovery.mjs
node scripts/check-navigation-editor.mjs
node scripts/check-workspaces.mjs
node scripts/check-home-v02.mjs
node scripts/check-pen-poc.mjs
```

UI 与资料工作流截图：[PDF 批注](../screenshots/p1-p2-pdf-editor-1440x900.png)、[双开摘录](../screenshots/p1-p3-editor-1440x900.png)。测试数据写入隔离临时目录。

## 当前边界

- PDF 批注和输出目前基于页面位图。原始 PDF 已保存，但导出的 PDF 为扁平化页面，不能选中原 PDF 的文字；超大 PDF 尚未做渐进载入。单次导入上限 50 MB、100 页。
- 双开参照栏只读；同一文档双处并发编辑尚无冲突协议。摘录当前为整页图片，来源回链定位到页，不定位到某一笔迹。
- 录音每篇笔记保留一条 WebM；再次录音会替换当前关联。Windows/macOS 的真实麦克风权限、长录音与失焦场景仍需实机测试。
- 手写识别、AI、同步与协作需分别验证模型质量、隐私、资源消耗、身份与冲突策略。它们未接入，也不应在 UI 中标为可用。
- P0 的真实数位板、25%/400% 坐标和 1k/10k/50k 笔迹性能，以及索引/文档跨文件事务仍未完成，当前版本仍未达到可发布 MVP。
