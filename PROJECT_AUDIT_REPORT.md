# 项目审计与升级报告

审计日期：2026-11-09（Asia/Shanghai）  
项目：`geek-toolbox` / 极客工具箱 v1.2.0  
范围：当前工作区源码、配置、依赖锁文件、发布脚本、服务端、Electron、Capacitor Android/iOS 工程及可执行的本地构建和浏览器验证。所有变更仅保留在本地，没有提交、推送或发布。

## 1. 项目现状

- 用途：本地优先的开发者工具箱；核心工具运行在浏览器端，更新检查和下载按部署模式访问更新源。
- 技术栈：Vue 3、Vite 8、JavaScript；桌面端 Electron 45；移动端 Capacitor 8；Node.js 更新服务器；无应用数据库。
- 架构：`src/components/tools/` 内 21 个工具组件，由 `src/config/tools.js` 和 `src/App.vue` 注册；`shared/` 提供版本比较和 ZIP；`server/` 提供静态托管及 Web 更新接口；`electron/` 提供安全隔离的窗口、IPC 和桌面更新；Android/iOS 使用 Capacitor 容器。
- Git：`main`，初始状态 `main...origin/main` 且工作区干净；HEAD 为 `330c368`（v1.2.0）。审计结束未执行任何 Git 写入远端的操作。
- 当前项目没有数据库。Web、Electron 与 Android 可以在本机检查；iOS 原生构建需要 macOS/Xcode，本 Windows 环境不可执行。
- 质量基线：前端构建和 Android Debug APK 可构建；21 个已注册工具均能进入；完整依赖审计有 6 项 moderate 级别的间接开发依赖告警，详见第 4、8 节。

### 目录职责

| 目录/文件 | 职责 |
|---|---|
| `src/` | Vue 应用、主题、更新状态、工具注册与 21 个工具组件 |
| `public/` | Web App manifest 等静态资源 |
| `electron/` | Electron 主进程、预加载桥、更新及替换程序 |
| `server/` | Node.js 静态服务器和网页更新 API |
| `shared/` | ZIP 读写/路径保护、版本比较，供多端复用 |
| `scripts/` | 本地发布包生成 |
| `android/`、`ios/` | Capacitor 原生工程 |
| `.github/workflows/` | 多平台 CI 构建与 artifact 上传 |
| `release/`、`.tmp-verify/`、`.tmp-release/`、`updates/` | 本地构建、验证和更新产物；未当作垃圾删除 |

### 功能清单

| 功能 | 实际模块 | 状态 |
|---|---|---|
| 批量文本/文件转换与导出 | `ToolBatch.vue` | 已实现；文本批量编码验证通过；多文件各格式组合未逐项验证 |
| Base64 编解码 | `ToolBase64.vue` | UTF-8 往返和错误输入验证通过 |
| JWT 解析、Unicode/HTML 实体、Base 系列/密码 | `ToolJwt.vue`、`ToolUnicode.vue`、`ToolCipher.vue` | 页面正常打开；算法边界未逐项验证 |
| 图片与 Base64 | `ToolImageBase64.vue` | 页面正常打开；文件边界未逐项验证 |
| URL 编解码、JSON、哈希、AES | 对应 `Tool*.vue` | 页面正常打开；JSON 格式化验证通过，其余算法组合未逐项验证 |
| 时间戳与北京时间互转 | `ToolTimestamp.vue` | 已修复时区和输入校验；验证通过 |
| 正则、Diff、进制、二维码、随机密码、文本处理、JWT 生成、颜色、转义、SQL | 对应 `Tool*.vue` | 页面正常打开；未对所有算法组合和异常边界逐项验证 |
| 主题、搜索、分类、收藏、标签页 | `App.vue`、`useTheme.js` | 主题持久化验证通过；搜索、工具切换均可用 |
| 更新检查/应用 | `useUpdater.js`、`server/serve.js`、`electron/updater.js` | Web API 的版本、更新检查路径通过；未执行真实替换/重启，以免改写运行安装目录或更新源 |
| 外部工具目录 | `toolhelper_directory.json`、`App.vue` | 223 项目录数据；本项目实际注册 21 款。修正按关键词误报“本地秒开”的显示逻辑 |

## 2. 清理记录

- 项目跟踪文件基线为 127 个；当前仍为 127 个 Git 跟踪文件，另新增 1 个尚未跟踪的审计报告。未删除、移动或覆盖任何原有项目文件。
- 依赖声明为 14 项直接依赖（7 个运行依赖、7 个开发依赖）；没有确认可安全移除的依赖，因此删除 0 项。锁文件保留原内容。
- 保留 `dist/`、`release/`、`.tmp-verify/`、`.tmp-release/`、`updates/` 等现有构建与更新内容；不确定用途的文件全部保留。
- 本轮临时浏览器脚本已从项目已有的 `.tmp-verify/` 忽略目录移除；生成的真实界面截图留在该本地验证目录作为验收证据，未加入 Git。原有 `.asar` 验证产物保留。构建输出留在被忽略的 `dist/` / Android build 目录。
- 依赖扫描发现的 6 项 moderate 告警未通过 `npm audit fix --force` 自动处理：npm 建议将 `electron-builder` 降到 25.1.0，属于大版本降级；尝试将 minimatch 强行覆盖到 11.0.1 又会违反现有依赖的 semver 声明且未清除打包器告警。该试验已撤回，`package.json` 与 `package-lock.json` 已恢复仓库原版，依赖树通过 `npm ci` 按锁文件重建。

## 3. GitHub 竞品研究

数据通过 GitHub REST API 在 2026-11-09 查询；星数会持续变化。研究用于架构和产品对照，没有复制第三方代码。

| 项目 | Stars / 最近推送 | 许可证 | 已核实的定位与可借鉴点 | 与本项目差距 |
|---|---:|---|---|---|
| [IT Tools](https://github.com/CorentinTh/it-tools) | 41,163 / 2026-11-09 | GPL-3.0 | Vue 开发工具集合；README 明确提及工具路由、独立组件、单测、ESLint、模板生成和自托管。适合借鉴工具模块规范和组件级测试。 | 本项目目前工具少、没有 lint/unit test 脚本、工具注册映射集中在 `App.vue`。GPL-3.0 代码不直接并入 MIT 项目。 |
| [CyberChef](https://github.com/gchq/CyberChef) | 36,351 / 2026-11-07 | Apache-2.0 | 面向编码、加密、压缩和数据分析的可组合“recipe”工作流；可借鉴可复用处理步骤与组合执行。 | 当前工具彼此独立，没有处理步骤管线；不适合为追求数量整体迁移复杂工作流。 |
| [DevToys](https://github.com/DevToys-app/DevToys) | 32,233 / 2026-09-29 | MIT | 桌面优先的开发者工具集合；可借鉴清晰的工具发现、桌面端交互与本地工具定位。 | 本项目是 Vue Web 核心加 Electron/Capacitor 容器；未验证将 DevToys 原生架构移植的收益。 |

当前项目优势：21 款工具真实接入、共享 Vue 界面跨 Web/Desktop/Mobile、Web 更新服务自包含、更新包 SHA-256 校验、ZIP 解压路径保护、Electron `contextIsolation`/sandbox、本地优先处理。主要差距：缺少自动化单元测试与 lint，工具映射未从页面层分离，Android/iOS 尚无发行签名/发布验证，完整开发依赖仍有 moderate 告警。

## 4. 发现的问题与处理

### 已修复

1. **图谱把未实现的目录项误标为内置工具。** `isNativeTool()` 之前仅以 Base64、JSON、URL、密码等关键词匹配，会让外部目录项出现“本地秒开”徽标。现在仅在名称与实际工具注册清单完全一致时显示“项目内置”，并明确展示目录总数和实际内置数。
2. **时间页的北京时间标签不符合实现。** 原逻辑使用浏览器本机时区；时间戳单位还会按长度猜测，日期解析会接受部分宽松/溢出输入。现在固定使用 `Asia/Shanghai`，按用户选择的秒/毫秒单位转换，拒绝非数字、越界和无效日期，复制失败有提示。
3. **Vite 开发服务器默认监听所有网卡。** 改为只监听 `127.0.0.1`，减少开发模式意外暴露。
4. **离线界面仍加载 Google Fonts 且 favicon 404。** 移除外部 Google Fonts 请求，采用已有本机字体回退；增加内嵌 favicon，修正首屏主题异常注释。
5. **CI 将 Android Release 失败静默回退 Debug，却仍命名为 Release。** 改为明确构建并上传 unsigned Android Debug APK，避免把 Debug 产物误报成 Release 成功。
6. **JSON 示例中的工具数量和安全标签过期。** 示例数量从 187 更正为当前实际注册的 21，避免把示例误读为项目状态。

### 保留/待处理

- `electron-builder` 间接依赖链存在 6 项 moderate audit 告警，集中于 minimatch DoS advisory；没有已验证的兼容性升级路径。本次未强制跨主版本覆盖或降级打包器。
- `npm audit` 原始镜像 `https://registry.npmmirror.com` 的 audit endpoint 返回 404；使用 `--registry=https://registry.npmjs.org` 完成核查。生产依赖审计结果为 0 vulnerabilities；完整依赖树为 6 moderate、0 high/critical。
- `ToolUnicode.vue` 用 textarea 的 `innerHTML` 解码实体；本次代码审阅中输入仅进入 DOM 属性解析且未发现脚本执行路径，但没有专项 XSS fuzz 验证。
- 更新服务接收部署者配置的更新源 URL；更新链路需要真实 feed 与隔离安装目录才能做完整替换/重启验收，本次只验证版本与更新检查接口，没有实际应用更新。
- 部分组件剪贴板调用未统一处理拒绝；本轮未批量改写大量组件，以免扩大回归面。

## 5. 功能与架构升级

- 新增：无。优先修正已有功能的错误状态和不实界面信息，没有堆叠未验证功能。
- 优化：图谱内置标记、北京时间解析、Vite 本地绑定、字体离线性、favicon、CI Android artifact 标签、JSON 示例数据。
- 整合：无第三方代码整合；未引入新依赖。
- 架构：保持原有 Vue/Electron/Capacitor/Node 分层；没有因本轮小范围修复进行大规模重构。
- 依赖：直接依赖仍 14 项；无新增、无删除；锁文件恢复到审计前版本。

## 6. UI/UX 升级

- 工具图谱不再用关键词暗示未实现能力；改为“项目内置”徽标，并展示 223 项目录与 21 款实际工具的边界。
- 移除外部字体下载，离线访问更一致；加入内嵌 favicon 消除首次加载资源 404。
- 时间戳结果与日期输入统一按北京时间解释，错误日期明确提示。
- 桌面布局以及 390×844 移动视口均已浏览器验证；移动端菜单可以打开，文档宽度没有横向溢出。

## 7. 测试报告

| 检查 | 结果 |
|---|---|
| `npm run build` | 通过，Vite 8.3.6 构建完成 |
| `npm ci` | 通过，按仓库锁文件重装 395 个包；npm 提示 electron-winstaller 安装脚本尚未授权执行，此包不影响前端构建 |
| `npm audit --omit=dev --registry=https://registry.npmjs.org` | 通过，0 vulnerabilities |
| 完整 `npm audit --registry=https://registry.npmjs.org` | 6 moderate；0 high/critical；详情见第 4 节 |
| Android `gradlew assembleDebug --no-daemon` | 通过，BUILD SUCCESSFUL；存在 Gradle `flatDir` 建议和 Java unchecked 操作提示 |
| Playwright/Edge 桌面浏览器 | 21/21 已注册工具成功进入，0 页面异常 |
| 核心交互 | Base64 UTF-8 往返及错误输入、JSON 美化、批量 Base64、主题持久化通过 |
| 时间工具回归 | 1970 秒时间戳映射为北京时间 08:00；非数字和 2026-02-30 被拒绝 |
| 移动视口 | 390×844，菜单可打开、21 个工具卡可见、无页面异常、`scrollWidth=390` |
| 工具标签状态回归 | 切换 Base64 → JSON → Base64 后输入保留；时间戳页 1000ms interval 数量激活/失活/返回为 `1 → 0 → 1`；0 页面异常 |
| 离线资源 | 浏览器首屏没有跨域资源请求、404、console error 或 failed request |
| Web 更新服务静态/API | `/`、`/version.json`、`/api/version`、`/api/update/check` 返回预期；路径穿越请求未读取仓库文件 |
| iOS 原生构建 | 未执行：当前运行环境为 Windows，无 Xcode/xcodebuild |
| Electron 安装替换/重启 | 未执行：需要真实更新 feed 和隔离安装目录；不在当前安装目录试装 |
| Release 安装包重打 | 未执行：工作区已有发布产物，本轮避免覆盖；CI workflow 仅修正为诚实的 Android Debug artifact |

测试服务器仅监听 `127.0.0.1`；本次复验使用 4317，另有之前验证使用的 4319 和操作系统检查可用的 45987。复验结束后停止经进程命令行确认属于本仓库的 Vite PID 72360，并检查 4317 端口释放；不停止系统原有的其他进程。

## 8. 文件修改记录

- 新增：`PROJECT_AUDIT_REPORT.md`。
- 修改：`vite.config.js`、`index.html`、`src/App.vue`、`src/components/tools/ToolTimestamp.vue`、`src/components/tools/ToolJson.vue`、`.github/workflows/build-all.yml`。
- 删除、移动：无。
- `package.json` 与 `package-lock.json` 最终与审计前一致；曾尝试但撤回的 minimatch overrides 不作为交付变更。

## 9. 最终质量评估

- 升级前：核心工具和跨端架构已具备；部分状态文案夸大已实现能力，时间处理与标注可能偏离用户时区，开发服务暴露面偏宽，离线首屏仍请求外部字体；缺少单测/lint；完整开发依赖有 moderate 告警。
- 升级后：修复了上述可直接验证的产品/安全默认值问题；额外缓存已打开的工具页，避免标签切换丢失用户输入，并在时间戳工具不活动时暂停秒级计时器。Web 构建、Android Debug 构建和核心浏览器交互通过。
- 尚不能评价为完整发布验收：全部算法边界、Android 真机/iOS 真机、Electron 更新应用、发布签名与完整开发依赖告警仍待处理。

### 100 分制维度评分

评分是基于本次源码审阅、可执行构建和有限浏览器场景的工程判断，不等同于外部用户研究或完整专项测试；测试面不足的维度相应保守。

| 维度 | 分数 | 依据 |
|---|---:|---|
| UI 设计 | 78 | 21 款工具共享应用框架，桌面与 390px 移动视口通过；系统设计一致性和可访问性未完整审计。 |
| UX 体验 | 80 | 搜索、分类、收藏、主题和工具页切换已有；新修复标签状态保留与后台时钟暂停；撤销/引导等能力有限。 |
| 功能完整度 | 76 | 21 个注册工具可打开，核心场景有验证；部分算法边界、文件组合和更新应用未测。 |
| 架构合理性 | 77 | Vue/Electron/Capacitor/Node 分层及共享模块明确；工具映射集中于 App 页面，缺少专门服务层/注册清单。 |
| 代码质量 | 74 | 构建与 `git diff --check` 通过，主要修复有针对性；缺少 lint 与自动化单测，依赖审计仍有 6 项 moderate。 |
| 性能 | 81 | 前端构建成功，JS gzip 约 117.26 kB；无基准、低端设备或大文件压力测试。 |
| 安全性 | 79 | Vite 限定回环地址、Electron 隔离和更新包校验等已有措施；开发依赖告警与专项输入安全测试仍未闭环。 |
| 兼容性 | 72 | Web 桌面和移动视口、Android Debug 构建验证通过；浏览器矩阵、真机及 iOS/Xcode 未测。 |
| 可维护性 | 73 | 保持技术栈并避免大规模重写；缺少 lint/单测，部分工具和配置映射集中。 |
| 可扩展性 | 74 | 多端共用 Vue 工具页及 `shared/` 能力；尚无插件/统一注册机制，适合渐进式拆分。 |

## 10. 后续建议

1. 给 ZIP 解析、更新回滚、版本比较、时间戳、密码生成、JWT 和批量文件加自动化单元/集成测试。
2. 单独评估 electron-builder/App Builder 的兼容升级路线，在可生成 Windows/macOS 包的隔离输出目录验证后再处理 moderate advisory。
3. 将工具组件注册从 `App.vue` 拆为单一注册表，避免工具数据和组件映射分散。
4. 在专用测试目录/feed 上验证 Web 更新下载、哈希失败不替换、更新包路径穿越拒绝、替换失败回滚与重启恢复。
5. Android 使用签名配置进行发行构建；iOS 在 macOS/Xcode 环境构建、签名和真机验证。
6. 补充实际键盘导航、屏幕阅读器、低性能设备和大文件处理的验收。

---

# 第二阶段升级（2026-11-10 第二轮执行）

第一轮（2026-11-09）侧重于审计、保守修复与文档；按计划「本轮只分析、不落地」的边界，未做架构重构、未加自动化测试。第二轮按本指令的「必须真正执行升级」要求，在**不破坏既有 21 款可用工具、不影响其他本地项目、不推送远程**的前提下，落地了可验证的质量工程与架构改进。

## 1. 本轮新增能力

- **工具注册表单一化（架构去重）**：新增 `src/config/registry.js`，将「组件实现 ↔ 工具元数据」的映射集中为一处，并导出 `assertToolRegistry()` 交叉校验。原 `App.vue` 内手工维护的 `toolComponentsMap`（与 `tools.js` 平行、易错位）已删除，`App.vue` 改为从注册表派生组件，并在开发期主动调用自检。新增工具只需在 `registry.js` 一处登记，遗漏即报错，而不是运行时静默打不开。
- **自动化测试（从 0 到 27）**：新增 Vitest（`vitest.config.js`，Vue 插件 + Node 环境），覆盖：
  - `shared/version.js`：语义化版本解析、比较、预发布排序、`isNewerVersion`、`normalizeVersion` —— 12 例；
  - `shared/zip.js`：CRC-32 校验值、ZIP 创建/读取往返、zip-slip 路径穿越防护、解压落盘 —— 6 例；
  - `src/config/registry.js` + `tools.js`：每个元数据工具都有组件、无孤儿组件、自检通过、数量为 21 —— 4 例；
  - `src/utils/htmlEntities.js`：命名/十进制/十六进制实体解码、未知实体保留、注入载荷安全 —— 5 例。
  - 合计 **27 例全部通过**。`tests/` 同时作为注册表一致性护栏。
- **ESLint 静态检查**：新增 `eslint.config.js`（ESLint 9 扁平配置 + `eslint-plugin-vue` + `globals`），并声明 Vite 注入的 `__APP_VERSION__`/`__BUILD_TIME__` 为只读全局。当前 **0 error**（剩余 33 warning 见第 3 节）。
- **安全相关修正**：`ToolUnicode` 原先通过 `textarea.innerHTML = str` 再读 `.value` 解码 HTML 实体（将用户输入写入 DOM 的反模式），替换为纯字符串解析的 `src/utils/htmlEntities.js`，无 DOM、无执行路径，并补充单测验证注入载荷不被执行。

## 2. 本轮修复的真实问题

| 文件 | 问题 | 处理 |
|---|---|---|
| `electron/updater.js`、`server/serve.js`（×2）、`src/components/tools/ToolBase64.vue` | `catch` 中 `throw new Error(...)` 未携带 `cause`，丢失原始错误链 | 补 `{ cause: error }` |
| `src/composables/useUpdater.js` | `let data = null` 随后立即被覆盖（`no-useless-assignment`） | 改为 `let data` |
| `src/components/tools/ToolBatch.vue` | `content`/`ext` 初始值在所有分支均被覆盖，初始赋值无用 | 改为无初始化声明 |
| `src/components/tools/ToolEscape.vue` | 示例串中 `\ ` 为无用转义（实际吞掉一个反斜杠）；`unescapeC` 用 `\u0000` 控制字符作占位触发 `no-control-regex` | 示例改为 `\\ ` 真正包含反斜杠；占位符改非控制字符 `\uE000` |
| `src/components/tools/ToolUnicode.vue` | 模板 `&#x` 为非法数字字符引用（`vue/no-parsing-error`） | 改为 `&amp;#x`（正确展示字面 `&#x`） |

## 3. 本轮配置决策（已知技术债，非隐藏）

- `vue/no-side-effects-in-computed-properties`（14 处，分布在 ToolAes/Base64/Cipher/Color/Regex/Url）：工具组件的 `output` 计算属性同时负责重置/写入 `error` 状态，是本项目的既有有意为之模式。逐组件改造（把错误状态拆分到 `watch` 或方法）涉及 6+ 组件且存在回归风险，本轮**保留为可见 `warn` 并列为技术债**，推荐后续统一重构错误态处理。
- 以下纯格式规则与既有紧凑单行模板风格冲突，统一关闭以免噪音：`vue/max-attributes-per-line`、`vue/singleline-html-element-content-newline`、`vue/html-self-closing`、`vue/attributes-order`、`vue/multi-word-component-names`。
- 少量 `no-unused-vars` 警告（`catch (e)` 未使用）保留为 warn，可在后续统一将未使用形参改为 `_e`。

## 4. 验证结果

| 检查 | 结果 |
|---|---|
| `npm test`（Vitest） | 27/27 通过 |
| `npm run lint`（ESLint --quiet） | 0 error（33 warning） |
| `npm run build`（Vite 8.3.6） | 通过；`index.js` gzip 117.34 kB，与首轮 117.26 kB 基本一致，无体积回归 |
| 注册表自检 | `assertToolRegistry()` 通过，21 款工具全部接线 |
| 多项目安全 | 仅使用回环地址 / 临时目录；未占用或关闭其他项目端口与进程 |

## 5. 本轮文件变更

- 新增：`src/config/registry.js`、`src/utils/htmlEntities.js`、`tests/version.test.js`、`tests/zip.test.js`、`tests/registry.test.js`、`tests/htmlEntities.test.js`、`vitest.config.js`、`eslint.config.js`。
- 修改：`src/App.vue`（注册表派生 + 开发期自检）、`src/components/tools/ToolUnicode.vue`、`ToolBase64.vue`、`ToolEscape.vue`、`ToolBatch.vue`、`src/composables/useUpdater.js`、`electron/updater.js`、`server/serve.js`、`package.json`（新增 devDeps 与 `test`/`test:watch`/`lint`/`lint:fix` 脚本）、`README.md`（测试与质量章节）。
- 删除：无。
- `package.json` / `package-lock.json`：新增 vitest、eslint、eslint-plugin-vue、@eslint/js、globals 五个开发依赖（经 `npm ci` 兼容解析，未触动原有运行依赖）。

## 6. 第二轮质量评分（仅更新受影响维度）

| 维度 | 首轮 | 本轮 | 依据 |
|---|---:|---:|---|
| 代码质量 | 74 | 82 | 新增 27 单测 + ESLint 0 error；修复 5 类真实缺陷 |
| 架构合理性 | 77 | 84 | 工具映射去重为单一注册表，新增工具错位即时报错 |
| 安全性 | 79 | 83 | 消除 `innerHTML` 解码反模式；错误链 `cause` 补全 |
| 可维护性 | 73 | 83 | lint 门禁 + 测试护栏 + 注册表自解释 |
| 可测试性 | — | 80 | 纯模块（version/zip/htmlEntities/registry）已覆盖 |
| 功能完整度 | 76 | 76 | 本轮未新增功能，仅加固既有能力（符合「不堆砌未验证功能」原则） |

## 7. 仍建议后续处理（含首轮遗留）

1. 统一重构工具组件的错误态处理，消除 `computed` 副作用（本轮已 `warn` 暴露）。
2. 评估并验证 `electron-builder` 间接依赖的 6 项 moderate 告警的兼容升级路线（首轮遗留，未强制跨主版本）。
3. 将更多内联工具逻辑（Base64、Hash、JWT、密码、时间戳等）抽为纯函数并补单测，逐步提升组件级可测性。
4. 在隔离 feed / 安装目录上完成 Web 更新下载、哈希失败不替换、zip-slip 拒绝、回滚与重启验收（首轮遗留）。
5. Android 签名发行构建与 iOS（macOS/Xcode）真机构建验证（首轮遗留）。

## 8. Git 与远程状态

本轮所有变更仅停留在本地工作区与新增未跟踪文件；未执行 `git add/commit/push`，未创建远程分支/Tag/Release，未发布安装包。当前工作区仍包含首轮（2026-11-09）的 6 个未提交修改文件，二者共存、无冲突。待验收合格后由用户决定是否提交。
