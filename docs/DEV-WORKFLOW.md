# 开发与 Git 约定

更新日期：2026-11-25。适用于当前小团队或个人开发。远端仓库和 CI 建立后再补保护规则。

## 每个改动的顺序

1. 从[产品基线](PRODUCT-BASELINE.md)和[PRD](PRD-MVP.md)确认任务与验收条件；发现需求变更先改文档。
2. 建一个小分支，单次聚焦一个可验证目标。命名：`feat/<短名>`、`fix/<短名>`、`docs/<短名>`、`chore/<短名>`；小写英文与短横线，例如 `fix/storage-recovery`。
3. 改代码与必要测试。数据格式/IPC 变化同步改[技术文档](TECHNICAL-SPEC.md)，UI 行为变化同步改[交互文档](UX-SPEC.md)。不要为每个提交写一篇新报告。
4. 至少运行 `npm run build`、`npm run lint`，再运行受影响的 `scripts/check-*.mjs`；真实设备能力必须附设备、驱动、DPI 与操作记录。
5. 提交前看 diff，避免 `node_modules/`、`out/`、`dist/`、用户数据、密钥或真实屏幕截图入库。提交信息建议 `feat: ...`、`fix: ...`、`docs: ...`。
6. 合回 `main` 前核对 PRD 验收项和[缺陷表](QA-RELEASE.md)。发布版打 tag，例如 `v1.0.0`；每个 tag 对应安装包和回滚资料。

## 单人开发的轻量规则

- `main` 保持能构建；未完成的实验放分支或显式实验入口。
- 不在同一提交混合存储迁移、画布性能与视觉调色。
- 优先修复 S0/S1 和数据恢复，再加功能。
- 当前仓库没有远端 URL、CI、发布签名或正式版本发布记录；这些需要在确定托管平台与分发方式后设置。

## 维护记录

- 当前交互的入口和边界更新到 [UX-SPEC](UX-SPEC.md)，当前落盘路径、文件与用户数据变化更新到 [TECHNICAL-SPEC](TECHNICAL-SPEC.md)。讨论中的方案标注待实现。
- 复现问题、验收脚本、打包产物、未测设备与升级路径更新到 [QA-RELEASE](QA-RELEASE.md)。注明验证的是源码运行版、解包版还是覆盖安装版。旧阶段报告保留当时证据。
- Windows 候选构建完成后，按改动选择回归脚本，加 `LIFTINK_TEST_PACKAGED_EXE` 指向 `dist/win-unpacked/LiftInk.exe`。隔离测试资料与真实笔记。改名、改安装标识或改资料路径时把旧配置接续单独列入安装升级验收。
