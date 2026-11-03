# LiftInk 数位板输入 PoC · GitHub 对照与验证

日期：2026-11-02。入口：运行 `npm run dev`，打开任意笔记页，点击顶部“输入测试”。这是独立的输入实验台，尚未接入笔记保存、撤销历史或文件格式。

## GitHub 方案核查

| 项目 | 可借鉴的做法 | 本阶段决定 |
| --- | --- | --- |
| [tldraw](https://github.com/tldraw/tldraw/blob/main/packages/editor/src/lib/hooks/useCanvasEvents.ts) | 指针捕获、合并事件与 `pointercancel` 处理；工具状态与画布输入分离 | 借鉴事件边界，不引入整个编辑器。其[许可证](https://github.com/tldraw/tldraw/blob/main/LICENSE.md)需单独评估，不能假设是 MIT。 |
| [Excalidraw](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/shape.ts) | 手绘几何与路径缓存；其[代码许可证](https://github.com/excalidraw/excalidraw/blob/master/LICENSE)为 MIT | 参考路径缓存思路；当前 PoC 不移植完整白板架构。 |
| [perfect-freehand](https://github.com/steveruizok/perfect-freehand) | 将采样点和压力转换为笔迹轮廓，MIT 授权 | 已安装，并与原始线段绘制并列为可切换渲染方式。真笔输入关闭模拟压力，保留原始压力值供诊断。 |

这些是从上游实现推导出的 LiftInk 方案，不代表上游项目对当前设备的兼容性承诺。浏览器输入语义和驱动差异的逐项来源见 [PEN-INPUT-POC-RESEARCH.md](PEN-INPUT-POC-RESEARCH.md)。

## 已实现

- 统一采集 Pointer Events，诊断 `pointerType`、压力、倾角、按键位掩码与合并采样数；笔尖悬停只显示圆环，不落墨。
- 钢笔、整笔迹橡皮、套索、平移、吸色；Space 临时平移、Alt 临时吸色，按键释放或失焦后恢复工具。侧键映射可在诊断区切换，默认只记录事件。
- `pointermove` 与 `pointerrawupdate` 可选一路采样，避免同一批点重复入笔迹；合并采样、平滑、压感线宽可独立开关。原始坐标与压力保留在内存数据中。
- 指针捕获、取消处理；世界坐标下的缩放、平移和命中；DPR 画布与 `requestAnimationFrame` 绘制。
- 100、1000、5000 条合成笔迹压力样本；笔迹轮廓缓存用于平移时复用。

## 自动验证与截图

`node scripts/check-pen-poc.mjs` 使用 Playwright 启动实际 Electron 窗口，检查鼠标笔迹、CDP 模拟 pen 压力变化、悬停和侧键不误落墨、工具切换、缩放、套索与橡皮。CDP 的 `Input.dispatchMouseEvent` 支持 `pointerType: pen` 与 `force`，但这是合成输入，不能证明数位板驱动表现。参见 [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/tot/Input/#method-dispatchMouseEvent)。

`node scripts/capture-pen-poc.mjs` 截取实际 Electron 窗口，尺寸为 [1920×1080](../screenshots/pen-input-poc-1920x1080.png)、[1440×900](../screenshots/pen-input-poc-1440x900.png)、[1366×768](../screenshots/pen-input-poc-1366x768.png)。三种尺寸均无横向溢出；1366×768 的诊断区可纵向滚动。

`node scripts/benchmark-pen-poc.mjs` 的结果保存在 [PEN-POC-BENCHMARK.json](PEN-POC-BENCHMARK.json)。本机 Electron 44.10.1 / Chromium 152.0.7977.169，DPR 1.75、窗口 1440×900；20 次交替平移重绘的 JS Canvas 绘制提交时间如下：

| 渲染方式 | 规模 | 首次重绘 | 热路径中位数 | 热路径 p95 |
| --- | ---: | ---: | ---: | ---: |
| 线段 | 1,000 条 / 20,000 点 | 4.5 ms | 2.7 ms | 3.7 ms |
| 线段 | 5,000 条 / 100,000 点 | 26.8 ms | 16.3 ms | 18.0 ms |
| perfect-freehand | 1,000 条 / 20,000 点 | 16.2 ms | 1.2 ms | 1.9 ms |
| perfect-freehand | 5,000 条 / 100,000 点 | 47.4 ms | 4.8 ms | 5.5 ms |

首次生成轮廓的成本明显高于缓存后的平移绘制。数值只测合成笔迹的 JS 绘制提交时间，不含 GPU 呈现延迟、笔到屏延迟或真实手写采样。不能据此断言已经达到 60 fps。完整笔记系统前仍需测 1 万与 5 万条笔迹、内存增长和局部重绘策略。

## 实机数位板待核查

请在目标 Windows 数位板和 macOS 设备上分别记录设备型号、驱动版本、Windows Ink 状态、显示缩放和刷新率，再验证：

1. 悬停与笔尖落下是否区分；轻压、重压、小字、快速折线是否连续，压力是否真实变化（固定 0.5 可能是平台默认值）。
2. 侧键按下时的 `button/buttons`、是否发出原生右键；笔尾橡皮端是否为 `buttons&32`。驱动映射可能改变这些值。
3. `pointermove` 与 `pointerrawupdate`、合并采样开关下的断线、延迟和 CPU 占用；压力轮廓与线段渲染的手感。
4. Space、Alt 与笔同时使用、不同释放顺序、离开画布或窗口失焦后的工具恢复；Windows 隐藏菜单是否抢占 Alt。
5. 25% / 100% / 400% 缩放下的笔迹、套索和橡皮命中，以及大量笔迹的 p95 帧时间与内存。

当前 PoC 只做到整笔迹删除与选择；还没有局部橡皮、套索变换、真正的撤销/重做、持久化或多页文档。这些应在实机输入结果稳定后，再设计笔记数据模型与编辑器架构。
