# LiftInk 手写与笔记工作流参考

## 手写输入

- 高漫官网列出的 M7 规格为 16384 级压感、300 PPS，并提供 Windows 驱动。应用侧按 Pointer Events 收到的归一化压力值处理，设备规格不能用来推算 LiftInk 实际收到的事件频率或压力分辨率。 [高漫 M7](https://www.gaomon.cn/Pen_Tablet/M7.html) · [W3C Pointer Events](https://www.w3.org/TR/pointerevents3/#dom-pointerevent-pressure)
- Pointer Events 规范建议在可取得合并事件时处理其样本序列，父事件是聚合值，重复处理可能采入重复坐标。笔在悬停和接触纸面时都可发出移动事件，取消和捕获丢失各有独立事件。LiftInk 用笔尖类型、接触状态和捕获来区分悬停与落笔，收笔时补录终点，笔划中断时保留已接收的有效笔迹。 [W3C 合并事件](https://www.w3.org/TR/pointerevents3/#coalesced-events) · [W3C 指针事件类型](https://www.w3.org/TR/pointerevents3/#pointer-event-types)
- perfect-freehand 将位置样本转换成墨迹轮廓，可分别控制 `streamline`、`smoothing` 和压力对笔宽的影响。LiftInk 保留真实笔压，先平滑压力波动，再用可调曲线把压力映射到笔宽。圆珠笔与针管笔预设使用恒定线宽，钢笔与软头笔用不同程度的粗细变化。Xournal++ 也把触控笔、鼠标等输入设备分开配置。 [perfect-freehand 参数](https://github.com/steveruizok/perfect-freehand#options) · [Xournal++ 输入设置](https://xournalpp.github.io/guide/config/preferences/#input-system)
- Goodnotes 的钢笔、圆珠笔、毛笔用不同压感反馈，并分开管理钢笔与荧光笔配色。LiftInk 沿用工具各自的色板，荧光笔以半透明颜色绘制在 PDF 底图之上、文字和书写墨迹之下。具体色值和图层顺序由 LiftInk 设定。 [Goodnotes 笔型](https://support.goodnotes.com/hc/en-us/articles/7353756785679-Write-and-customize-ink-with-the-Pen-tool) · [Goodnotes 颜色预设](https://support.goodnotes.com/hc/en-us/articles/7353743265039-Add-and-manage-writing-tool-color-presets)

## 笔记工作流

- Notability 在 iPad 上支持同时编辑两篇笔记，并可把第二篇开在右侧。LiftInk 的两栏沿用同一编辑器，支持拖动分隔条。右侧选择另一篇笔记时可独立编辑，选择当前笔记时可参照其页面。 [Notability Multi-Note](https://support.gingerlabs.com/en-us/articles/16300213-multi-note-and-note-switcher)
- Notability 的 Recently Deleted 提供 30 天恢复期。LiftInk 用本地删除时间计算保留期，在应用运行时清理到期的笔记。还原保留原目录、页面顺序和附件引用。 [Notability 删除与恢复](https://support.gingerlabs.com/en-us/articles/16300118-create-and-edit-notes)
- Notability 在笔记内展示当前笔记的学习时长。LiftInk 按笔记累计打开时长，双开时记入当前操作的笔记，首页可按 7、30、90 天查看时长排行。用于限时做题的倒计时独立控制。空白草稿、目标管理、全天日程及标签操作按本次需求定义。 [Notability 笔记内学习时长](https://support.gingerlabs.com/en-us/articles/16300108-getting-started-with-notability)

## 验证范围

Playwright 可以重现抬笔丢尾、低压杂点和有意点按，并检查保存的数据。M7 真机仍需验证 Windows 驱动下的轻触起笔、小字转折、连续短笔划和快速提笔。压力阈值及平滑默认值以实际手感为准。
