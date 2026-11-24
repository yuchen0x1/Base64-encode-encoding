# 极客工具箱升级交付报告

历史基线：2026-11-16（Asia/Shanghai），`v0.0.7`。
本次候选：2026-11-24（Asia/Shanghai），`v0.1.0`。
分支：从 `main` 创建 `upgrade/comprehensive-v0.1.0`，以 Pull Request 合并并发布 `v0.1.0`。
工作树：保留并整合用户已有变更，不使用硬重置丢弃内容。

## v0.1.0 交付摘要

本轮对 0.0.12 基线做功能扩展、代码质量提升与安全加固。核心变化包括：离线二维码识别、JWT HS256 本地验签、JSON 树/路径/差异/类型、颜色多格式双向转换、全局命令面板和最近使用、21 款工具懒加载、Electron 45.4.1 升级、IPC/导航/CSP 收紧，以及依赖、发布健康、文档和安装生命周期门禁修复。

本地验证：285 项 Vitest 全通过；ESLint 0 error / 0 warning；Vite 构建成功；`npm audit --audit-level=low` 0 vulnerabilities；桌面 `file://` 沙箱烟测、更新助手真实运行时烟测和 CLI 烟测通过。真实 Windows 安装、旧版覆盖升级和代码签名不以本地构建替代，按 PR CI 与 Release 工作流结果记录。

新增审计证据见 [安全审计报告](SECURITY_AUDIT_REPORT.md) 和 [性能报告](PERFORMANCE_REPORT.md)；完整发布说明见 [发布历史](docs/releases/release-notes.md)。

## 历史基线

## 1. 结论摘要

本轮完成了真实项目扫描、15 个严格开源源码项目研究、56 项升级路线、多个 P1/P2 代码修复和 Windows NSIS 打包复验。项目通过本地测试、lint、Vite 构建、Electron 桌面烟测、更新助手检查和官方 npm 审计；`v0.0.7` 的远程 Actions 与公开 Release 也已完成核验。代码签名、隔离安装升级、macOS/iOS 和线上安全审计仍没有被虚报为完成。He3 与 HTTPie Desktop 作为许可证/源码开放性补充对照，不计入 15 个严格开源样本。

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
| EV-030 | PLANNED | SHA-256/可选 Authenticode 不等同签名清单 |
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
| EV-052 | BLOCKED | 需要旧版安装包、签名/隔离环境和真实安装验证 |
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
| Windows NSIS 包（本地成功构建） | PASS | 2026-11-16 21:17 生成 `GeekToolbox-Setup-0.0.6.exe`；SHA-256 `C94182B05003A072EC5EE7F791ED72A8077F489BC080C41EA1D59944B3F17A3C`；未配置代码签名 |
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
- 剩余生产级工作集中在磁盘空间预检、IPC sender 校验、签名清单、真实安装更新和远程发布。

## 7. 下一阶段最值得做的五件事

1. EV-031：补充更新前磁盘空间预检和更完整的下载恢复演练。
2. EV-029/030：IPC sender 校验和签名清单。
3. EV-001/002/003：批处理配方迁移、暂停恢复和失败重试。
4. EV-041/043/052：把 desktop/browser smoke 接入 CI，并在隔离环境做真实安装/回滚。
5. EV-034/051：生成依赖许可证清单和 SBOM，并建立供应链门禁。

## 8. 交付边界

本报告完成本地可执行范围内的修复、证据整理和 v0.0.7 远程发布核验。安装包仍未签名，真实旧版覆盖安装、回滚和完整自动更新闭环需要隔离环境继续验收；这些边界不因 Release 已公开而改变。
