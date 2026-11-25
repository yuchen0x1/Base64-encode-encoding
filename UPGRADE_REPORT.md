# 极客工具箱升级交付报告

## v0.1.2 候选报告（更新于 2026-11-25）

### A. 基线与项目盘点

- 起始 `main` / `origin/main`：`9dbf979dfbc4fc7105e4f6e438ce56e5bfa0c9d3`；起始正式版 `v0.1.1`，Tag 指向 `d62116b684eddaa87d9171e24bc692bf6ffc0bb5`。
- 候选分支：`codex/upgrade-v0.1.2`；Draft PR #21。既有 CI 基准 head 为 `1840a85fac8d86148ba48676b073922f10e73587`，本轮继续修改候选代码并补充本地证据；应用与锁文件版本统一到 `0.1.2`，正式合并、Tag 和 Release 仍待远程门禁。
- 全部 21 款工具已与组件注册表和现有测试核对；本版不增加重复工具，改进现有二维码、JSON、工作区、搜索和复制流程。
- 远端 `main` 最新 Release 仍是 `v0.1.1`；无 `v0.1.2` Tag / Release 冲突。

### B. 修复与实际效果

- QR：WASM 识别改由扫描时创建的 Worker 加载；普通工具打开/生成不创建解码 Worker。清空、替换成无效文件、组件卸载会使未完成文件读取失效；模块初始化失败停止该批次剩余任务。
- JSON：校验、美化、压缩、类型生成、结构变换、差异和 JSONPath 查询按文档大小交由 Worker；超过 1 MiB 的 Worker 故障只返回错误，不同步占用主线程。文本上限 32 MiB；树和 JSONPath 结构上限 5 MiB；支持取消与输入变更后的任务清理。美化结果增加 100,000 行预算，超长单行文档在 Worker 内拒绝并保留原输入。
- 工作区数据：增加 `schemaVersion` 和 legacy 迁移；坏 JSON、显式非法版本及未来 schema 保留原始值并暂停写入，避免用户偏好被默认值覆盖。
- 资源与剪贴板：统一延迟回收导出 Blob URL；复制统一处理空内容、权限异常和旧环境降级。
- CSP 与搜索：构建产物移除 Vite localhost WebSocket 来源；侧栏与命令面板共用 NFKC、英文别名与多词匹配。
- 更新器：公开 GitHub Release 安装包官方优先；官方失败或持续低速时并发探测 GH-Proxy 与 Range 已核验的备用线路，按探测吞吐和延迟评分排序后下载。请求省略凭据，重定向主机、Range、包体大小和 SHA-256 均经过校验，跨线路不复用临时分片。
- 文档：路线图 EV-010/018/028/039/057 已完成；候选 PR #21 的旧 Windows Actions 已验证 EV-043/052 生命周期，历史证据仍保留独立日期和范围。

### C. 竞品与许可证

在已有 15 个开源源码项目调研基础上，于 2026-11-24 通过 GitHub 仓库 API 刷新 DevToys、IT Tools、CyberChef、PowerToys、Bruno 的默认分支推送日期和 SPDX 许可证。五个仓库近 90 天均有推送记录；本版只吸收架构/交互思路，不新增依赖或复制第三方代码。详情见 [生态研究](docs/ECOSYSTEM_RESEARCH.md)。

### D. 本地质量门禁

| 检查 | 结果 |
|---|---|
| Vitest | 42 个文件 / 328 项通过 |
| ESLint | 通过 |
| Electron `file://` 烟测 | 通过：批处理 Worker、QR 按需/取消/替换竞态及 2048 × 2048 图片识别、5 MiB 多行 JSON 成功与故障保护、100,000 行美化保护；JSON-only 单行压力烟测确认超限时输入不变 |
| 更新助手烟测 | 通过：真实 helper ready handoff、EXE-only 崩溃保护、独立 runtime |
| CLI | 构建通过；5 项 smoke 测试通过 |
| `npm audit`（官方 registry，含开发依赖） | 0 vulnerabilities |
| 打包资源、文档链接与版本门禁 | 通过；47 个本地链接/图片 |
| Windows x64 NSIS 安装包 | 独立临时输出目录完成最终 0.1.2 安装包构建，111,918,875 bytes，ProductVersion `0.1.2`，SHA-256 `9C3874F0A116F020EC27D6F78C28F89A6391543273D39732BD0B028D8EE62D28`；本地候选产物，非正式 Release 资产 |
| Windows installer / PR CI | 更新前 PR head `fdc64b9` 的 Quality Gate run 45439749550 与 Windows installer run 45439749767 通过；本轮改动需推送后重新运行 |

### E. 性能实测

以下为当前 Windows Electron 隐藏窗口烟测的单次观测，不是多机基准。`startupScriptToWorkspaceMs` 从 smoke 脚本启动计时，不代表冷启动或安装后用户启动时间。

| 指标 | 测量值 | 边界 |
|---|---:|---|
| Smoke 脚本启动至工作区首屏就绪 | 611 ms | 不含 OS / Electron 冷启动前置时间 |
| JSON 样本 | 5,283,861 bytes | 多行 JSON；数组含 5,120 个 1,024 字符字符串 |
| Worker 校验 / 美化 | 307 / 78 ms | 单次本地测量；校验耗时含 120 ms debounce |
| Renderer working set：二维码识别后 / 多行 JSON 校验后 / 美化后 | 148.5 / 277 / 301.9 MiB | 同一隐藏窗口阶段快照 |
| Renderer peak working set | 322 MiB | 同一单次多行样本；不是稳定峰值基准 |
| Renderer private memory：二维码识别后 / 多行 JSON 校验后 / 美化后 | 72.1 / 199.4 / 224.9 MiB | Windows `app.getAppMetrics()` 私有内存阶段快照 |
| Renderer JS heap after validation | 19.6 MiB | Chromium heap 快照；不包含全部原生/Worker 内存 |
| Renderer CPU during formatting | 0% | 单次 Electron 采样；不代表持续负载或跨机器性能 |
| 单行长字符串 JSON 校验 | 5,242,894 bytes；private memory 270.8 MiB | 批处理烟测窗口；不执行美化 |
| JSON-only 单行数字数组 | 5,247,010 bytes；打开后 / 校验后 / 美化保护后 private memory 49.2 / 503.5 / 430.7 MiB，peak working set 514.1 MiB | 独立 renderer；美化结果未写入 textarea，错误提示与输入不变均有断言；单次观测，不是跨机器基准 |
| Node token-heavy JSON 样本 | 5,600,003 bytes | 根数组含 2,800,001 个数字 token；与上方 Electron 字符串样本分开测量 |
| Node token-heavy 格式化 / 压缩 | 744 / 1,079 ms | 单次本地 helper 观测；压缩输出与原文逐字一致，不代表 Electron UI 或跨机器耗时 |
| 入口 JS | 204,726 bytes（Vite gzip 76.30 kB） | 当前构建 |
| QR 工具主 chunk | 10.81 kB（gzip 4.62 kB） | WASM 不在该 chunk |
| QR Worker chunk | 1,299.26 kB | 识别时才加载 |
| JSON Worker chunk | 13,024 bytes（gzip -9：5,108 bytes） | Worker 运行逻辑 |

对照本地 v0.1.1 构建记录，二维码工具 chunk 从 1,308,328 bytes（gzip 537,475 bytes）移至独立 Worker；本版主线程工具 chunk 为 10,816 bytes。二维码 Worker 在首次识别时才加载，Electron 烟测用 2048 × 2048 图像验证解码正确性，但没有记录专门的扫描耗时基准；也没有同环境的 JSON Worker 前基准。此前 5,247,010 字节单行数字数组美化会把数百万行结果写入 textarea，观测到 611.5 MiB 至 3,170 MiB 的 private memory 波动；本轮加入 100,000 行预算后在 Worker 内拒绝美化，输入保持不变，最新格式化保护阶段 peak working set 514.1 MiB。单行校验仍有约 503.5 MiB private memory 的单次观测，需后续多机基准；不能将其外推为稳定上限。EV-057 的灾难性格式化路径已有回归门禁，EV-042 性能基准仍未完成。

### F. 安全与未完成事项

- 本地安全测试覆盖损坏/未来版本状态保护、生产 CSP、Worker 故障与取消、Blob 下载 URL 和既有 IPC 信任边界。
- npm 官方 registry 全依赖审计无已知漏洞；不等同于第三方渗透或模糊测试。
- 候选 PR #21 仍为 Draft。更新前 head `fdc64b9` 的 [Quality Gate run 45439749550](https://github.com/yuchen0x1/Base64-encode-encoding/actions/runs/45439749550) 中 Windows quality、三系统 CLI 和 dependency review 全部通过；Windows runner 完成 NSIS 构建和安装生命周期（[Windows installer run 45439749767](https://github.com/yuchen0x1/Base64-encode-encoding/actions/runs/45439749767)）。这些记录不覆盖本轮新提交，且不是正式 Release 资产；尚无 v0.1.2 Tag、Release、SHA-256 清单或 Attestation。
- 5 MiB 级多行 JSON Worker 流程通过；独立 JSON-only 单行压力烟测现在会拒绝超出 100,000 行预算的美化并保留输入。单行校验的约 503.5 MiB 观测仍需后续多机基准，不称为泄漏或通用上限。
- 新增代理线路探测集成测试：模拟 Range 探测显示备用线路更快时，更新器优先使用该线路；这不替代中国大陆真实网络测速。
- macOS/iOS 不在当前 Windows 产品交付范围；第三方安全测试与多机 CPU/内存基准未执行。

候选 PR #21 当前保持 Draft；本轮改动推送后需重新运行 PR 门禁和 Windows NSIS 生命周期，再按正式 Release workflow 生成并核验资产，确认旧版升级提示后补录最终 Commit、Tag、SHA-256、Attestation 与 `main` 一致性证据。尚未运行的发布步骤不标记为通过。

## v0.1.1 正式发布与生命周期核验（2026-11-24）

在已发布的 v0.1.0 基线上，本次仅增加两项窄范围修复：Electron 主窗口拒绝跨来源重定向；二维码结果缺少完整定位元数据时不再按相同文本误去重。版本元数据、README、简要变更日志和完整发布说明已同步。PR #19 已合并，`v0.1.1` 标签与正式 Release 已发布；之后仅文档 PR #20 合并到 `main`。

验证：[正式 Release run 45391803298](https://github.com/yuchen0x1/Base64-encode-encoding/actions/runs/45391803298) 中，38 个测试文件 / 285 项测试、ESLint、运行依赖审计、Electron 桌面烟测、Windows NSIS 构建、更新助手检查和三系统 CLI 烟测均通过。该 run 的 Windows 生命周期测试实际安装 `v0.1.0`、覆盖升级到 `v0.1.1`、保留 profile、在故意 payload mismatch 后恢复旧版、启动并卸载；发布资产 SHA-256 与 GitHub Release attestation 均验证通过。[PR #20 run 45393215151](https://github.com/yuchen0x1/Base64-encode-encoding/actions/runs/45393215151) 也再次通过 Windows Release Candidate 生命周期测试。主线 push build [run 45394330710](https://github.com/yuchen0x1/Base64-encode-encoding/actions/runs/45394330710) 的生命周期步骤为 skipped，不作为生命周期证据。因本地缺少 7-Zip，本机额外 NSIS 包完整性校验未执行；正式 Windows runner 的发布脚本日志确认 NSIS 归档 CRC 校验通过。

PR：[https://github.com/yuchen0x1/Base64-encode-encoding/pull/19](https://github.com/yuchen0x1/Base64-encode-encoding/pull/19)（已合并）；文档后续 PR：[https://github.com/yuchen0x1/Base64-encode-encoding/pull/20](https://github.com/yuchen0x1/Base64-encode-encoding/pull/20)（已合并）；当前 `main`：`9dbf979dfbc4fc7105e4f6e438ce56e5bfa0c9d3`；`v0.1.1` Tag 指向 `d62116b684eddaa87d9171e24bc692bf6ffc0bb5`。Release：[https://github.com/yuchen0x1/Base64-encode-encoding/releases/tag/v0.1.1](https://github.com/yuchen0x1/Base64-encode-encoding/releases/tag/v0.1.1)（2026-11-24 12:21:56 UTC）。

- Windows x64 NSIS：[GeekToolbox-Setup-0.1.1.exe](https://github.com/yuchen0x1/Base64-encode-encoding/releases/download/v0.1.1/GeekToolbox-Setup-0.1.1.exe)，111,898,806 bytes，SHA-256 `f2a0730cb22fe265d19787cae44b3347d18bdb10919b84dacbba36726451921c`。
- CLI：[GeekToolbox-CLI-0.1.1.mjs](https://github.com/yuchen0x1/Base64-encode-encoding/releases/download/v0.1.1/GeekToolbox-CLI-0.1.1.mjs)，SHA-256 `cebf0a5ffbcc7236e79da388fd88822da529c03b8f055e43f3eb0d2f4e60536e`。

以下 `历史基线` 及其下的审计、EV 状态和测试表是对应旧版本/执行日期的记录快照，保留当时的范围和结果；它们不是当前路线状态。当前 EV 状态以 [升级路线图](UPGRADE_ROADMAP.md) 为准。

历史基线：2026-11-16（Asia/Shanghai），`v0.0.7`。
本次候选：2026-11-24（Asia/Shanghai），`v0.1.0`。
分支：从 `main` 创建 `upgrade/comprehensive-v0.1.0`，以 Pull Request 合并并发布 `v0.1.0`。
工作树：保留并整合用户已有变更，不使用硬重置丢弃内容。

## v0.1.0 交付摘要

本轮对 0.0.12 基线做功能扩展、代码质量提升与安全加固。核心变化包括：离线二维码识别、JWT HS256 本地验签、JSON 树/路径/差异/类型、颜色多格式双向转换、全局命令面板和最近使用、21 款工具懒加载、Electron 45.4.1 升级、IPC/导航/CSP 收紧，以及依赖、发布健康、文档和安装生命周期门禁修复。

历史本地验证记录：285 项 Vitest 全通过；ESLint 0 error / 0 warning；Vite 构建成功；`npm audit --audit-level=low` 0 vulnerabilities；桌面 `file://` 沙箱烟测、更新助手真实运行时烟测和 CLI 烟测通过。Windows 安装生命周期与发布资产来源/完整性以本报告顶部列出的 PR / Release workflow 记录为准。

新增审计证据见 [安全审计报告](SECURITY_AUDIT_REPORT.md) 和 [性能报告](PERFORMANCE_REPORT.md)；完整发布说明见 [发布历史](docs/releases/release-notes.md)。

## 历史基线

## 1. 结论摘要

本轮完成了真实项目扫描、15 个严格开源源码项目研究、56 项升级路线、多个 P1/P2 代码修复和 Windows NSIS 打包复验。项目通过本地测试、lint、Vite 构建、Electron 桌面烟测、更新助手检查和官方 npm 审计；`v0.0.7` 的远程 Actions 与公开 Release 也已完成核验。隔离安装升级、macOS/iOS 和线上安全审计没有被虚报为完成。He3 与 HTTPie Desktop 作为许可证/源码开放性补充对照，不计入 15 个严格开源样本。

本轮实际落地的重点是：

- 将五个工具的副作用 computed 改为纯派生状态，`npm run lint` 从 10 条 warning 降为 0 warning。
- 修复 AES CBC/ECB + `NoPadding` 对非 16 字节明文产生不可回读密文的问题。
- 给图片文件/DataURL 增加 16 MiB 解码上限，给工作区 JSON 增加 1 MiB 上限。
- 给 Unix 时间戳增加安全整数和毫秒乘法范围校验。
- 生产打包运行时拒绝明文 HTTP 更新源；开发环境仍可显式使用。
- 更新下载增加 512 MiB 上限、30 秒无响应超时、取消 IPC、半包清理和可重试行为。
- 增加工具注册表 schema 错误收集与测试，并加入 Windows 单实例锁和二次启动聚焦。
- 给 Windows 标签页增加 `role=tab`、焦点顺序、Enter/Space 和左右方向键；目录弹窗补充 dialog 语义和关闭标签。
- 恢复当前 `package.json` 所引用的 NSIS 脚本和 Windows 图标；修复图标脚本对旧版 Pillow 的兼容性。

## 2. 竞品研究

实际研究项目数：**15 个**。

研究对象：IT Tools、CyberChef、DevToys、Hoppscotch、Bruno、Jisuxiang、ut、Insomnia、Requestly/interceptor、PowerToys、Files、The Book of Secret Knowledge、JSON Crack、HTTPie CLI、Open Dev；He3 与 HTTPie Desktop 作为补充对照。仓库链接、许可证记录、检查范围和采用/不采用决定见 [COMPETITOR_ANALYSIS.md](COMPETITOR_ANALYSIS.md)。

最值得借鉴的技术/产品方向：

1. IT Tools 的独立工具边界和注册模型。
2. CyberChef 的 recipe、Worker 和可组合数据契约。
3. DevToys/PowerToys/Files 的 Windows 桌面发现、快捷键、标签、安装和错误恢复。
4. Hoppscotch/Bruno 的工作区边界和本地文件化状态。
5. JSON Crack 的大 JSON 路径发现方向。

没有直接移植第三方代码；GPL/AGPL 或许可证未确认的项目只用于思路对照，具体依赖引入必须重新核对许可证和维护状态。

## 3. EV 完成状态

| EV | 状态 | 本轮证据或未完成原因 |
|---|---|---|
| EV-001 | PLANNED | 需要 recipe schema v1→v2 迁移 |
| EV-002 | PLANNED | 需要 Worker 可暂停游标 |
| EV-003 | PLANNED | 需要错误分类和退避 |
| EV-004 | PLANNED | 需要结果快照和恢复协议 |
| EV-005 | PLANNED | 需要扩充并测试批处理操作 |
| EV-006 | PLANNED | 需要选择并审计本地二维码解码依赖 |
| EV-007 | PLANNED | 当前颜色工具仍以 HEX 为主 |
| EV-008 | PLANNED | 当前 JWT 解析明确不验签 |
| EV-009 | PLANNED | 需要 Web Crypto 密钥输入和算法契约 |
| EV-010 | PLANNED | 需要大 JSON Worker/路径模型 |
| EV-011 | PLANNED | 需要方言 fixture 和格式化契约 |
| EV-012 | PARTIAL | `toolHelpers.js`/`ToolImageBase64.vue` 已有 16 MiB 文件/解码限制和 atob 前预检；SVG 活动内容策略待补 |
| EV-013 | PARTIAL | 已有 tab 语义/键盘切换；焦点恢复和完整关闭流程待补 |
| EV-014 | PARTIAL | 目录 dialog 语义已补；更新/反馈弹窗焦点陷阱和 live 审计待补 |
| EV-015 | PLANNED | 当前 Ctrl/Cmd+K 只有聚焦搜索框 |
| EV-016 | PLANNED | 当前没有独立最近使用列表 |
| EV-017 | PLANNED | 需要统一工具 reset/undo composable |
| EV-018 | PARTIAL | 现有复制反馈保留；全局降级和权限错误统一待补 |
| EV-019 | PARTIAL | 已有桌面/移动 smoke；1024×768 基准待接入 |
| EV-020 | PLANNED | 需要系统偏好和对比度量化 |
| EV-021 | PARTIAL | 已有检查/下载/ready/error、重试、Range 和取消按钮；完整错误码与断网演练待补 |
| EV-022 | PLANNED | 当前导入直接替换状态，无差异预览 |
| EV-023 | PARTIAL | 已有 schema、分类、tags、重复 ID、组件连线错误收集器和测试；生产/CI 硬门禁待接入 |
| EV-024 | PLANNED | 当前主 JS 约 363 kB，尚未工具懒加载 |
| EV-025 | PLANNED | 纯 computed 修复尚未抽成公共 composable |
| EV-026 | PLANNED | 尚无独立工具渲染错误边界 |
| EV-027 | PLANNED | 核心模块仍为 JavaScript，未纳入类型检查 |
| EV-028 | PLANNED | 备份有 schema，localStorage 运行时 schema 迁移待补 |
| EV-029 | PLANNED | 需要 IPC sender/通道白名单测试 |
| EV-031 | PARTIAL | 已有 512 MiB 硬上限、30 秒无响应超时、AbortController 取消、IPC 取消和半包清理；剩余空间检查待补 |
| EV-032 | COMPLETED | `requestSingleInstanceLock`、二次启动退出和已有窗口 restore/show/focus 已实现并有 3 项专项测试 |
| EV-033 | PLANNED | 需要日志分级和字段脱敏 |
| EV-034 | PLANNED | 需要 SPDX/NOTICE 归档和许可证门禁 |
| EV-035 | PARTIAL | 官方 npm registry 审计返回 0 vulnerabilities；lockfile/registry/Node 版本门禁仍待接入，默认镜像安全接口仍 404 |
| EV-036 | PLANNED | 需要大消息分片和背压 |
| EV-037 | PLANNED | Worker 有 500ms 超时，输入上限/复杂度门禁待补 |
| EV-038 | PLANNED | 尚无有界 LRU 计算缓存 |
| EV-039 | PLANNED | 需要统一 Blob/DataURL 生命周期审计 |
| EV-040 | PLANNED | 更新状态迁移尚未表驱动化 |
| EV-041 | PLANNED | smoke 脚本存在但未全部接入 CI |
| EV-042 | PLANNED | 尚无稳定性能基准脚本 |
| EV-043 | BLOCKED | 需要隔离 Windows 安装目录和失败回滚环境 |
| EV-044 | COMPLETED/PARTIAL | computed lint warning 已归零；官方 npm registry 审计返回 0 vulnerabilities，默认镜像 security endpoint 仍 BLOCKED |
| EV-045 | PLANNED | 收藏仍是扁平列表 |
| EV-046 | PLANNED | 尚无内置/用户 recipe 模板库 |
| EV-047 | PLANNED | 拖拽入口未统一 |
| EV-048 | PLANNED | 文案尚未抽离 i18n |
| EV-049 | PLANNED | 尚无帮助/快捷键面板 |
| EV-050 | PARTIAL | 当前没有遥测；需持续用网络审计和文档固定边界 |
| EV-051 | PLANNED | 当前有 SHA/清单，缺 SBOM/许可证归档 |
| EV-052 | BLOCKED | 需要旧版安装包、隔离环境和真实安装验证 |
| EV-053 | PLANNED | 版本/CHANGELOG/EV 自动门禁待补 |
| EV-054 | PLANNED | 尚无文档路径/截图 CI 检查 |
| EV-055 | PLANNED | 尚无结构化 issue 模板 |
| EV-056 | PLANNED | 需要定期 30/90 天竞品监测 |

统计：56 项路线；完整完成 1 项（EV-032）；部分完成 11 项（含 EV-044 的 lint 子项已完成、audit 子项仍 BLOCKED）；尚未完成 44 项（`PLANNED` 42 项、`BLOCKED` 2 项）。

## 4. 代码和配置改动

### 本轮新增或修改

- [PROJECT_AUDIT.md](PROJECT_AUDIT.md)：当前项目档案、架构、缺陷、成熟度和基线。
- [COMPETITOR_ANALYSIS.md](COMPETITOR_ANALYSIS.md)：15 个项目的证据化对标和采用决策。
- [UPGRADE_ROADMAP.md](UPGRADE_ROADMAP.md)：EV-001 至 EV-056，含优先级、文件范围和验收标准。
- [UPGRADE_REPORT.md](UPGRADE_REPORT.md)：本交付报告。
- `src/components/tools/ToolAes.vue`、`ToolBase64.vue`、`ToolCipher.vue`、`ToolColor.vue`、`ToolUrl.vue`：纯化 computed 错误态。
- `src/components/tools/aesTool.js`：新增 `validateAesPayload`，阻止 CBC/ECB + `NoPadding` 非整块明文。
- `src/components/tools/ToolImageBase64.vue`、`src/utils/toolHelpers.js`：16 MiB 图片边界、atob 前长度预检和无填充 Base64 测试。
- `src/utils/timestamp.js`、`ToolTimestamp.vue`：安全整数时间戳解析。
- `src/utils/appState.js`、`src/App.vue`：工作区备份 1 MiB 限制。
- `src/App.vue`：tablist/tab 语义、键盘切换和目录 dialog 语义。
- `electron/updater.js`：打包运行时拒绝明文 HTTP 更新源。
- `electron/updater.js`、`electron/preload.cjs`、`src/composables/useUpdater.js`、`src/components/UpdateModal.vue`：更新包 512 MiB 上限、30 秒无响应超时、取消 IPC、半包清理和取消按钮。
- `electron/updater.js`、`tests/updater.test.js`：生产 HTTP 更新源拒绝测试。
- `electron/main.js`、`electron/single-instance.js`：Windows 单实例锁、二次启动聚焦和 macOS activate 行为保留。
- `src/config/registry.js`、`tests/registry.test.js`：工具注册表 schema 与连线错误收集器。
- `scripts/generate-icons.py`：兼容没有 `Image.Resampling`/`rounded_rectangle` 的旧版 Pillow。
- `build/installer.nsh`、`build/icon.ico`、`build/icon.png`：恢复当前打包配置实际需要的资源。
- 新增/扩展测试：AES、图片大小/无填充 Base64、时间戳、工作区大小、注册表 schema、单实例、更新源安全边界、更新包大小/取消/重试。

### 用户已有变更

当前工作树还包含本轮开始前就存在的 README、CHANGELOG、CI、Electron、更新器、批处理、原生平台删除和发布文件变更；本报告不把它们重新归因给本轮，也没有重置它们。

## 5. 最终验证

以下是本轮最后一轮执行的本地检查：

| 检查 | 状态 | 证据/限制 |
|---|---|---|
| Vitest | PASS | 29 个测试文件、221 个测试全部通过 |
| ESLint | PASS | 0 error、0 warning |
| Vite build | PASS | Vite 8.3.6，1885 modules |
| 更新助手 | PASS | `npm run test:updater` 三项运行时检查通过 |
| Electron 目录构建（成功构建） | PASS | `release/win-unpacked` 已生成 |
| Electron 目录构建（最后重跑） | BLOCKED | electron-builder 外部下载阶段长时间无输出，因网络阻塞中止；已有成功目录产物保留 |
| Windows NSIS 包（本地成功构建） | PASS | 2026-11-16 21:17 生成 `GeekToolbox-Setup-0.0.6.exe`；SHA-256 `C94182B05003A072EC5EE7F791ED72A8077F489BC080C41EA1D59944B3F17A3C` |
| Windows NSIS 包（最后重跑） | BLOCKED | electron-builder 外部下载阶段 `connect ETIMEDOUT 20.205.243.166:443`；已有成功产物未被删除 |
| npm audit（官方 registry） | PASS | `npm audit --registry=https://registry.npmjs.org --omit=optional --audit-level=moderate` 返回 `found 0 vulnerabilities` |
| npm audit（默认镜像） | BLOCKED | `registry.npmmirror.com` security endpoint 返回 404；需修复镜像或固定官方 registry |
| Electron 桌面烟测 | PASS | `npm run test:desktop` 完成 file:// 沙箱 renderer、批处理和无控制台错误检查 |
| 浏览器/完整 E2E | PARTIAL | 现有浏览器 smoke 脚本仍未全部接入 CI；本轮未虚报为完整覆盖 |
| 真实安装替换/回滚 | BLOCKED | 需要隔离安装目录和旧版客户端 |
| 远程 Actions/Release | PASS | 提交 `919e3cb` 的 Quality Gate `43881164180`、Build Windows Installer `43881164142` 和 v0.0.7 Publish GitHub Release `43881893716` 均成功；公开 Release 含 `GeekToolbox-Setup-0.0.7.exe`（111,447,975 bytes）与 `version.json`，清单 SHA-256 与 GitHub 资产摘要一致 |
| iOS/macOS | BLOCKED | Windows 环境无 Xcode/macOS |

## 6. 升级前后状态

### 升级前

- 本地工具箱主流程可用，工作区/批处理/更新器已有较多代码。
- 五个工具存在 computed 副作用 lint warning。
- AES `NoPadding` 边界会产生自相矛盾的加密/解密契约。
- 时间戳、工作区、图片输入缺少明确大小/精度边界。
- 标签页键盘操作和目录 dialog 语义不足。
- 审计起始时工作树缺少 package 配置引用的 NSIS 脚本，`npm run package:win` 在 NSIS 阶段失败；本轮已恢复脚本并加入资源门禁，最终打包通过。

### 升级后

- 纯计算状态和边界测试通过，lint warning 归零。
- 资源输入有 16 MiB 图片和 1 MiB 工作区边界；时间戳不再接受不安全整数。
- 生产更新源拒绝 HTTP，标签页和目录弹窗有基础键盘/ARIA 语义。
- NSIS 脚本和图标已恢复，Windows 安装包本地生成成功。
- 剩余生产级工作集中在磁盘空间预检、IPC sender 校验、真实安装更新和远程发布。

## 7. 下一阶段最值得做的五件事

1. EV-031：补充更新前磁盘空间预检和更完整的下载恢复演练。
2. EV-029：IPC sender 校验。
3. EV-001/002/003：批处理配方迁移、暂停恢复和失败重试。
4. EV-041/043/052：把 desktop/browser smoke 接入 CI，并在隔离环境做真实安装/回滚。
5. EV-034/051：生成依赖许可证清单和 SBOM，并建立供应链门禁。

## 8. 交付边界

本历史报告记录当时本地可执行范围内的修复、证据整理和 v0.0.7 远程发布核验。真实旧版覆盖安装、回滚和完整自动更新闭环需要隔离环境继续验收；这些边界不因 Release 已公开而改变。
