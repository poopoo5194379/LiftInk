# LiftInk 数位板输入 PoC：官方资料核查与验证方案

日期：2026-11-02。范围仅为 Electron 渲染进程中的输入验证，不定义笔记文件格式、数据库或完整笔迹引擎。

## 已核查的 API 事实

| 主题 | 可靠边界 | 来源 |
| --- | --- | --- |
| 设备类型 | `PointerEvent.pointerType` 可为 `mouse`、`pen`、`touch`；识别失败时可能是空字符串，也允许厂商扩展值。因此必须保留未知类型分支。 | [W3C Pointer Events Level 3 §4.1](https://www.w3.org/TR/pointerevents3/#dom-pointerevent-pointertype) |
| 悬停 | 可悬停的笔在接近设备时可以产生进入、移动和离开事件。悬停时 `buttons` 通常为 0；笔侧键按下时即使笔尖未接触也可能进入活动按钮状态，因此不能把所有 `pointerdown` 当作落笔。 | [W3C 按钮状态](https://www.w3.org/TR/pointerevents3/#the-buttons-property)、[Microsoft 指针输入说明](https://learn.microsoft.com/en-us/windows/apps/develop/input/handle-pointer-input) |
| 压感 | `pressure` 为 0–1 的归一化值。平台或设备不提供压感时，活动按钮状态的默认值是 0.5；所以恒定 0.5 不能视为真实压感。`tiltX`／`tiltY` 等传感值也可能只有默认值。 | [W3C `pressure` 与倾角](https://www.w3.org/TR/pointerevents3/#dom-pointerevent-pressure) |
| 笔侧键 | 标准映射中笔杆按钮为 `button=2`、`buttons&2`，笔尾橡皮端为 `button=5`、`buttons&32`。组合按键状态应看 `buttons` 位掩码，不只看 `button`；额外按钮在已有按键按住时不会产生新的 `pointerdown`。 | [W3C 按钮转变与位掩码](https://www.w3.org/TR/pointerevents3/#button-states) |
| 驱动映射 | 厂商允许把侧键配置成右键、橡皮、键盘快捷键等，默认功能随型号与驱动变化。Wacom 也建议先在驱动诊断面板确认按键行为。浏览器收到的事件未必能反推出物理侧键身份。 | [Wacom 侧键设置](https://support.wacom.com/hc/en-us/articles/1500006271501-What-settings-can-I-assign-to-Pen-or-tablet)、[Wacom 侧键诊断](https://support.wacom.com/hc/en-us/articles/1500006344242-Why-isn-t-the-side-switch-on-my-pen-working) |
| 点位精度 | 浏览器可把多个传感更新合并为一次 `pointermove`；`getCoalescedEvents()` 可取出该事件内的细分采样。`pointerrawupdate` 能更频繁派发，但规范提醒其监听可能影响性能，PoC 应将其设为可开关的对照模式。 | [W3C 合并事件](https://www.w3.org/TR/pointerevents3/#coalesced-events)、[W3C 原始更新](https://www.w3.org/TR/pointerevents3/#the-pointerrawupdate-event) |
| 预测点 | `getPredictedEvents()` 给出预测位置。规范示例在真实点到来时先清除旧预测点，因此预测点只适合临时显示，不能保存为最终笔迹。 | [W3C 预测事件](https://www.w3.org/TR/pointerevents3/#predicted-events) |
| 捕获与中断 | 落笔后可对活动 pointer 调用 `setPointerCapture(pointerId)`，使离开画布的后续事件仍发给画布；需要处理 `pointerup`、`pointercancel` 和 `lostpointercapture`，保证进行中的笔迹被结束或撤销。 | [W3C 指针捕获](https://www.w3.org/TR/pointerevents3/#setting-pointer-capture)、[W3C 失去捕获](https://www.w3.org/TR/pointerevents3/#the-lostpointercapture-event) |
| 浏览器手势 | `touch-action: none` 应限定在绘制表面，以免浏览器把直接操作手势用于页面平移／缩放并抑制指针流。它不能在 `pointerdown` 后临时修改来影响当前手势。 | [W3C `touch-action`](https://www.w3.org/TR/pointerevents3/#the-touch-action-css-property) |
| Alt 冲突 | 项目当前 Electron 窗口设置 `autoHideMenuBar: true`。Electron 文档说明 Windows／Linux 下单按 Alt 会显示隐藏菜单；临时吸色需要在真实窗口里测试按键是否被菜单截获。 | [Electron 窗口选项](https://www.electronjs.org/docs/latest/api/structures/base-window-options#autohidemenubar-boolean-optional-linux-windows) |
| 画布性能 | Canvas 2D 官方优化建议包括按设备像素比设置画布、预渲染复用内容、只重绘差异，以及用 `requestAnimationFrame` 安排绘制。Chromium DevTools 可查看帧、CPU、JS 堆和布局变化。 | [MDN 优化 Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)、[Chrome 性能面板](https://developer.chrome.com/docs/devtools/performance/reference)、[Chrome Performance Monitor](https://developer.chrome.com/docs/devtools/performance-monitor) |

`getCoalescedEvents()` 与 `pointerrawupdate` 有安全上下文条件；实际 Electron 版本与加载方式应在 PoC 启动时用特性检测记录，不能只凭规范假定可用。[W3C Pointer Events 接口与原始更新](https://www.w3.org/TR/pointerevents3/#pointerevent-interface)

## 建议的最小 PoC

在当前笔记页旁建立独立“输入实验台”，共用工具图标与视觉 Tokens，但不写入 `App.tsx` 的 Mock `Note` 结构。画布用 Canvas 2D；React 只维护工具栏、状态和汇总指标，采样点保存在画布控制器中，按帧绘制。这是为了避免每个高频采样都触发 React 重新渲染；属于实现建议，需用性能数据验证。

1. **诊断面板先行。** 显示 `pointerType`、`pointerId`、`button`、`buttons`、`pressure`、倾角、事件时间戳、合并点数、`pointercancel`／`lostpointercapture` 次数。只保留最近几百条事件，提供导出匿名 JSON 的选项前先确认数据范围。
2. **设备和悬停。** 鼠标／笔／触摸用同一 Pointer Events 入口分类；在笔 `pointerenter`／无笔尖接触的 `pointermove` 时绘制不落墨的笔尖圆环。用 `buttons&1` 辅助判断笔尖接触，记录异常映射；不要把 `pressure>0` 当唯一落笔条件。
3. **钢笔路径。** 以 `pointerdown` 开始、`pointermove` 的合并点追加、`pointerup` 结束；用 `pointercancel` 撤销或结束，标记原因。先用固定宽度确认事件连续性，再做压感曲线和轻量平滑；原始点保留，平滑只影响显示结果。建议分别比较不平滑、移动平均、受速度约束的平滑，观察拐角与延迟。
4. **橡皮和套索。** 橡皮先按整条 stroke 命中删除，套索先按闭合路径选择整条 stroke；两者都基于世界坐标和同一命中索引。PoC 不做像素擦除或局部笔迹切割。
5. **瞬态工具。** 维护 `selectedTool`、`temporaryToolStack` 和按键／侧键来源。Space 按下临时平移，Alt 按下临时吸色；释放各自按键恢复之前工具，窗口失焦、`pointercancel` 与编辑区域卸载时清空瞬态状态。键盘处理忽略输入框、文本域、组合输入和重复 `keydown`。`KeyboardEvent.key` 对空格返回 `" "`，按键按下／释放有明确的事件序列。[MDN KeyboardEvent.key](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key)
6. **坐标和视口。** 统一把 `clientX/Y` 经过画布矩形、平移、缩放变为世界坐标；所有落墨、命中、吸色和套索都用该坐标。滚轮／触控板缩放应固定光标下的世界点。浏览器的 `wheel` 事件既可能来自滚轮，也可能来自触控板缩放，后者通常带 `ctrlKey`；只对画布区域注册需要取消默认行为的监听。[MDN wheel 事件](https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event)
7. **压力与预测对照。** 设置可见开关：固定宽度／压感宽度、合并点开／关、原始更新开／关、预测预览开／关。每组记录真实设备的采样数量、延迟和手感，不应把自动化模拟事件视作设备性能结论。规范允许脚本创建非可信 PointerEvent，因此自动化适合验证状态机，不能代替硬件测量。[W3C Pointer Events 示例](https://www.w3.org/TR/pointerevents3/#examples)

## 实机测试矩阵和建议验收门槛

这些是 LiftInk 的**建议项目门槛**，不是浏览器或设备的保证值。先记录硬件、驱动版本、Windows Ink 开关、屏幕缩放率、显示器刷新率、Electron／Chromium 版本，再测试。

| 测试 | 需观察的结果 | 建议通过条件 |
| --- | --- | --- |
| 鼠标、笔尖、触摸 | 设备类型与笔尖接触状态 | 类型可区分；未知类型有安全退化；悬停不误落墨 |
| 轻压→重压→轻压、快速折线、慢速小字 | 压力序列、合并点数、折线拐角、断线 | 实机压力不是恒定 0.5；可见线宽变化；没有明显断笔或过冲 |
| 笔尖离开画布、失焦、侧键按放 | capture、cancel、工具状态 | 没有悬挂笔迹；临时工具每次恢复；侧键行为被记录并可配置 |
| Space／Alt 与笔同时使用 | 平移、吸色、释放顺序 | 键盘输入框不触发画布快捷键；任意释放顺序恢复正确 |
| 25%、100%、400% 缩放与连续平移 | 世界坐标、线宽、命中区域 | 画面不跳；橡皮／套索命中与可见笔迹对齐 |
| 1 千、1 万、5 万条笔迹 | 帧时间、内存增长、交互延迟 | 100% 缩放下连续平移的 p95 帧时间目标 ≤16.7 ms（60 Hz 屏）；若硬件或画布条件不满足，记录瓶颈和退化方案 |

性能测试要分别记录“采样进入 JS 到首次可见帧”的延迟、每帧绘制时间、长帧数量、堆内存和笔迹条数。`pointerrawupdate` 可增加主线程负担；不要同时把 `pointerrawupdate` 和 `pointermove` 的同一批点加入笔迹。上述采样路径选择是基于 W3C 对两类事件顺序和合并关系的说明作出的实现推论。[W3C `pointerrawupdate`](https://www.w3.org/TR/pointerevents3/#the-pointerrawupdate-event)

## 目前不能从资料推断的结论

- 当前用户的数位板型号、驱动映射和 Windows Ink 设置未知。Wacom 明确说明侧键功能可由驱动改写，因此“侧键 = 橡皮”不能写死；需在目标设备上记录事件流。[Wacom 功能映射](https://support.wacom.com/hc/en-us/articles/1500006271501-What-settings-can-I-assign-to-Pen-or-tablet)
- 单按 Alt 在本项目的窗口会不会触发原生菜单，需要实机验证；`autoHideMenuBar` 文档表明存在冲突可能。若证实冲突，再评估窗口菜单设置或更换吸色快捷键。[Electron 窗口选项](https://www.electronjs.org/docs/latest/api/structures/base-window-options#autohidemenubar-boolean-optional-linux-windows)
- 浏览器提供的压感、倾角和侧键事件是否连续，取决于硬件、驱动、OS 与 Chromium 的实际组合；规范只规定暴露语义，不能代替实测。Wacom 文档也说明 Windows Ink 设置可影响某些应用的压力可用性，但不能直接外推到 LiftInk。[W3C 传感值定义](https://www.w3.org/TR/pointerevents3/#pointerevent-interface)、[Wacom Windows Ink 说明](https://support.wacom.com/hc/en-us/articles/1500006328562-A-virtual-keyboard-opens-every-time-I-use-my-pen-in-Windows-why)
