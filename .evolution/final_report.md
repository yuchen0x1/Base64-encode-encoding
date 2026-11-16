# 极客工具箱自动更新接入与项目演进报告

日期：2026-11-13（Asia/Shanghai）  
项目：`geek-toolbox` / `极客工具箱`  
仓库：`https://github.com/yuchen0x1/Base64-encode-encoding.git`  
分支：`main`（本地 `main` 跟踪 `origin/main`；本轮未提交、未推送）  
范围：当前单项目工作区；保留用户已有未提交修改。

## 1. 项目与方案

- 技术栈：Vue 3 + Vite 8，Electron 45，Capacitor 8，Node.js 静态/更新服务。
- 桌面更新：使用现有 Electron 主进程更新链路，发布一个 Windows NSIS 安装包作为更新载体。
- 网页更新：继续使用 `server/serve.js` 的版本清单、SHA-256 校验、替换和回滚流程。
- 发布渠道：GitHub Releases；只有 `vMAJOR.MINOR.PATCH` 标签触发发布工作流。
- 分支策略：构建、质量门禁和文档统一面向 `main`；仓库本地 Git 默认分支与推送策略已设置为 `main`。

## 2. 自动更新实际改造

### Electron

- 启动后自动检查，支持手动检查、真实下载进度、稍后更新和安装重启。
- HTTP 下载失败最多重试 3 次；已有临时文件且服务端支持 `Range` 时从断点继续。
- 下载完成后检查声明大小并计算 SHA-256；验证失败不进入安装流程，并清理临时包。
- 更新清单可选 `package.signature` Authenticode 元数据。Windows 客户端会调用 `Get-AuthenticodeSignature`，状态不是 `Valid` 或指纹不匹配时拒绝安装。
- 签名路径通过环境变量传入 PowerShell，兼容包含空格的安装包路径。

### 发布与工作流

- `.github/workflows/quality.yml`：`main` push、面向 `main` 的 PR 和手动触发，运行 `npm ci`、测试、lint、Vite 构建。
- `.github/workflows/release.yml`：`v*.*.*` 标签或手动输入已有标签；检查标签和 `package.json` 版本一致，构建 Windows 安装包，生成网页/桌面更新清单并创建 GitHub Release；同标签重跑会更新同名资产。
- 当 `WINDOWS_AUTHENTICODE_THUMBPRINT` 存在时，工作流在生成清单前验证安装包真实 Authenticode 状态和指纹；未配置时会明确允许未签名发布，清单不伪造签名字段。
- `.github/workflows/build-all.yml` 已收敛为只响应 `main`。

### 文档和测试

- 新增 `docs/AUTO_UPDATE.md`，说明更新源格式、Secrets、发布命令、校验、回滚和平台限制。
- 新增 HTTP 中断重试与 `Range` 续传单测；签名元数据验证单测继续保留。

## 3. 验证结果

| 检查 | 状态 | 证据 |
|---|---|---|
| Vitest | **PASS** | 21 个测试文件、131 个测试通过 |
| ESLint | **PASS（有既有警告）** | 0 errors；10 个 `vue/no-side-effects-in-computed-properties` warning |
| Vite build | **PASS** | Vite 8.3.6 构建成功 |
| Node 语法检查 | **PASS** | `scripts/release.mjs`、`electron/updater.js`、`electron/update-validation.js` |
| GitHub Actions YAML | **PASS** | 3 份工作流通过 PyYAML 解析 |
| 下载恢复 | **PASS** | 模拟中断后使用 `Range: bytes=5-` 续传，大小和 SHA-256 匹配 |
| 浏览器 smoke | **PASS** | 桌面 1440×900、移动 390×844；无页面/控制台错误 |
| GitHub Actions 真实运行 | **NOT RUN** | 本轮没有提交、推送或触发远程工作流 |
| Authenticode 签名发布 | **BLOCKED** | 取决于 Windows 证书和 GitHub Secrets；工作流验证步骤已接入 |
| iOS/macOS 原生构建 | **BLOCKED** | 当前环境为 Windows，需要 macOS/Xcode |

## 4. 当前未完成事项

1. 配置 GitHub Secrets：`WINDOWS_CSC_LINK`、`WINDOWS_CSC_KEY_PASSWORD`；需要签名清单时再配置 `WINDOWS_AUTHENTICODE_THUMBPRINT` 和可匹配的 `WINDOWS_AUTHENTICODE_SUBJECT`。
2. 将准备好的变更由维护者提交到 `main`，推送后观察 `quality.yml`；打版本时创建与 `package.json` 一致的 `v0.0.3` 或后续语义化标签。
3. 在隔离安装目录验证真实 Electron 安装替换、重启和失败回滚；这一步不能由当前 Windows 工作区测试替代。
4. 运行 macOS/Xcode 和 Android release 签名构建。

## 5. 结论

自动更新代码、更新清单、完整性校验、下载恢复、安装链路、文档和 GitHub Actions 配置已经接入当前项目，并完成本地可执行验证。真实 GitHub Release、证书签名、原生平台构建和真实安装重启仍需要外部凭据或对应运行环境；本轮没有把这些外部结果伪报为已完成。