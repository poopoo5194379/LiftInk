# 指标与埋点定义

版本：方案草案，2026-11-03。**代码中尚无产品埋点或真实数据看板**；首页“书写概览”、词云和日历使用样例数据，不能报告为留存或活跃。单机应用先用本地、无内容的事件日志验证流程；远端汇总须在用户知情与数据规则确定后另行设计。

## 北极星与上线后三个数

北极星：**每周成功书写天数**（每个本地安装、自然周内，至少有一篇笔记发生 `edit_committed` 且对应提交达到 `save_succeeded` 的天数，0–7）。它衡量是否真的把 LiftInk 当成书写工具；不能把示例图表算入。

| 指标 | 严格定义 | 事件与计算 | 首轮用途 |
| --- | --- | --- | --- |
| ① 保存后重开成功率 | 在测试/试用期间，至少有一次确认保存且再次打开的笔记中，内容哈希与上次已保存版本一致的比例 | `save_succeeded(revision,hash)` + `note_reopened(revision,hash)`；分子为匹配次数，分母为有对应重开事件的次数 | 可靠性发布门槛；无重开样本时显示“样本不足” |
| ② 7 日书写回访率 | 首次有效书写的本地安装中，第 7 天（以本地日期，允许 ±1 天）再次完成有效书写的比例 | 本地随机 `install_id` + `edit_committed`/`save_succeeded`；只计首个有效书写日 | 观察是否愿意再用；需标样本量与试用期 |
| ③ 导出完成率 | 发起导出后，成功生成目标文件的任务比例 | `export_started(task_id)`、`export_succeeded(task_id)`/`export_failed(task_id)`；同任务只算一次 | 发现交付流程故障；导出未实现前不展示数值 |

辅助：核心功能使用率按 `pen/highlighter/eraser/selection/page/image` 的有效提交用户数除以同周期有效书写用户数；漏斗为 `note_created → edit_committed → save_succeeded → note_reopened → export_succeeded`。留存、转化只针对**试用用户行为**，不虚构付费转化。

## 事件最小契约（计划实现）

公共字段：`event_name`、`schema_version=1`、本地时间与时区、`session_id`、随机本地 `install_id`、`app_version`、`task_id?`、`result?`。笔记只用一次性匿名 `note_session_id` 关联本次流程；**不记录标题、标签、目录、笔迹坐标、图片、截图、音频、文件路径或原始错误堆栈**。故障用固定 `error_code`。

| 事件 | 触发点 | 允许的附加字段 |
| --- | --- | --- |
| `note_created` | 索引与文档都确认提交后 | `source=button/shortcut` |
| `edit_committed` | 一次用户编辑动作进入文档历史 | `tool`、`page_count_bucket` |
| `save_started` / `save_succeeded` / `save_failed` | 存储层提交开始/完成/失败 | `revision`、内容哈希仅留本地、`error_code` |
| `note_reopened` | 读到既有文档并完成校验后 | `recovered`、`revision`、本地内容哈希 |
| `export_started` / `export_succeeded` / `export_failed` | 用户发起/完成/失败 | `format=pdf/png/native`、`page_count_bucket`、`error_code` |

目前文档格式没有 `revision`；先完成索引/文档一致性设计，再接入指标。开发和自动化数据必须从统计中排除。若未来上传事件，默认关闭、提供开关与删除/停用路径，并在发布资料中准确说明数据流。

## 数据看板最小形态

先用本地开发看板或测试报告显示：周书写天数分布、三项指标的分子/分母、按应用版本和设备/DPI 的错误分布、数据更新时间。门槛值在首轮真实数位板基准和 5–8 位试用者观察后填写；当前不制造百分比目标。
