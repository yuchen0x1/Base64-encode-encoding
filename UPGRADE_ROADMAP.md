# 项目升级路线图

路线基线：2026-11-16；v0.1.0 进展更新：2026-11-24；v0.1.1 发布与生命周期验收：2026-11-24；v0.1.2 候选实现与证据复核：2026-11-25
范围：当前 Windows 本地优先版本；不把已删除的平台工程重新纳入产品范围。  
状态含义：`COMPLETED` 已有代码和验证；`PARTIAL` 有部分代码但验收不完整；`PLANNED` 尚未实施；`BLOCKED` 当前无法验证且有明确外部阻碍。

v0.1.1 正式发布包含 Electron 跨来源重定向拦截和二维码多码结果去重边界修复。发布工作流与 PR CI 已在隔离的 GitHub-hosted Windows runner 上验证真实安装、覆盖升级、配置保留、故障回滚、启动和卸载。v0.1.2 候选已完成大 JSON / 二维码 Worker、长行格式化保护、存储保护、剪贴板、Blob URL、搜索一致性和智能下载线路改进；本地验证完成，远程 PR 门禁与该候选的安装生命周期待实际运行。

每一项都包含：编号、名称与模块、现状和证据、参考项目与实现方式、改进方案和效果、文件范围、难度、优先级、验收标准和当前状态。

## P0/P1：核心功能、稳定性与安全

| ID / 升级名称（模块） | 当前问题与依据 | 竞品参考与实现方式 | 改进方案 / 预期效果 | 文件或模块 | 难度 | 优先级 | 验收标准 | 状态 |
|---|---|---|---|---|---|---|---|---|
| EV-001 配方 schema 迁移（`batchProcessing`） | 配方已有 1–8 步，但没有版本迁移和逐字段错误报告 | CyberChef recipe；用版本号和迁移函数重建数据契约 | v1→v2 可重复迁移，未知步骤在导入时逐项提示 | `src/utils/batchProcessing.js`、`ToolBatch.vue` | 中 | P1 | 旧配方可导入；坏步骤不静默执行；导入错误可定位 | PLANNED |
| EV-002 批处理暂停/继续（Worker） | 原实现只有停止，不能保留队列位置继续 | CyberChef/Worker 队列；用可取消 token 和游标 | `batchRunner.js` 已加入 `pause()` 与活动计时器清理，保留调用方游标供后续批次继续；界面按钮与恢复测试尚未接入 | `batchRunner.js`、`ToolBatch.vue`、测试 | 高 | P1 | 已完成底层能力；完整 UI 暂停/恢复仍待补 | PARTIAL |
| EV-003 失败重试和退避（批处理） | Worker/文件读写失败分类不足 | DevToys/PowerToys 的可恢复错误；按可恢复错误重试 | 限次数、指数退避、不可恢复错误立即失败 | `batchRunner.js`、`ToolBatch.vue` | 中 | P1 | 模拟一次超时只重试可恢复错误；超过次数进入失败状态 | PLANNED |
| EV-004 批处理结果恢复（工作区） | 刷新或关闭后仅能导出已有结果，不能恢复运行元数据 | Bruno 文件化本地工作流 | 为最近一次任务保存小型快照和状态，避免保存原始敏感输入 | `appState.js`、`ToolBatch.vue` | 高 | P1 | 重启后可恢复任务摘要和导出结果；旧状态可读 | PLANNED |
| EV-005 扩充批处理安全操作（批处理） | 当前操作集合有限，部分工具未暴露 URL-Safe/SHA-512 等选项 | CyberChef 操作注册表 | 只添加纯本地、可测试、数据契约明确的操作 | `batchOperations.js`、`batchWorker.js` | 中 | P1 | 每个新操作有正向、错误和大输入测试；二进制不损坏 | PLANNED |
| EV-006 二维码解析（二维码工具） | 原实现仅生成二维码 | 参考 IT Tools/DevToys 的本地媒体工具；核对 MIT 许可的 `zxing-wasm@3.1.7` | 本地图片识别，WASM 构建期内联；失败不上传、不伪造结果 | `ToolQrcode.vue`、`qrDecoder.js`、`vite.config.js`、测试 | 高 | P1 | 已完成：真实 WASM 生成/识别闭环和错误测试通过 | COMPLETED |
| EV-007 颜色双向输入（颜色工具） | 原实现主要接受 HEX，Alpha 固定为 1 | IT Tools 的格式转换工具 | 增加 RGB/RGBA/HSL/HSLA/HSV/HSVA/Alpha 双向输入和共享规范化 | `ToolColor.vue`、`color.js`、测试 | 中 | P1 | 已完成：多格式往返、边界和历史清洗测试通过 | COMPLETED |
| EV-008 JWT 本地验签模式（JWT 工具） | 原 README 明确解析不验签，用户容易把解析当验证 | Bruno/Insomnia 的显式验证状态 | 增加“仅解析/HS256 本地验签”模式，显示算法和失败原因 | `jwtTool.js`、`ToolJwt.vue`、测试 | 中 | P1 | 已完成：错误 secret、篡改、alg=none/非 HS256 均有专项测试 | COMPLETED |
| EV-009 JWT 生成算法扩展（JWT 生成） | 当前生成器为 HS256 | Web Crypto 的用户提供密钥模式 | 仅在浏览器原生 crypto 可用且用户提供密钥时支持 RS/ES | `jwtGeneratorTool.js`、`ToolJwtGenerator.vue` | 高 | P1 | 不持久化私钥；算法不匹配时明确拒绝 | PLANNED |
| EV-010 JSON 大文档模式（JSON 工具） | 原实现同步解析和格式化会占用渲染主线程 | JSON Crack 的路径/可视化思路 | 校验、美化、压缩、差异、JSONPath 和结构操作按需交由 Worker；树/路径保留 5 MiB 上限，文本总上限 32 MiB | `ToolJson.vue`、`jsonTool.js`、JSON Worker、测试 | 高 | P1 | 5 MiB Electron `file://` 烟测通过；Worker 失败不在主线程同步重跑大文档 | COMPLETED |
| EV-011 SQL 方言选项（SQL 工具） | 当前为文本通用格式化，无方言选择 | IT Tools/格式化器的方言配置 | ANSI/MySQL/PostgreSQL 选项，仍保持离线文本处理 | `ToolSql.vue`、SQL helper | 中 | P1 | 三种 fixture 输出稳定；不连接数据库 | PLANNED |
| EV-012 图片 DataURL 保护（图片工具） | 过去 FileReader 和粘贴值无上限 | DevToys/浏览器工具的边界提示 | 已加 16 MiB 文件/解码上限和 atob 前长度预检；后续补 SVG 活动内容策略 | `toolHelpers.js`、`ToolImageBase64.vue` | 中 | P1 | 超限文件在读取前拒绝；超限字符串不创建预览；恶意 SVG 有明确策略 | PARTIAL |
| EV-013 标签页键盘模型（App） | 原先是可点击 `div`，键盘不能切换 | Files/DevToys tablist | 已加入 tab 语义、左右键、Enter/Space；v0.1.0 补关闭标签后的焦点回收 | `src/App.vue` | 中 | P1 | 已完成标签键盘模型与关闭后焦点回收 | COMPLETED |
| EV-014 ARIA 与焦点审计（App/弹窗） | 目录弹窗和更新弹窗缺少完整 dialog/focus 语义 | Files/DevToys 可访问交互 | 补 `role=dialog`、live 状态、Esc、焦点恢复和 reduced-motion | `App.vue`、`UpdateModal.vue`、`FeedbackModal.vue` | 中 | P1 | 键盘可完成打开/关闭；读屏可识别标题、状态和按钮 | PARTIAL |
| EV-015 命令面板（搜索） | 原 Ctrl/Cmd+K 只聚焦搜索框，无上下键和最近项 | DevToys/PowerToys 启动器 | 新增分组命令面板、上下键、Enter、Esc、中英文关键词与最近工具 | `App.vue`、`commandPalette.js`、测试 | 中 | P1 | 已完成功能测试；100ms 性能基准未量化 | PARTIAL |
| EV-016 最近使用记录（工作区） | 原来只有 favorites/openTabs，没有最近使用排序 | DevToys 工具发现 | 限长最近列表、偏好排序、备份兼容 | `appState.js`、`App.vue`、测试 | 低 | P1 | 已完成去重、上限、迁移与备份兼容测试 | COMPLETED |
| EV-017 工具清空/撤销契约（工具组件） | 各工具清空和恢复行为不一致 | IT Tools 单工具边界 | 提供统一 reset/一次撤销 composable，按工具渐进迁移 | 新 `useToolState.js`、`Tool*.vue` | 高 | P1 | 清空只影响当前 tab；一次撤销恢复输入和选项 | PLANNED |
| EV-018 剪贴板降级反馈（剪贴板） | 各组件原本分散处理空输入和权限异常 | DevToys/HTTPie 的可见反馈 | 统一成功/失败、空内容和 Clipboard API/旧浏览器降级；复制操作共享 `copyText` | `clipboard.js`、`useToast.js`、工具组件 | 中 | P1 | 失败不误报；空文本有反馈；legacy fallback 与权限失败测试通过 | COMPLETED |
| EV-019 响应式窗口基准（布局） | 已有 1440/390 smoke，1024/768 缺少基准 | DevToys/Files 高 DPI 窗口 | 建立 1440×900、1024×768、390×844 截图和无横向滚动检查 | `App.vue`、基础 CSS、browser smoke | 中 | P1 | 三种尺寸核心操作可见、无横向滚动 | PARTIAL |
| EV-020 主题和对比度（主题） | 深浅主题已持久化，系统偏好和 AA 对比度未量化 | Files/DevToys 主题设置 | 加 `prefers-color-scheme`、token 对比度检查和 reduced-motion | `useTheme.js`、`src/styles` | 中 | P1 | 重启主题稳定；主要文字达到 WCAG AA | PLANNED |
| EV-021 更新弹窗可恢复状态（更新器 UI） | 已有检查/下载/ready/error，但取消和失败重试体验不完整 | PowerToys 更新流程 | 已增加取消按钮、取消 IPC、清理半包和可重试状态；完整错误码与断网演练待补 | `UpdateModal.vue`、`useUpdater.js`、`updater.js` | 中 | P1 | 断网后可重试；失败不误报 ready；旧版本仍可启动 | PARTIAL |
| EV-022 工作区导入差异预览（工作区） | 当前导入直接覆盖 favorites/tabs/theme | Bruno 文件工作区 | 先展示新增/删除/主题变化，再由用户确认 | `App.vue`、`appState.js` | 中 | P1 | 取消导入不修改当前状态；确认后一次性替换 | PLANNED |

## P1/P2：架构、性能、稳定性和安全

| ID / 升级名称（模块） | 当前问题与依据 | 竞品参考与实现方式 | 改进方案 / 预期效果 | 文件或模块 | 难度 | 优先级 | 验收标准 | 状态 |
|---|---|---|---|---|---|---|---|---|
| EV-023 工具元数据 schema（registry） | 原来注册表字段约束和组件连线校验不足 | IT Tools 注册/路由边界 | schema/分类/tags/重复 ID/组件连线错误收集、21 个懒加载组件逐一验证 | `tools.js`、`registry.js`、测试 | 中 | P1 | 已完成元数据与懒加载连线测试 | COMPLETED |
| EV-024 工具懒加载分包（Vite） | 原来 21 个组件进入首屏主 bundle | DevToys 模块化发现 | 动态 import 全部工具，加载中/失败态与恢复按钮 | `registry.js`、`App.vue`、`ToolLoading.vue`、`ToolLoadError.vue` | 高 | P2 | 已完成：主 JS 204.72 kB、各工具独立 chunk、加载错误态就绪 | COMPLETED |
| EV-025 统一工具上下文（composable） | 输入/输出/错误/复制在各组件重复 | IT Tools 单工具边界 | 提供最小 composable，先迁移 5 个组件 | 新 `useToolState.js`、工具组件 | 高 | P2 | 5 个工具行为一致；无跨 tab 状态泄漏 | PLANNED |
| EV-026 工具错误边界（App） | 单工具懒加载失败可能影响当前渲染树 | Vue 错误边界/DevToys 模块隔离 | 增加懒加载失败组件与重试按钮 | `App.vue`、`ToolLoadError.vue` | 高 | P1 | 已完成加载失败恢复态；渲染期异常边界仍需专项故障注入 | PARTIAL |
| EV-027 核心契约类型化（工程） | JavaScript 缺少 batch/appState/updater 类型约束 | Hoppscotch/Bruno 分层契约 | 先用 JSDoc/检查，再评估 TypeScript，不更换技术栈 | `src/utils`、`electron`、CI | 高 | P2 | 类型检查纳入 CI；公共输入输出有文档 | PLANNED |
| EV-028 localStorage schema 迁移（工作区） | 当前键有版本化备份，运行时状态迁移仍弱 | Bruno 文件 schema | 给 `geek-toolbox-state` 加 schemaVersion、legacy 迁移；坏 JSON、显式非法版本和未来版本暂停写入 | `appState.js`、`App.vue`、测试 | 中 | P1 | 旧键保留偏好；坏数据原样保留且不被默认状态覆盖；迁移测试通过 | COMPLETED |
| EV-029 Electron IPC sender 校验（安全） | 原 preload 暴露更新接口但缺少 sender/通道审计 | Electron 安全最佳实践、PowerToys | 白名单通道、主窗口/主 frame/受信 URL 校验、拒绝任意路径/URL | `electron/ipc-security.js`、`main.js`、`preload.cjs`、测试 | 高 | P1 | 已完成恶意来源、iframe、销毁窗口、非法参数测试 | COMPLETED |
| EV-031 下载取消和磁盘上限（更新器） | 当前已有重试/Range/SHA，但没有 AbortController、无 size 时硬上限 | PowerToys/桌面更新器 | 已加入 512 MiB 硬上限、30 秒无响应超时、AbortController 取消、IPC 取消和半包清理；剩余空间检查待补 | `electron/updater.js`、`preload.cjs`、`useUpdater.js`、测试 | 高 | P1 | 取消不残留半包；无 size 也不能超过上限；失败可重试 | PARTIAL |
| EV-032 Windows 单实例（主进程） | `main.js` 尚无完整 `requestSingleInstanceLock` 流程 | PowerToys/Files | 已加入 primary lock、secondary quit、二次启动回调和已有窗口 restore/show/focus | `electron/main.js`、`electron/single-instance.js`、测试 | 中 | P1 | 双击两次只保留一个窗口；第二次启动参数可处理 | COMPLETED |
| EV-033 日志分级和脱敏（Electron） | 更新错误需要诊断，但不能记录 token/query/工具输入 | Bruno/PowerToys 诊断日志 | 错误码、分级、滚动文件和字段脱敏 | `electron/main.js`、`updater.js` | 中 | P2 | 日志无密钥/输入文本；错误可按 code 排查 | PLANNED |
| EV-034 依赖许可证清单（工程） | 直接依赖有 license，生产归档没有 SPDX/NOTICE | IT Tools/桌面发布实践 | 生成依赖清单，新增 GPL/AGPL 时 CI 阻断或人工批准 | `scripts/`、CI、`NOTICE` | 中 | P1 | 产物包含许可证报告；违规依赖不会静默进入包 | PLANNED |
| EV-035 供应链锁定（工程） | 使用 npm ci，但没有独立 lockfile/registry 校验门禁 | PowerToys/CI | 官方 npm registry 审计已返回 0 vulnerabilities；lockfile/registry/Node 版本门禁仍待接入 | `.github/workflows`、`package-lock.json` | 中 | P1 | lockfile 漂移失败；安全扫描失败状态可追踪 | PARTIAL |
| EV-036 大文本 Worker 分片（性能） | 批处理有总量限制，但大消息仍可能一次传入 Worker | CyberChef Worker | 分片传输、背压、可取消队列 | `batchRunner.js`、`batchWorker.js` | 高 | P2 | 64 MiB fixture 下 UI 可交互；内存上限有记录 | PLANNED |
| EV-037 正则 ReDoS 防护（性能/安全） | Worker 有 500ms 超时，但 pattern/text 无大小和复杂度阈值 | CyberChef/浏览器工具输入边界 | 限字节、debounce、复杂模式提示和错误码 | `ToolRegex.vue`、`regexMatchRunner.js` | 中 | P1 | 恶意模式按时终止；超限不发送到 Worker | PLANNED |
| EV-038 结果 LRU 缓存（性能） | JSON/哈希/SQL 重复计算没有有界缓存 | CyberChef 操作缓存思路 | 输入+选项作为 key，按字节和条目双上限 | 工具 helper、新 `lru.js` | 中 | P2 | 重复计算命中；达到上限自动淘汰 | PLANNED |
| EV-039 Blob/DataURL 生命周期（稳定性） | 多个导出入口曾在点击瞬间回收 URL | 浏览器工具最佳实践 | 工作区、批处理、JSON 和二维码下载共用延迟回收；图片预览沿用文件大小限制和替换语义 | `objectUrl.js`、`App.vue`、`ToolBatch.vue`、`ToolJson.vue`、`ToolQrcode.vue` | 中 | P1 | 下载 URL 点击后保留 1 秒再释放；对象 URL helper 测试通过 | COMPLETED |
| EV-040 更新状态机契约（稳定性） | 状态散落在 `useUpdater` 与 Electron 事件中 | 桌面更新器状态机 | 明确定义合法迁移并用表驱动测试 | `useUpdater.js`、`updater.js`、测试 | 中 | P1 | 非法迁移被拒绝；每个状态有 UI 文案和恢复路径 | PLANNED |
| EV-041 自动化回归矩阵（测试） | browser/Electron smoke 存在，但 CI 未调用全部入口 | DevToys/桌面项目 CI | 新增专项测试并扩充既有覆盖；接入单测、lint、桌面、更新、CLI、依赖审查和 Windows 生命周期 | `.github/workflows`、`tests/` | 中 | 本地 328 项单测和分层烟测通过；PR #21 更新前 head 的 Quality Gate run 45439749550 和 Windows installer run 45439749767 通过；本轮提交仍待 CI | COMPLETED |
| EV-042 性能基准脚本（测试） | 当前只记录构建结果，没有稳定启动/批处理基线 | CyberChef/ut 性能意识 | 记录启动、构建、吞吐、峰值内存，禁止编造对比 | `scripts/perf`、CI artifact | 中 | P2 | 每次基准带环境和原始数据；无数据时标记缺失 | PLANNED |
| EV-057 超长 JSON 行渲染资源预算（JSON 工具） | 5 MiB 多行 JSON 可处理；5.25 MiB 单行数组美化曾造成 textarea 数 GB 级内存峰值 | CodeMirror 等虚拟化编辑器的 viewport 思路；针对当前 textarea 先建立输出预算和回归烟测 | 美化结果最多 100,000 行，超限在 Worker 内拒绝并保留原输入；压缩仍可用，JSON-only smoke 断言错误提示、输入不变和峰值记录。单行输入校验的约 500 MiB 观测继续作为后续性能跟踪项 | `ToolJson.vue`、`jsonText.js`、JSON Worker、Electron smoke | 高 | 5 MiB 多行与单行样本分别记录 UI 响应、private memory、working set；超长美化不得写入 textarea；有回归门禁 | COMPLETED |
| EV-043 Windows 安装回滚演练（发布） | 曾待隔离 runner 验证；现已有真实生命周期日志 | PowerToys/Files 安装更新 | 隔离目录安装旧版、覆盖新版、注入 payload/version mismatch 并核验恢复 | `electron/apply-installer.js`、`tests/windows/`、CI | 高 | P1 | v0.1.1 历史 runs 45391803298 / 45393215151 及候选 PR #21 run 45429273392 均通过；候选 run 安装 v0.1.1、升级 v0.1.2，并在故障后恢复 v0.1.1 | COMPLETED |
| EV-044 lint/安全质量门禁（CI） | 默认镜像安全接口异常、发布健康缺乏资产校验 | Vue lint + 供应链门禁 | lint 归零；官方 npm audit 0 vulnerabilities；maintenance 拆分并加强依赖/发布/文档检查 | `.github/workflows/maintenance.yml`、`scripts/` | 中 | P1 | 本地门禁通过；远程工作流结果以 PR/CI 为准 | PARTIAL |

## P2/P3：新增能力、发布和文档

| ID / 升级名称（模块） | 当前问题与依据 | 竞品参考与实现方式 | 改进方案 / 预期效果 | 文件或模块 | 难度 | 优先级 | 验收标准 | 状态 |
|---|---|---|---|---|---|---|---|---|
| EV-045 收藏分组与排序（工作区） | 收藏只有扁平 ID 列表 | DevToys 工具发现 | 增加用户分组和稳定排序，备份 schema 向后兼容 | `appState.js`、`App.vue` | 中 | P2 | 新旧备份互读；排序稳定；删除分组不丢工具 | PLANNED |
| EV-046 配方模板库（批处理） | 当前配方需要用户自行配置 | CyberChef recipe | 内置只读模板 + 用户模板、导入导出和版本号 | `ToolBatch.vue`、`batchProcessing.js` | 中 | P2 | 模板可复制后编辑；原模板不可被覆盖 | PLANNED |
| EV-047 文件拖拽统一反馈（媒体/批处理） | 图片和批处理拖拽入口反馈不一致 | DevToys/Files drop zone | 类型、大小、键盘入口和拖拽高亮统一 | `ToolImageBase64.vue`、`ToolBatch.vue` | 低 | P2 | 拖拽/选择/键盘三种入口等价；拒绝原因可见 | PLANNED |
| EV-048 国际化基础（文案） | 当前中文文案分散在组件 | Hoppscotch/DevToys 多语言结构 | 抽离 zh-CN/en-US key，缺失回退中文 | `src/i18n`、组件 | 高 | P3 | 切换语言不丢状态；缺 key 有测试 | PLANNED |
| EV-049 帮助与快捷键面板（App） | 原快捷键只在占位文案中出现 | PowerToys 快捷键入口 | 展示 Ctrl/Cmd+K、主题、标签和关闭焦点行为 | `App.vue` | 低 | P3 | 已完成命令面板入口和快捷键弹窗 | COMPLETED |
| EV-050 零遥测声明（隐私） | 当前没有遥测，但 README 需要持续明确 | Bruno 本地优先边界 | 增加网络请求审计和默认关闭声明，不新增上传 | `README.md`、`docs/`、CI | 低 | P2 | 自动化检查默认无业务网络请求；文档与实现一致 | PARTIAL |
| EV-051 SBOM/校验归档（发布） | 发布脚本有 SHA/清单，缺少 SBOM 和依赖许可证归档 | PowerToys 发布工程 | 归档安装包、manifest、SHA、SBOM、NOTICE | `scripts/release.mjs`、CI | 中 | P2 | 离线可核验版本、哈希、依赖和许可证 | PLANNED |
| EV-052 真实安装验收（发布） | 曾仅有本机打包证据；现有隔离 Windows runner 验收 | PowerToys/Files | Windows runner 实际安装、覆盖升级、启动、配置保留和卸载 | `tests/windows/install-smoke.ps1`、CI | 高 | P1 | v0.1.1 历史 runs 45391803298 / 45393215151 及候选 PR #21 run 45429273392 均通过；候选覆盖安装、profile 保留、回滚、启动和卸载均有日志 | COMPLETED |
| EV-053 CHANGELOG/版本门禁（工程） | 版本、tag、CHANGELOG、EV 状态可能漂移 | GitHub Release 项目 | `verify-version` 校验 package/lock/notes/CHANGELOG/release history；发布前执行 | `scripts/verify-version.mjs`、发布文档 | 中 | P2 | 已完成本地版本一致性门禁 | COMPLETED |
| EV-054 文档链接/截图校验（文档） | 文档数量多，链接和截图容易失效 | DevToys/开源项目文档门禁 | 本地链接/截图/CLI 硬编码检查纳入 maintenance 工作流 | `scripts/check-docs.mjs`、CI | 低 | P2 | 已完成：47 个本地链接/图片和 README 版本链接通过 | COMPLETED |
| EV-055 社区反馈模板（仓库） | 反馈入口存在，GitHub issue 字段仍可结构化 | PowerToys issue 模板 | Bug/安全/功能模板要求复现、环境和隐私提醒 | `.github/ISSUE_TEMPLATE` | 低 | P3 | 新 issue 有明确字段；不鼓励粘贴密钥/工具输入 | PLANNED |
| EV-056 二次竞品监测（路线） | 竞品 release/commit 会变化，当前研究是一次性快照 | GitHub Releases/Commits | 每次路线更新记录 30/90 天变化和来源 | `COMPETITOR_ANALYSIS.md`、脚本 | 中 | P3 | 更新日期、仓库、变更和决策可追溯 | PLANNED |

## 计划执行顺序

1. 已完成的边界修复和打包资产先保持回归绿线。
2. P1 优先：EV-001/002/003、EV-021/023/028/029/031/032/037/040/041/057。
3. P1 功能增强：EV-006/007/008/010/011/022，并为每项补单测或浏览器验收。
4. P2 架构/性能：EV-024/025/026/027/033/036/038/039/042。
5. P2/P3 发布文档和生态：EV-045–056。

当前统计：56 项，`COMPLETED` 20 项、`PARTIAL` 12 项、`PLANNED` 24 项、`BLOCKED` 0 项。任何尚无运行日志或其他外部证据的项目仍按实际情况标记，不以静态文件存在代替验收。EV-057 的灾难性格式化峰值已有输出预算和回归门禁；单行输入校验的内存观测仍需后续多机基准，不作为本轮已验证的性能承诺。
