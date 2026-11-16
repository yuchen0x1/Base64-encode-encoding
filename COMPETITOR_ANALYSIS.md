# 开源竞品与相邻项目对标

研究日期：2026-11-16（Asia/Shanghai）  
研究方式：打开 GitHub 官方仓库主页、README、目录和公开 Release/Commit/Issue 页面，结合当前项目源码核对；没有复制第三方代码，也没有把 README 宣传语当作本项目已实现能力。仓库链接均指向公开源项目。

## 1. 研究项目清单（15 个严格开源样本 + 2 个补充对照）

| 项目 | 仓库 | 领域 | 许可证记录 | 实际检查与可借鉴点 | 对本项目的影响 |
|---|---|---|---|---|---|
| IT Tools | [CorentinTh/it-tools](https://github.com/CorentinTh/it-tools) | Vue 开发工具集合 | GPL-3.0 | 工具目录、独立工具组件、路由/元数据、测试与自托管说明 | 借鉴注册表和工具边界；不直接复制 GPL 代码 |
| CyberChef | [gchq/CyberChef](https://github.com/gchq/CyberChef) | 离线数据处理工作台 | Apache-2.0 | `src/core`、操作链/recipe、Worker 和离线部署 | 将多步骤配方列为高价值路线；先保持现有 1–8 步批处理 |
| DevToys | [DevToys-app/DevToys](https://github.com/DevToys-app/DevToys) | Windows 原生开发者工具箱 | MIT | 工具发现、分类、桌面窗口、扩展包和本地优先体验 | 借鉴桌面工作台和工具发现；不迁移 .NET 架构 |
| Hoppscotch | [hoppscotch/hoppscotch](https://github.com/hoppscotch/hoppscotch) | Web/API 工作台 | MIT | Web/PWA/桌面/CLI 分层、工作区导航和状态组织 | 借鉴工作台信息架构；不引入云端 API 客户端范围 |
| Bruno | [usebruno/bruno](https://github.com/usebruno/bruno) | 本地优先 API 客户端 | MIT（仓库记录） | 文件化集合、离线工作流、桌面壳和环境配置边界 | 借鉴版本化工作区导入导出，不引入请求执行器 |
| 极速箱 Jisuxiang | [star7th/jisuxiang](https://github.com/star7th/jisuxiang) | 中文 Web 工具集合 | Apache-2.0（按当前仓库记录） | 中文命名、分类、常用开发小工具集合 | 借鉴本地化文案和分类；不复制实现 |
| ut | [ksdme/ut](https://github.com/ksdme/ut) | Rust 本地工具箱 | MIT | 轻量本地执行、无云依赖、工具模块组织 | 用作启动和资源占用的相邻对照 |
| Insomnia | [Kong/insomnia](https://github.com/Kong/insomnia) | API 调试工作台 | Apache-2.0（按仓库 LICENSE） | 请求/环境/插件/桌面工作流和错误反馈 | 只借鉴状态反馈和可恢复操作，不改变本地离线定位 |
| Requestly interceptor | [requestly/interceptor](https://github.com/requestly/interceptor) | 请求调试与规则工具 | AGPLv3（`ee/` 另核许可证） | 规则模型、调试反馈、扩展/浏览器集成 | 仅借鉴规则可视化；不直接移植 AGPL 代码 |
| PowerToys | [microsoft/PowerToys](https://github.com/microsoft/PowerToys) | Windows 系统工具集合 | MIT | Windows 原生设置、全局快捷键、模块化发布和安装体验 | 借鉴 Windows 窗口/快捷键/发布细节 |
| Files | [files-community/Files](https://github.com/files-community/Files) | Windows 文件管理器 | MIT | 导航、标签、键盘操作、空状态和高 DPI 桌面布局 | 借鉴标签与可访问性；不扩张为文件管理器 |
| The Book of Secret Knowledge | [trimstray/the-book-of-secret-knowledge](https://github.com/trimstray/the-book-of-secret-knowledge) | 开发者知识/命令目录 | MIT | 分类索引、知识发现、内容维护方式 | 仅作目录内容参考，不把静态清单伪装成本地工具 |
| JSON Crack | [AykutSarac/jsoncrack.com](https://github.com/AykutSarac/jsoncrack.com) | JSON 可视化工具 | Apache-2.0（按仓库 LICENSE） | JSON 解析后的可视化、路径发现和大文档体验 | 作为 JSON 工具的后续可视化方向，不复制 UI 代码 |
| HTTPie CLI | [httpie/cli](https://github.com/httpie/cli) | HTTP 命令行工具 | BSD-3-Clause | JSON/颜色/会话/下载/插件和 CLI 输出设计 | 借鉴输出层级和可脚本化边界，不引入网络功能 |
| Open Dev | [Jamalianpour/open-dev](https://github.com/Jamalianpour/open-dev) | 跨平台本地工具箱 | MIT | 单一工具注册表、命令面板、Favorites/Recent、本地无遥测 | 借鉴统一 registry 和命令入口，不复制 Flutter 代码 |

补充对照（不计入严格开源样本）：He3 `tools-example` 的根目录许可证需要再次核对；HTTPie Desktop 主要是官方发布物仓库，不能把它的发布资产当作开源源码证据。

## 2. 证据等级

- **A：源码和仓库结构可直接核对。** IT Tools、CyberChef、DevToys、Hoppscotch、Bruno、PowerToys、Files、Open Dev。
- **B：仓库和 README/公开发行信息已核对，具体实现仍需按版本深入。** Insomnia、HTTPie CLI、Requestly、JSON Crack、ut。
- **C：许可证或长期维护状态需要在引入前再次核对。** He3 和部分目录型项目。

竞品的星数、Release 和近期提交会变化，因此本文件不把实时星数写成稳定产品指标；路线只采用能由仓库源码、工作流、文档或公开版本记录支撑的能力。

### 1.1 重点仓库的近期核查补充

为避免只凭项目介绍下结论，本轮对重点仓库的源码目录、公开 Release/Commit 和许可证入口做了二次核对：

| 仓库 | 当前核查到的实现/维护证据 | 许可证与采用边界 |
|---|---|---|
| [IT Tools releases](https://github.com/CorentinTh/it-tools/releases) | Vue/TypeScript 工具集合；有 `src/tools`、`locales`、工具脚手架目录和自托管说明；公开版本记录包含 Regex Tester、JSON↔XML、Base64 等工具演进 | GPL-3.0；只借鉴注册/脚手架思路，不复制源码 |
| [CyberChef releases](https://github.com/gchq/CyberChef/releases) | `src`/`tests`、操作列表→recipe→输入输出、Auto Bake、断点执行、recipe deep-link、客户端处理大文件；公开版本已到 v11.5.0 | Apache-2.0；适合重写 recipe 契约 |
| [DevToys releases](https://github.com/DevToys-app/DevToys/releases) | C# 桌面工具箱；README 列出约 30 个默认工具、Smart Detection 和扩展；公开预发布包含扩展安装漏洞修复 | MIT；只借鉴扩展边界、剪贴板识别和桌面体验 |
| [Hoppscotch releases](https://github.com/hoppscotch/hoppscotch/releases) | Web/Desktop/CLI/PWA 生态；collections、workspaces、environments、脚本、测试和多协议入口；`packages` monorepo | MIT；只借鉴工作区/状态组织 |
| [Bruno releases](https://github.com/usebruno/bruno/releases) | offline-only API IDE；collection 直接保存文件系统，以纯文本 Bru 格式参与 Git，另有 CLI/CI | MIT；适合借鉴 file-first 工作区，不引入 API 执行 |
| [He3 tools-example](https://github.com/he3-app/tools-example) | 按目录拆分 AES/Base64/JWT/JSON/批处理/图片等工具；`meta.locale.json`/`package.json` 有 id、版本和 i18n 元数据，约 220 commits | 根目录未看到明确 LICENSE；只作结构参考，不能直接移植 |
| [JiSuXiang](https://github.com/star7th/jisuxiang) | Next.js + Tailwind；工具路由、分类配置、搜索、收藏、中英 i18n、暗色和 Docker 多架构 | Apache-2.0；只借鉴配置驱动目录和本地化 |
| [ut releases](https://github.com/ksdme/ut/releases) | Rust 单二进制 CLI；覆盖 Base64/URL/hash/JWT/UUID/regex/时间/IP/HTTP/QR，支持 stdin/文件、completion；公开 v0.7.0 含多平台二进制和 checksum | MIT；可作 CLI/核心算法和发布校验对照 |
| [Insomnia releases](https://github.com/Kong/insomnia/releases) | Electron monorepo；REST/GraphQL/WebSocket/SSE/gRPC、OpenAPI、测试套件、CLI、插件和 Local Vault/Git/Cloud 存储后端 | Apache-2.0；只借鉴存储后端抽象和错误反馈 |
| [Requestly interceptor](https://github.com/requestly/interceptor) | 真正可审计的开源实现包含扩展、Web app、规则引擎和本地/云 mock；支持重定向、请求/响应头体覆盖和 JS 注入 | 主体 AGPLv3，`ee/` 另有许可证；不直接移植 |
| [PowerToys releases](https://github.com/microsoft/PowerToys/releases) | Windows 模块化工具集；30+ utilities、Command Palette、Color Picker、Workspaces、installer；公开 v0.102.3101.0 | MIT（第三方依赖另计）；借鉴 Windows 发布和快捷键 |
| [Files releases](https://github.com/files-community/Files/releases) | Windows 文件管理器；标签、深度集成、多任务、`src`/`tests`；公开 v4.3 | `LICENSE-MIT` + `LICENSE-MPL`；只借鉴交互，不复制文件边界代码 |
| [The Book of Secret Knowledge](https://github.com/trimstray/the-book-of-secret-knowledge) | README 按 lists/manuals/cheatsheets/one-liners/Web tools 组织，超过千次提交，适合参考维护型知识索引 | MIT；只引用目录组织思路 |
| [JSON Crack releases](https://github.com/AykutSarac/jsoncrack.com/releases) | JSON/YAML/XML/CSV 可视化、Schema、jq/JSONPath、代码生成和图片导出；`apps` + `packages/jsoncrack-react` monorepo；公开 v5.0.0 | Apache-2.0；只借鉴 JSON 路径/可视化方向 |
| [HTTPie CLI releases](https://github.com/httpie/cli/releases) | 作为 HTTPie Desktop 的开源补充样本：JSON/颜色/会话/下载/插件，公开 v3.2.4 和多次提交 | BSD-3-Clause；可作 CLI 输出参考 |
| [Open Dev](https://github.com/Jamalianpour/open-dev) | Flutter 跨平台本地工具箱；`lib/utils/tool_registry.dart` 作为单一注册表，README 列出 27 个工具、命令面板、Favorites/Recent 和无遥测说明 | MIT；借鉴 registry、命令入口和本地隐私边界，不复制 Flutter 代码 |

严格按“可审计的开源源码仓库”计数，上表的 15 个源码项目为 IT Tools、CyberChef、DevToys、Hoppscotch、Bruno、JiSuXiang、ut、Insomnia、Requestly interceptor、PowerToys、Files、The Book of Secret Knowledge、JSON Crack、HTTPie CLI、Open Dev。He3 `tools-example` 和 HTTPie Desktop 只作补充对照，不计入 15 个开源样本。

## 3. 重点对标

### 3.1 IT Tools：工具边界和注册模型

- 对方优势：工具按独立模块组织，目录与路由关系清晰，适合持续增加小工具。
- 原因：工具元数据、组件、测试和文档有明确边界，单工具不会把所有状态塞进主页面。
- 我方现状：已经有 `src/config/tools.js` + `src/config/registry.js` 单一映射和 21 个组件；这一点是当前优势。
- 差距：注册表 schema 校验仍不够严格，工具状态和公共剪贴板/错误反馈尚未统一成 composable。
- 采用决策：保留自己的 Vue/Electron 架构；实施 EV-023、EV-025、EV-044；不复制 GPL-3.0 源码。

### 3.2 CyberChef：可组合的数据处理

- 对方优势：操作可以组成 recipe，用户能看到每一步输入输出和顺序。
- 原因：操作有统一数据契约，执行器负责流水线、错误定位和大输入处理。
- 我方现状：批处理已有 1–8 步 Worker 配方、停止、分页和导出，是可迁移的基础。
- 差距：当前配方 schema、暂停恢复、失败重试和模板库不完整；工具间类型契约仍是隐式的。
- 采用决策：先完成 EV-001/002/003/036/046；不直接复制 CyberChef 操作实现。

### 3.3 DevToys：Windows 桌面发现和可访问性

- 对方优势：桌面工具发现、分类、快捷入口和系统窗口体验成熟。
- 原因：产品围绕桌面键盘、窗口尺寸、高 DPI 和本地设置设计，而不是把网页套进窗口。
- 我方现状：当前窗口、侧栏、标签、搜索和主题已按 Windows 桌面使用设计，且产品定位明确为 Windows x64。
- 差距：标签页原先不可键盘操作；设置、焦点恢复、单实例和打包资产还不够成熟。
- 采用决策：本轮已落地基础 tab 语义；继续实施 EV-013/014/032/043。

### 3.4 Hoppscotch/Bruno：工作区和本地数据边界

- 对方优势：工作区、集合、环境和本地文件边界更清楚，用户能迁移自己的项目状态。
- 我方现状：已经实现版本化工作区 JSON，导入时按当前注册表过滤未知工具，且不保存工具输入。
- 差距：导入前没有差异预览，schema 迁移和坏数据隔离还可加强。
- 采用决策：继续做 EV-022/028；保持无账号、无云同步、无网络工具输入的产品承诺。

### 3.5 PowerToys/Files：Windows 工程和交互

- 对方优势：安装、更新、快捷键、标签、空状态、错误恢复和高 DPI 细节经过大量用户验证。
- 我方现状：有 NSIS 安装和更新助手，最近已补齐图标/NSIS 缺失阻断；仍没有签名发布和真实安装升级闭环。
- 差距：单实例、回滚演练、更新取消/超时和 CI desktop smoke 仍缺。
- 采用决策：实施 EV-029/031/032/040/043/051/052；不引入 PowerToys 的系统级权限和常驻服务。

## 4. 维度对比表

| 维度 | 领先参考 | 对方可验证做法 | 我方当前状态 | 差距与决定 |
|---|---|---|---|---|
| 核心功能 | IT Tools、CyberChef | 独立工具 + recipe | 21 工具 + 1–8 步批处理 | 补 schema/暂停/重试；保留本地小工具定位 |
| 用户体验 | DevToys、Files | 桌面发现、标签、键盘和空状态 | 搜索、分类、标签、主题已具备 | 补焦点模型、弹窗语义、最近工具 |
| UI | DevToys、HTTPie Desktop | 桌面信息密度、结果层级 | 统一赛博视觉和响应式布局 | 优先可读性、对比度和窗口适配，不做装饰性重写 |
| 架构 | IT Tools、Bruno | 模块边界、文件化工作区 | registry + localStorage + Worker | 补 schema、类型契约、懒加载和错误边界 |
| 性能 | CyberChef、ut | Worker/分片/本地执行 | 批处理和正则已有 Worker | 补大输入背压、LRU、性能基准 |
| 安全 | PowerToys、Bruno | 最小权限、明确数据边界 | Electron 沙箱、IPC、SHA/可选签名 | 补 HTTPS、manifest 签名、IPC sender 校验、输入上限 |
| 稳定性 | CyberChef、PowerToys | 可恢复任务、清晰错误、安装回滚 | 有重试、Range、助手握手 | 补超时/取消、单实例、回滚和状态机测试 |
| 工程化 | DevToys、Files | CI、安装包、版本和发布 | quality/build/release 工作流存在 | 接入 desktop/browser smoke、SBOM、许可证门禁 |

## 5. 我方应保持的优势

1. 本地优先、工具输入不上传、无需账号和业务后端。
2. Windows 桌面窗口和 NSIS 安装更新链路已经围绕当前用户场景收敛。
3. 中文开发工具命名和低门槛入口，适合快速处理常见编码/格式化任务。
4. 批处理、工作区导入导出和多标签组合在一个轻量应用内完成。
5. 21 个工具的实现属于项目自身代码，能够按本项目许可证和数据边界维护。

## 6. 不采用的方案

- 不因为 Hoppscotch、Bruno、Insomnia 有网络能力就引入账号、云同步或 API 请求执行器。
- 不直接合并 GPL/AGPL 项目源码；需要借鉴时只重写公开思路并保留许可证记录。
- 不把外部目录中的 223 项宣传成项目内置功能。
- 不以第三方项目的星数代替本项目的性能、稳定性或安全测试。

## 7. 研究后的结论

最高价值的共同方向是：清晰的工具模块边界、可迁移的本地工作区、可组合但受限的批处理、桌面键盘/可访问性、可恢复的更新与发布工程。当前项目最应该继续加强这些边界，而不是扩张到云端 API 客户端或大型插件生态。
