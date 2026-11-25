# Windows 自动更新说明

本文适用于 Windows x64 Electron 安装版。命令行版通过[独立的版本查询](CLI.md)更新。

## 版本与产物

版本取 `package.json` 的 `MAJOR.MINOR.PATCH`，Git 标签为 `vX.Y.Z`。本地发布脚本只生成两个文件：

```text
updates/desktop/version.json
updates/desktop/GeekToolbox-Setup-X.Y.Z.exe
```

清单包含 `version`、`channel`、`buildTime`、`releaseDate`、`notes`、`kind: "nsis"`、`platform: "win32"`、`arch: "x64"` 以及 `package.url`、`package.sha256`、`package.size`。

SHA-256 为安装包的真实摘要，缺失、格式非法或下载内容不一致时拒绝更新。发布时同时提供 SHA-256 校验文件和 GitHub Release Attestation，用于核验资产完整性与发布来源。

## 构建与发布

在 Windows 上使用 Node.js 22 或更高版本、已有 npm 依赖和 7-Zip：

```sh
npm run release
```

`npm run release:desktop` 保留为同一命令的兼容入口。脚本先构建界面，再构建 Windows x64 NSIS 安装包，验证外层归档和内嵌载荷，最后写入桌面更新目录。可使用 `TOOLBOX_7Z` 指定 `7z.exe`。

可复用已构建的安装包：

```sh
npm run release -- --skip-build --installer "release/GeekToolbox-Setup-0.0.6.exe"
```

`--skip-build` 仍会核对 `dist/version.json` 与目标版本一致。`--version X.Y.Z` 或 `--bump patch` 会修改本地包版本；正式发版前还需同步 `release-notes.json` 和发布说明。清理维护范围时不应擅自发版或覆盖现有标签。

云同步目录可能干扰大文件写入，可使用 `--out` 将 electron-builder 输出放到本地磁盘。安装包完整性校验不应跳过；兼容 `app-64.7z` 和 `resources/app.asar` 两种 NSIS 载荷结构。

本地脚本不会上传 GitHub。GitHub Actions 配置为：

- `quality.yml`：Windows 上执行 `npm ci`、测试、lint 和渲染界面构建。
- `build-all.yml`：仅构建和保存 Windows NSIS 安装包。
- `release.yml`：校验标签和版本、构建、测试三系统 CLI、验证独立助手与 NSIS 生命周期、发布安装包、桌面清单、CLI 和 SHA-256 校验文件。

发布工作流检查标签与 `package.json` 版本完全一致；普通 push / PR 不会创建 Release。已发布历史版本的网页资产不由本次代码清理远程删除。

## 更新源

按以下顺序选择：

1. 环境变量 `TOOLBOX_UPDATE_FEED`。
2. 安装目录 `update-config.json` 的 `feed`。
3. 打包应用默认使用 GitHub Releases API 和该稳定标签的下载清单。开发环境默认读取项目的 `updates/desktop/`。

GitHub API 遇到匿名请求限流（HTTP 403 或 429）时，打包版回退到同一 Release 的 `latest/download/version.json`，避免限流导致无法检查更新。回退路径仍使用 HTTPS，并继续执行清单、安装包类型、大小和 SHA-256 校验；API 恢复后会自动回到带 Release 资产摘要核对的路径。

Windows 安装版启动约 4 秒后检查一次，用户也可以点击侧边栏版本号手动检查。选择 24 小时后提醒时，当前候选版本的自动弹窗会延后。打包应用先核对官方清单摘要、稳定版本、资产名、字节数和安装包摘要。备用源的安装包必须匹配这些记录。

v0.1.2 引入 Electron `net.request` 手动重定向适配时，返回对象漏掉 Fetch 的 `json()` 方法，导致打包版在解析 GitHub Releases API 时失败。v0.1.3 补齐 JSON 消费，同时保留手动重定向校验和流式下载。由于已安装的 v0.1.2 二进制自身无法执行更新检查，它不能自动发现 v0.1.3；v0.1.2 用户需从 [GitHub Releases](https://github.com/yuchen0x1/Base64-encode-encoding/releases/latest) 手动下载 v0.1.3 并覆盖安装一次。用户数据位于安装目录之外。修复后的 v0.1.3 会继续检查后续稳定版。

回归测试通过 Electron `net.request` 模拟 GitHub Releases API 和 `version.json` 响应，确认新版本可被发现；这验证当前代码路径，不等同于真实 v0.1.2 二进制的联网 UI 自动升级验收。v0.1.2 用户需要的这次手动覆盖安装是已知且明确的升级限制。

### 中国大陆下载线路

打包版对公开 GitHub Release 安装包采用“官方优先、探测评分后选择代理”的运行时策略。官方资产 URL 连续失败，或在两个连续的低速窗口（每个 3 秒、低于 64 KiB/s，且已传输至少 256 KiB）内持续低速时，客户端会删除跨线路的临时分片，并并发对 `https://gh-proxy.org/` 和 `https://ghproxy.net/` 发起最多 64 KiB 的 Range 探测；只有响应状态、Content-Range、总大小和实际字节数都匹配的线路才获得有效分数。分数按 `探测字节数 / (耗时 + 250 ms)` 计算，优先尝试分数较高的线路；探测失败的线路保留在已测线路之后继续尝试。小于 1 MiB 或未声明可信包体大小的安装包跳过探测，并按稳定的默认顺序兜底。下载中所选线路再次失败时，会继续尝试其他线路；跨线路不复用分片。

代理只接收已经由 GitHub Release 清单核对过的公开 `.exe` 资产，不参与版本清单、SHA-256、签名或版本选择，也不会携带 GitHub Token、`Authorization`、Cookie 或其他用户数据。探测只衡量真实 Range 传输速度与响应时间，不使用 Ping；探测内容会丢弃，不作为安装包或校验依据。

GH-Proxy 文档声明 Release 资产支持 GitHub 重定向和 Range 续传，但未给出 ETag/`If-Range` 或服务可用性保证。备用 `ghproxy.net` 在当前开发环境对 v0.1.1 安装包返回了匹配的 Range 响应；这不证明其大陆可用性或长期 SLA。客户端严格检查 HTTPS、响应大小、SHA-256，并在每一跳发出前将重定向目标限制在 GitHub 官方/CDN、当前代理主机或自定义源原主机范围内；续传响应还必须匹配 `Content-Range` 起点和总大小。跨线路不复用部分文件，校验失败禁止安装。未将 Range/服务行为未经核验的其他域名加入候选。

本地自动化测试覆盖官方失败后切换、代理 Range 探测和动态评分选线、无凭据代理请求、低速窗口滞回、下载 Range 响应校验和跨线路清理。测试使用模拟响应；没有中国大陆真实网络环境时，不将这些结果表述为大陆实网测速或 SLA 证明。

本轮另从当前开发环境对 v0.1.1 公开安装包做了真实 HTTP Range 请求：GitHub 官方地址经 302 到 `release-assets.githubusercontent.com`、`gh-proxy.org` 和 `ghproxy.net` 均返回 `206 bytes 0-1023/111898806`；额外探测的 `ghfast.top` 连接失败，因此未加入。该结果是当前环境的线路协议核验，不代表中国大陆速度或稳定性测试。

## 客户端流程

1. 比较版本，不对更旧的版本触发更新。
2. 下载到 `userData/updates/`；HTTP 下载最多三次重试，服务器支持 Range 时继续已有临时文件。
3. 展示下载速度与进度，核验安装包大小和 SHA-256。
4. 准备安装目录之外的独立助手运行时，包含 ICU 与 V8 启动数据。
5. 可用空间和网络许可时，安装前从官方 Release 准备当前版本安装包并核对 SHA-256。助手通过专用 IPC 确认就绪后，当前应用才退出。
6. 助手重新核对摘要，等待旧进程释放文件，执行 NSIS 覆盖安装，核验目标 EXE 和 ASAR 版本，启动新版。锁定超时时保留当前安装；安装失败时重试或进入交互安装。

**v0.0.4 / v0.0.5 用户须先手动覆盖安装 v0.0.7 一次。** 若 v0.0.8 窗口空白，直接手动覆盖安装 v0.0.9。用户数据位于安装目录之外。详见[故障复盘](UPDATER_INCIDENT_2026-11-13.md)。

## 失败恢复

连续安装后目标 EXE 与 ASAR 仍未通过检查时，助手尝试运行已准备并重新通过摘要校验的旧安装包。恢复后核对旧版本并重新启动。下载安装前置条件不足或恢复失败时进入交互式修复。查看用户数据目录下 `updates/install.log` 和失败标记。需要人工修复时，关闭工具箱，保留用户数据和工作区，再选择 [Releases](https://github.com/yuchen0x1/Base64-encode-encoding/releases) 上的对应安装器。

## 检查与验收边界

```sh
npm test
npm run lint
npm run test:desktop
npm run test:updater
```

更新检查位于 `tests/updater.test.js`、`tests/useUpdater.test.js`、`tests/update-validation.test.js`、`tests/apply-installer.test.js`、`tests/installer-verification.test.js`、`tests/installer-bootstrap.test.js` 和 `tests/updater-handshake.test.js`。

`test:desktop` 验证 Electron 沙箱内的界面和 Worker，`test:updater` 验证独立助手真实启动与失败保护，二者均不执行安装器。必须分别报告构建、实际安装和完整自动更新结果；只有旧客户端实际发现、校验、安装并启动新版本，才能标记自动更新端到端通过。
