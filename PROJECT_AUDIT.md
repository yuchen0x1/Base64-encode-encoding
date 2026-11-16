# 极客工具箱项目现状审计

审计日期：2026-11-16（Asia/Shanghai）  
项目：`geek-toolbox` / 极客工具箱  
版本：`0.0.6`（以当前 `package.json` 为准）  
仓库：<https://github.com/yuchen0x1/Base64-encode-encoding>  
分支：`main`，HEAD 为 `43cc6d6`；工作树存在用户已有未提交和暂存删除。

## 1. 审计边界与方法

本轮先检查目录、Git 状态、依赖、入口、核心 Vue 组件、Electron 主进程、更新器、批处理 Worker、测试和 CI 配置，再运行当前环境允许的单元测试、lint、Vite 构建、Electron 目录构建、NSIS 打包和更新助手检查。没有执行 `reset`、`clean`、分支切换或远程写入。

工作树在审计开始时已经包含大量变更：Android/iOS、独立 server、部分 shared/测试/图标文件被暂存删除，README、更新器、CI 和多个组件有未提交修改。它们不是本轮审计创建的内容，后续报告按当前工作树事实记录，不将暂存删除误判为本轮删除。

## 2. 项目身份

| 项目维度 | 当前事实 |
|---|---|
| 产品定位 | Windows 本地优先的开发者工具箱 |
| 目标用户 | 需要离线完成编码、摘要、格式化、时间、文本、媒体和批处理的开发者/技术用户 |
| 核心场景 | 单工具实时转换、多个工具标签页切换、收藏和搜索、工作区导入导出、批量文本/文件处理、Windows 安装和更新 |
| 前端 | Vue 3、JavaScript ESM、Vite 8 |
| 桌面 | Electron 45.2.3，Windows x64 NSIS |
| 数据存储 | 无数据库；用户偏好写入 Electron 用户目录的 localStorage，键为 `geek-toolbox-state` |
| 后端/API | 当前产品运行不依赖业务后端、账号或云同步；更新器读取本地目录或远程 `version.json` |
| 直接运行依赖 | `crypto-js`、`diff`、`qrcode`、Vue、lucide-vue-next |
| 构建/发布 | Vite、electron-builder、NSIS；`scripts/release.mjs` 生成桌面清单和 SHA-256 |
| 测试 | Vitest；Electron 更新助手检查；另有浏览器和 Electron smoke 脚本，但没有全部纳入质量工作流 |
| 当前支持平台 | README 声明仅 Windows x64；原生 Android/iOS 文件处于现有工作树的删除变更中，不作为当前产品能力宣称 |

## 3. 实际架构

```text
src/App.vue                         Vue 工作台、搜索、分类、标签、收藏、工作区
src/config/tools.js                 21 款工具元数据
src/config/registry.js              元数据到 Vue 组件的单一注册表
src/components/tools/               每个工具的界面和局部业务逻辑
src/utils/                          编码、批处理、工作区、图片、时间戳等可测试逻辑
src/workers/                        批处理和正则计算 Worker
electron/main.js                    窗口、IPC、安全导航、更新入口
electron/updater.js                 清单读取、下载、SHA/签名校验、安装助手握手
electron/installer-bootstrap.js     更新助手运行时准备
scripts/                            图标、发布、运行时验证、清理
tests/                              Vitest、Electron smoke、浏览器 smoke
.github/workflows/                  quality/build/release 工作流
```

渲染器通过 `file://` 加载 `dist`，启用沙箱、上下文隔离和 webSecurity，关闭 Node 集成；preload 只暴露更新接口，外链由主进程交给系统浏览器处理。工具输入默认在本机内存计算，不自动保存。

## 4. 功能清单

当前元数据和注册表实际包含 21 款工具：

1. 批量处理（文本/文件、最多 8 步配方、Worker、停止、分页、TXT/CSV/JSON 导出）。
2. Base64 编解码（UTF-8、URL-Safe）。
3. JWT 解析和时效诊断（解析，不验签）。
4. Unicode/HTML 实体。
5. Hex、Base32、摩斯、ROT13。
6. 图片与 Base64。
7. URL 编解码。
8. JSON 格式化、压缩、转义和错误定位。
9. MD5/SHA/HMAC 摘要。
10. AES 加解密。
11. Unix 时间戳。
12. 正则表达式测试器（Worker 超时终止）。
13. 文本 Diff。
14. 二、八、十、十六进制转换。
15. 二维码生成。
16. 随机密码、UUID。
17. 文本去重和统计。
18. JWT HS256 生成。
19. HEX 到 RGB/HSL 等颜色展示。
20. C 风格、Unicode、Hex 转义。
21. SQL 文本格式化。

已实际核对的工作台能力包括搜索、分类筛选、收藏、多个标签、深浅主题、版本化工作区 JSON 导入导出、批处理后台 Worker 和 Windows 更新入口。外部 `toolhelper_directory.json` 的 223 项是目录索引，不代表本项目已实现 223 款工具。

## 5. 本轮发现与已处理问题

| 编号 | 证据 | 本轮处理 | 状态 |
|---|---|---|---|
| AUD-01 | 五个工具的 computed 直接写 `error.value`，触发 `vue/no-side-effects-in-computed-properties` | 改为纯 `conversion`/`colorState` 结果，再由 computed 派生 `output` 和 `error` | 已完成；lint 无 warning |
| AUD-02 | AES CBC/ECB + `NoPadding` 对非 16 字节明文会生成不能被 `parseCiphertext` 接受的密文 | 新增 `validateAesPayload`，加密前明确拒绝非整块 UTF-8 明文，并添加单测 | 已完成 |
| AUD-03 | 图片文件和粘贴 DataURL 原先没有统一大小边界 | `parseImageDataUrl` 默认限制解码后 16 MiB；FileReader 前拒绝超限文件 | 已完成；后续可在 `atob` 前增加长度预检 |
| AUD-04 | 时间戳使用 `Number(raw)`，超出安全整数会静默丢精度 | 新增 `parseUnixTimestamp`，检查安全整数和毫秒乘法范围 | 已完成 |
| AUD-05 | 工作区导入直接读取任意大小 JSON | 增加 1 MiB 字节上限，UI 在读取前提示 | 已完成 |
| AUD-06 | 生产更新源可使用明文 HTTP；SHA-256 只保证完整性 | 打包运行时拒绝 HTTP 更新源/安装包，开发环境仍可显式使用 | 已完成；更新清单签名仍未接入 |
| AUD-07 | 标签页使用可点击 `div`，键盘无法切换 | 增加 `role=tab`、选中态、焦点顺序、Enter/Space 和左右方向键 | 已完成基础键盘操作；完整焦点陷阱仍待做 |
| AUD-08 | `package.json` 引用的 `build/installer.nsh` 和图标在现有工作树被删除，NSIS 打包失败 | 恢复仓库已有 NSIS 脚本；让图标脚本兼容旧版 Pillow，并重新生成 Windows 图标 | 已完成；NSIS 本地打包通过 |

## 6. 尚存的 P0/P1 风险

这些问题没有在本轮虚报为完成：

- 更新下载仍缺少连接/整体超时、取消信号和清单未声明大小时的硬上限；长时间断网或恶意源可能持续占用资源。
- `electron/main.js` 尚未建立单实例锁和第二次启动聚焦窗口的完整流程。
- `assertToolRegistry()` 目前主要由开发期日志暴露，生产构建不会因为注册表不一致自动失败。
- 更新清单仍以 SHA-256 和可选 Authenticode 元数据为主，未形成独立的签名清单验证；SHA-256 不能证明发布者身份。
- 默认 `registry.npmmirror.com` 的安全接口返回 404；切换到官方 npm registry 后 `npm audit --omit=optional --audit-level=moderate` 返回 0 vulnerabilities。两种结果分别记录，不把镜像故障当作漏洞扫描结果。
- 真实 GitHub Actions、带证书签名、隔离安装目录替换/重启、生产更新闭环没有在本机伪造为已完成。

## 7. 当前成熟度判断

项目已经是可运行的 Windows 本地工具箱，21 个工具、工作区、批处理和更新链路有真实代码和本地测试支撑；它适合作为 **可用 beta / 本地候选发布**。它还不能被称为已完成生产级发布，原因是签名发布、远程 CI、真实安装更新、单实例、更新超时/取消和安全审计仍缺少完整证据。

## 8. 基线与验证记录

本轮实际执行过的命令和状态：

| 命令 | 状态 | 结果 |
|---|---|---|
| `npm test -- --reporter=dot` | PASS | 29 个测试文件；221 个测试全部通过 |
| `npm run lint` | PASS | 0 error、0 warning；已处理五个工具的 computed 副作用 |
| `npm run build` | PASS | Vite 8.3.6；转换 1885 个模块 |
| `npm run test:desktop` | PASS | Electron file:// 沙箱 renderer 批处理烟测通过；无控制台错误 |
| `npm run test:updater` | PASS | 更新助手运行时复制、ready 握手和崩溃保护通过 |
| `npm run build:win`（成功构建） | PASS | 已生成 `release/win-unpacked`；恢复图标后不再依赖默认 Electron 图标 |
| `npm run build:win`（最后重跑） | BLOCKED | electron-builder 外部下载阶段长时间无输出，因网络阻塞中止；不影响已有成功目录产物 |
| `npm run package:win`（成功构建） | PASS | 2026-11-16 21:17 生成 `release/GeekToolbox-Setup-0.0.6.exe`；SHA-256 为 `C94182B05003A072EC5EE7F791ED72A8077F489BC080C41EA1D59944B3F17A3C`；未配置代码签名 |
| `npm run package:win`（最后重跑） | BLOCKED | electron-builder 外部下载阶段 `connect ETIMEDOUT 20.205.243.166:443`；保留前一成功产物，未把重跑超时写成构建通过 |
| `npm audit --registry=https://registry.npmjs.org --omit=optional --audit-level=moderate` | PASS | 官方 npm registry 返回 `found 0 vulnerabilities` |
| 默认镜像 `npm audit --omit=optional --audit-level=moderate` | BLOCKED | `registry.npmmirror.com` 的 security endpoint 返回 404；不把镜像故障当作漏洞扫描结果 |
| 真实远程 Actions/Release | NOT RUN | 本轮未提交、推送、打标签或发布 |
| iOS/macOS 原生构建 | BLOCKED | 当前环境为 Windows，无 Xcode/macOS |

## 9. 后续方向

优先完成 `UPGRADE_ROADMAP.md` 中的更新器超时/取消、单实例锁、注册表构建门禁、批处理暂停恢复、工具级输入限制和真实安装回滚演练；再把 Electron desktop smoke 与浏览器 smoke 接入质量工作流，最后在有证书和远程权限时验证签名发布与旧版本升级。
